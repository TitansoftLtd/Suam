# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import nowdate

class SuamCommission(Document):
    def validate(self):
        self.ensure_valid_dates()
        self.check_date_overlap()

        # Check if commission table is empty
        if not self.commission:
            frappe.throw(_("Cannot save record without commissions."))

    def ensure_valid_dates(self):
        if not self.from_date or not self.to_date:
            frappe.throw(_("Please fill From Date and To Date."))

        if self.from_date > self.to_date:
            frappe.throw(_("From Date cannot be after To Date."))

    def check_date_overlap(self):
        overlapping_records = frappe.db.sql("""
            SELECT
                name, from_date, to_date
            FROM
                `tabSuam Commission`
            WHERE
                docstatus < 2
                AND name != %s
                AND (
                    (from_date <= %s AND to_date >= %s)
                    OR
                    (from_date <= %s AND to_date >= %s)
                    OR
                    (from_date >= %s AND to_date <= %s)
                )
        """, (
            self.name, self.from_date, self.from_date,
            self.to_date, self.to_date,
            self.from_date, self.to_date
        ), as_dict=True)

        if overlapping_records:
            overlapping_details = "<ul>" + "".join([
                f"<li><a href='/app/suam-commission/{record['name']}' target='_blank'>{record['name']}</a>: {record['from_date']} to {record['to_date']}</li>"
                for record in overlapping_records
            ]) + "</ul>"
            frappe.throw(_("Date range overlaps with the following existing Kimzone Commission records:{0}").format(overlapping_details), title=_("Overlapping Records Found"))
    
    def on_cancel(self):
        if self.payment_entry:
            try:
                pe = frappe.get_doc("Payment Entry", self.payment_entry)
                if pe.docstatus == 1:
                    pe.cancel()
                    frappe.msgprint(f"Linked Payment Entry {pe.name} has been cancelled.")
            except frappe.DoesNotExistError:
                frappe.msgprint(f"Payment Entry {self.payment_entry} not found.")
            except frappe.PermissionError:
                frappe.throw("You do not have permission to cancel the linked Payment Entry.")

@frappe.whitelist()
def fetch_and_consolidate_commissions(self):
    sales_invoices = frappe.db.sql("""
        SELECT
            name,
            custom_kimzone_sales_partner AS sales_partner,
            custom_mobile_no AS mobile_no,
            grand_total AS sales_amount,
            custom_cost_of_sales AS cost_of_sales,
            custom_proposed_commission AS proposed_commission,
            custom_sales_partner AS sales_partner
        FROM
            `tabSales Invoice`
        WHERE
            posting_date BETWEEN %s AND %s
            AND docstatus = 1
            AND custom_kimzone_sales_partner IS NOT NULL
    """, (self.from_date, self.to_date), as_dict=True)

    if not sales_invoices:
        frappe.msgprint(_("No Sales Invoices found in the date range."))
        return

    # Clear existing commissions
    self.set('commission', [])

    for invoice in sales_invoices:
        self.append('commission', {
            'sales_invoice': invoice.name,
            'sales_partner': invoice.sales_partner,
            'mobile_no': invoice.mobile_no,
            'sales_amount': invoice.sales_amount,
            'cost_of_sales': invoice.cost_of_sales,
            'proposed_commission': invoice.proposed_commission,
            'sales_person': invoice.sales_person,
            'amount_eligible_for_commission': invoice.sales_amount - invoice.cost_of_sales
        })

    frappe.msgprint(_("{0} commission record fetched for the period.").format(len(sales_invoices)))
    self.save()

@frappe.whitelist()
def create_payment_entry_for_commission(commission_name, mode_of_payment):
    commission = frappe.get_doc("Suam Commission", commission_name)

    commission_account = frappe.db.get_single_value("Suam Settings", "commission_account")
    if not commission_account:
        frappe.throw(_("No Commission Account set in Suam Settings"))

    default_account = frappe.db.get_value(
        "Mode of Payment Account",
        {
            "parent": mode_of_payment,
            "company": commission.company
        },
        "default_account"
    )
    if not default_account:
        frappe.throw(_("No default account found for Mode of Payment in this company"))

    cost_center = frappe.get_value("Company", commission.company, "cost_center")
    if not cost_center:
        frappe.throw(f"No default Cost Center set for company {commission.company}.")

    payment_entry = frappe.get_doc({
        "doctype": "Payment Entry",
        "posting_date": nowdate(),
        "company": commission.company,
        "payment_type": "Internal Transfer",
        "mode_of_payment": mode_of_payment,
        "paid_amount": commission.total,
        "received_amount": commission.total,
        "paid_from": default_account,
        "paid_to": commission_account,
        "cost_center": cost_center,
        "reference_no": "Suam Commission",
        "custom_kimzone_commission": commission.name,
        "reference_date": nowdate(),
        "remarks": f"Payment for Suam Commission: {commission.name}"
    })

    payment_entry.insert(ignore_permissions=True)
    payment_entry.submit()
    # update the commission with the payment reference
    commission.db_set("payment_entry", payment_entry.name)

    return payment_entry.name

