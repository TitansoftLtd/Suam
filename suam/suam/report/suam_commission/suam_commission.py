# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.query_builder import DocType
from frappe.query_builder.functions import Coalesce
from frappe import _

def execute(filters=None):
    if not filters:
        filters = {}

    # Validate date range
    if filters.get("from_date") and filters.get("to_date"):
        if filters["to_date"] < filters["from_date"]:
            frappe.throw(_("To Date cannot be before From Date: {0}").format(filters["to_date"]))

    KC = DocType("Suam Commission")
    KCD = DocType("Suam Commission Details")

    query = (
        frappe.qb.from_(KC)
        .join(KCD).on(KCD.parent == KC.name)
        .select(
            KC.company,
            KC.name.as_("name"),
            KC.posting_date,
            KCD.sales_person,
            KCD.sales_partner,
            KCD.mobile_no,
            KCD.national_id,
            KCD.sales_invoice,
            KCD.sales_amount,
            KCD.cost_of_sales,
            KCD.amount_eligible_for_commission,
            KCD.calculated_commission,
            KCD.proposed_commission,
            KCD.approved_commission,
        )
    )

    if filters.get("from_date"):
        query = query.where(KC.posting_date >= filters["from_date"])

    if filters.get("to_date"):
        query = query.where(KC.posting_date <= filters["to_date"])

    if filters.get("company"):
        query = query.where(KC.company == filters["company"])

    if filters.get("sales_partner"):
        query = query.where(KCD.sales_partner == filters["sales_partner"])

    if filters.get("sales_person"):
        query = query.where(KCD.sales_person == filters["sales_person"])

    if filters.get("mobile_no"):
        query = query.where(KCD.mobile_no == filters["mobile_no"])

    query = query.orderby(KC.posting_date, order=frappe.qb.desc)

    data = query.run(as_dict=True)

    return get_columns(), data

def get_columns():
    return [
        {"label": "Company", "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 200},
        {"label": "Commission Name", "fieldname": "name", "fieldtype": "Link", "options": "Kimzone Commission", "width": 180},
        {"label": "Posting Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 150},
        {"label": "Sales Partner", "fieldname": "sales_partner", "fieldtype": "Link", "options": "Kimzone Sales Partner", "width": 150},
        {"label": "Mobile No", "fieldname": "mobile_no", "fieldtype": "Data", "width": 120},
        {"label": "National ID", "fieldname": "national_id", "fieldtype": "Data", "width": 100},
        {"label": "Sales Invoice", "fieldname": "sales_invoice", "fieldtype": "Link", "options": "Sales Invoice", "width": 180},
        {"label": "Sales Amount", "fieldname": "sales_amount", "fieldtype": "Currency", "width": 130},
        {"label": "Cost of Sales", "fieldname": "cost_of_sales", "fieldtype": "Currency", "width": 130},
        {"label": "Eligible Amount", "fieldname": "amount_eligible_for_commission", "fieldtype": "Currency", "width": 150},
        {"label": "Calculated Commission", "fieldname": "calculated_commission", "fieldtype": "Currency", "width": 160},
        {"label": "Proposed Commission", "fieldname": "proposed_commission", "fieldtype": "Float", "width": 140},
        {"label": "Approved Commission", "fieldname": "approved_commission", "fieldtype": "Float", "width": 140},
    ]

