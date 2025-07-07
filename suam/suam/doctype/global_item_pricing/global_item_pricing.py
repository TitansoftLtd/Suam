# Copyright (c) 2025, Team Web Africa and contributors
# For license information, please see license.txt

import frappe
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
                        'valid_from': self.valid_from,
                        'custom_suam_selling_price': self.name,
                    }
                )

                if not existing_price:
                    item_price = frappe.get_doc({
                        'doctype': 'Item Price',
                        'item_code': row.item_code,
                        'price_list': price_list_name,
                        'price_list_rate': rate,
                        'valid_from': self.valid_from,
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
        'Global Item Pricing',
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
def get_filtered_items(region, search_by=None,):
    """
    Fetch active stock items where the item's warehouse is under the
    parent warehouse set on the given territory (region).
    """
    if not region:
        frappe.throw("Region is required.")
    
    if search_by not in ['item_code', 'brand']:
        frappe.throw(frappe._("Invalid search criteria. Search can only be by 'Item Code' or 'Brand'."))

    # Get the parent warehouse from the Territory
    parent_warehouse = frappe.db.get_value("Territory", region, "custom_parent_warehouse")
    if not parent_warehouse:
        frappe.throw(f"No parent warehouse found for region {region}")

    # Define which column to filter by
    sql_column_name = "i.name" if search_by == 'item_code' else "i.brand"

    # Query items with bins in warehouses under the parent warehouse
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
        JOIN
            `tabWarehouse` w ON w.name = bin.warehouse
        WHERE
            i.disabled = 0
            AND i.is_stock_item = 1
            AND {sql_column_name} LIKE %s
            AND w.parent_warehouse = %s
        ORDER BY
            i.name, bin.warehouse
    """, ("%%", parent_warehouse), as_dict=True)

    return items

@frappe.whitelist()
def get_items_based_on(brand=None, item_group=None):
    """
    Fetches all active stock items based on brand or item group.
    """

    filters = []
    values = []

    if brand:
        filters.append("i.brand = %s")
        values.append(brand)

    if item_group:
        filters.append("i.item_group = %s")
        values.append(item_group)

    filter_clause = " AND ".join(filters)
    if filter_clause:
        filter_clause = "AND " + filter_clause

    available_items = frappe.db.sql(f"""
        SELECT
            b.item AS item_code,
            i.item_name,
            i.brand,
            i.item_group,
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
            {filter_clause}
        ORDER BY
            b.item, bin.warehouse, b.name;
    """, values, as_dict=True)

    return available_items

@frappe.whitelist()
def get_standard_buying_price_based_on(brand=None, item_group=None, price_list=None):
	"""
	Fetches standard buying prices for items that match the given brand/item group,
	price list, and includes batch information.
	"""
	if not price_list:
		frappe.throw("Price List is required.")

	conditions = [
		"i.disabled = 0",
		"i.is_stock_item = 1",
		"ip.price_list = %s"
	]
	values = [price_list]

	if brand and item_group:
		conditions.append("((i.brand = %s AND ip.brand = %s) OR i.item_group = %s)")
		values.extend([brand, brand, item_group])
	elif brand:
		conditions.append("i.brand = %s AND ip.brand = %s")
		values.extend([brand, brand])
	elif item_group:
		conditions.append("i.item_group = %s")
		values.append(item_group)
	else:
		frappe.throw("Please provide Brand or Item Group to filter items.")

	where_clause = " AND ".join(conditions)

	query = f"""
		SELECT
			i.name AS item_code,
			i.item_name,
			ip.price_list_rate AS valuation_rate,
			i.stock_uom,
			b.name AS batch_no
		FROM
			`tabItem` i
		INNER JOIN
			`tabItem Price` ip ON ip.item_code = i.name
		LEFT JOIN
			`tabBatch` b ON b.item = i.name
		WHERE {where_clause}
		ORDER BY i.name, b.creation DESC
	"""

	return frappe.db.sql(query, values, as_dict=True)
