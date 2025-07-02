# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class SuamSellingPrice(Document):
    def on_submit(self):
        item_price_created = False

        for row in self.selling_price_details:

            for price_list_name, price in [
                ('Minimum Selling', row.minimum_selling_price),
                ('Retail Selling', row.retail_selling_price),
            ]:
                # Check if Item Price already exists for the same combination
                existing_price = frappe.db.exists(
                    'Item Price',
                    {
                        'item_code': row.item_code,
                        'price_list': price_list_name,
                        'batch_no': row.batch_no,
                        'valid_from': self.receipt_date,
                        'custom_kimzone_selling_price': self.name,
                    }
                )

                if not existing_price:
                    # Create new Item Price
                    item_price = frappe.get_doc({
                        'doctype': 'Item Price',
                        'item_code': row.item_code,
                        'price_list': price_list_name,
                        'price_list_rate': price,
                        'batch_no': row.batch_no,
                        'valid_from': self.receipt_date,
                        'custom_kimzone_selling_price': self.name
                    })
                    item_price.insert(ignore_permissions=True)
                    item_price_created = True

        if item_price_created:
            frappe.msgprint(
                msg="Item Prices created successfully.",
                title="Success",
                indicator="green"
            )

    def on_cancel(self):
        deleted = False
        # Get all Item Prices linked to this document
        item_prices = frappe.get_all('Item Price', filters={
            'custom_kimzone_selling_price': self.name
        }, fields=['name'])

        for price in item_prices:
            frappe.delete_doc('Item Price', price.name, ignore_permissions=True)
            deleted = True

        if deleted:
            frappe.msgprint(
                msg="Linked Item Prices deleted successfully.",
                title="Success",
                indicator="green"
            )

@frappe.whitelist()
def get_available_purchase_receipts(doctype, txt, searchfield, start, page_len, filters):
    used_receipts = frappe.get_all(
        'Suam Selling Price',
        filters={'purchase_receipt': ['!=', None]},
        pluck='purchase_receipt'
    )

    receipts = frappe.get_all(
        'Purchase Receipt',
        filters={
            'docstatus': 1,
            'name': ['not in', used_receipts]
        },
        fields=['name', 'supplier'],
        as_list=True
    )

    return receipts

@frappe.whitelist()
def get_filtered_items(search_by=None):
    """
    Fetches all active stock items. The 'search_by' parameter determines
    which column is conceptually focused, and a LIKE '%%' is applied to it,
    effectively retrieving all items matching the core criteria.
    """
    if search_by not in ['item_code', 'brand']:
        frappe.throw(frappe._("Invalid search criteria. Search can only be by 'Item Code' or 'Brand'."))

    # Determine the specific column name in the database
    if search_by == 'item_code':
        sql_column_name = "i.name"
    elif search_by == 'brand':
        sql_column_name = "i.brand"

    items = frappe.db.sql(f"""
       SELECT
            b.item AS item_code,
            i.item_name,
            i.brand,
            i.stock_uom,
            bin.warehouse,
            bin.actual_qty,
            bin.valuation_rate,
            b.name AS batch_no
        FROM
            `tabBatch` b
        JOIN
            `tabItem` i ON b.item = i.name
        JOIN
            `tabBin` bin ON bin.item_code = b.item 
        WHERE
            i.disabled = 0
            AND i.is_stock_item = 1
            AND {sql_column_name} LIKE %s
        ORDER BY
            b.item, bin.warehouse, b.name;
    """, ("%%",), as_dict=True)

    return items