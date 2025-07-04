# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class SuamSellingPrice(Document):
    def on_submit(self):
        item_price_created = False

        if not self.region:
            frappe.throw("Please select a Region before submitting.")

        # Fetch all price lists linked to the selected region (Territory)
        price_lists = frappe.get_all(
            'Territory Price Lists',
            filters={'parent': self.region},
            fields=['price_list']
        )

        if not price_lists:
            frappe.throw(f"No price lists configured for Region: {self.region}")

        for row in self.selling_price_details:
            for price_list_row in price_lists:
                price_list_name = price_list_row.price_list

                # Convert price list name to field name (e.g., "Retail Selling" => "retail_selling_price")
                field_key = frappe.scrub(price_list_name) + "_price"
                rate = row.get(field_key)

                if rate is None:
                    frappe.msgprint(f"Skipping '{price_list_name}' for item '{row.item_code}': No rate found in field '{field_key}'")
                    continue

                # Check if Item Price already exists for the same combination
                existing_price = frappe.db.exists(
                    'Item Price',
                    {
                        'item_code': row.item_code,
                        'price_list': price_list_name,
                        'valid_from': self.posting_date,
                        'custom_suam_selling_price': self.name,
                    }
                )

                if not existing_price:
                    item_price = frappe.get_doc({
                        'doctype': 'Item Price',
                        'item_code': row.item_code,
                        'price_list': price_list_name,
                        'price_list_rate': rate,
                        'valid_from': self.posting_date,
                        'custom_suam_selling_price': self.name
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
            'custom_suam_selling_price': self.name
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
def get_available_stock_entries(doctype, txt, searchfield, start, page_len, filters):
    used_entries = frappe.get_all(
        'Suam Selling Price',
        filters={'stock_entry': ['!=', None]},
        pluck='stock_entry'
    )

    stock_entries = frappe.get_all(
        'Stock Entry',
        filters={
            'docstatus': 1,
            'name': ['not in', used_entries],
            'stock_entry_type': 'Material Transfer'
        },
        fields=['name'],
        as_list=True
    )

    return stock_entries


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
                i.name AS item_code,
                i.item_name,
                i.brand,
                i.stock_uom,
                bin.warehouse,
                bin.actual_qty,
                bin.valuation_rate
            FROM
                `tabItem` i
            JOIN
                `tabBin` bin ON bin.item_code = i.name
            WHERE
                i.disabled = 0
                AND i.is_stock_item = 1
                AND {sql_column_name} LIKE %s
            ORDER BY
                i.name, bin.warehouse;
        """, ("%%",), as_dict=True)

    return items