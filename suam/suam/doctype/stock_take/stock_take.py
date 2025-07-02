# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, getdate
from frappe.model.document import Document
from erpnext.stock.utils import get_stock_balance
from frappe.model.naming import make_autoname
from datetime import datetime

class StockTake(Document):
    def autoname(self):
        if self.cashier_closing_entry:
            self.name = f"{self.cashier_closing_entry}_{self.warehouse}"
        else:
            today = datetime.today()
            prefix = today.strftime("%d%m%y")
            sequence = make_autoname(f"{prefix}.##")
            self.name = f"{sequence}_{self.warehouse}"

    def validate(self):
        if not self.cashier_closing_entry and not self.warehouse:
            frappe.throw("Warehouse is required when Cashier Closing Entry is not set. Set Warehouse")

@frappe.whitelist()
def get_items(warehouse, posting_date, posting_time, company, closing_date=None, ignore_empty_stock=False):
    ignore_empty_stock = cint(ignore_empty_stock)

    closing_date = getdate(closing_date)

    # Fetch item codes from Dispatch Requisition matching warehouse and date
    item_codes = frappe.db.sql(
        """
        SELECT DISTINCT dd.item_code, dd.item_name
        FROM `tabDispatch Details` dd
        JOIN `tabDispatch` d ON d.name = dd.parent
        WHERE d.company = %s AND d.warehouse = %s AND DATE(d.date) = %s
        """,
        (company, warehouse, closing_date),
        as_dict=True
    )

    if not item_codes:
        return []

    # Ensure item_data is actually a list of dictionaries
    if item_codes and isinstance(item_codes[0], tuple):
        item_codes = [{"item_codes": row[0], "item_name": row[1]} for row in item_codes]

    res = []
    for item in item_codes:
        item_code = item.get("item_code")
        item_name = item.get("item_name")
        try:
            stock_bal = get_stock_balance(
                item_code, warehouse, posting_date, posting_time,
                with_valuation_rate=True, with_serial_no=False
            )
            # stock_bal is a list with [qty, valuation_rate]
            if not stock_bal:
                continue

            qty, valuation_rate = stock_bal[0], stock_bal[1]

            if ignore_empty_stock and not qty:
                continue

            res.append({
                "item_code": item_code,
                "item_name": item_name,
                "warehouse": warehouse,
                "qty": qty,
                "valuation_rate": valuation_rate,
            })
        except Exception as e:
            frappe.logger().error(f"Error fetching stock balance for item {item_code}: {str(e)}")

    frappe.logger().info(f"Total items returned: {len(res)}")
    return res

@frappe.whitelist()
def get_items_from_rack(warehouse, location, posting_date, posting_time, ignore_empty_stock=False):
    ignore_empty_stock = cint(ignore_empty_stock)
    posting_date = getdate(posting_date)

    item_codes = frappe.db.sql(
        """
        SELECT DISTINCT i.item_code, i.item_name
        FROM `tabItem` i
        WHERE i.custom_rack = %s OR i.custom_shelf = %s OR i.custom_bin_location = %s
        """,
        (location, location, location),
        as_dict=True
    )

    if not item_codes:
        return []

    # Ensure item_data is actually a list of dictionaries
    if item_codes and isinstance(item_codes[0], tuple):
        item_codes = [{"item_codes": row[0], "item_name": row[1]} for row in item_codes]


    res = []
    for item in item_codes:
        item_code = item.get("item_code")
        item_name = item.get("item_name")
        try:
            stock_bal = get_stock_balance(
                item_code, warehouse, posting_date, posting_time,
                with_valuation_rate=True, with_serial_no=False
            )
            # Check if stock balance is None or empty
            if not stock_bal:
                continue

            qty, valuation_rate = stock_bal[0], stock_bal[1]

            if ignore_empty_stock and not qty:
                continue

            res.append({
                "item_code": item_code,
                "item_name": item_name,
                "warehouse": warehouse,
                "qty": qty,
                "valuation_rate": valuation_rate,
            })
        except Exception as e:
            frappe.logger().error(f"Error fetching stock balance for item {item_code}: {str(e)}")

    frappe.logger().info(f"Total items returned: {len(res)}")
    return res
