# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from collections import defaultdict

class CashierClosingEntry(Document):
    def on_submit(self):
        # create Stock Take passing All warehouses
        self.create_stock_take()

    def create_stock_take(self):
        # Fetch all warehouses where is_group is 0 and disabled is 0
        warehouses = frappe.get_all(
            "Warehouse",
            filters={"is_group": 0, "disabled": 0, "company": self.company},
            fields=["name"]
        )

        # Create a Stock Take document for each warehouse
        stock_take_names = []
        for warehouse in warehouses:
            stock_take = frappe.new_doc("Stock Take")
            stock_take.company = self.company
            stock_take.closing_date = self.posting_date
            stock_take.cashier_closing_entry = self.name
            stock_take.warehouse = warehouse["name"]

            # Save the Stock Take document
            stock_take.insert()
            stock_take_names.append(stock_take.name)

        return stock_take_names
        

@frappe.whitelist()
def fetch_sales_invoices(posting_date, company):
    if not posting_date:
        frappe.throw("Posting Date is required.")
    if not company:
        frappe.throw("Company is required.")

    # Fetch submitted Sales Invoices based on Company and Posting Date
    sales_invoices = frappe.get_all(
        "Sales Invoice",
        filters={
            "posting_date": posting_date,
            "company": company,
            "docstatus": 1
        },
        order_by="posting_time ASC",
        fields=[
            "name", "custom_prepared_by", "grand_total", "net_total", 
            "total_taxes_and_charges", "outstanding_amount", "is_return", "return_against", 
            "posting_date", "customer", "total_qty", "custom_cu_invoice_number"
        ]
    )

    if not sales_invoices:
        return {"status": "error", "message": "No sales invoices found for the selected date."}

    # Fetch all payments from Sales Invoice Payment table
    sales_invoice_names = [inv["name"] for inv in sales_invoices]
    payments = frappe.get_all(
        "Sales Invoice Payment",
        filters={"parent": ["in", sales_invoice_names]},
        fields=["parent", "mode_of_payment", "amount"]
    )

    # Fetch all Payment Entries with "Receive" type, submitted, for these invoices
    payment_entries = frappe.get_all(
        "Payment Entry Reference",
        filters={
            "reference_doctype": "Sales Invoice",
            "reference_name": ["in", sales_invoice_names]
        },
        fields=["parent", "allocated_amount"]
    )

    # Get all Payment Entry docs with payment_type "Receive" and docstatus 1
    pe_names = list(set([pe["parent"] for pe in payment_entries]))
    pe_docs = []
    pe_mode_map = {}
    if pe_names:
        pe_docs = frappe.get_all(
            "Payment Entry",
            filters={
                "name": ["in", pe_names],
                "payment_type": "Receive",
                "docstatus": 1
            },
            fields=["name", "mode_of_payment"]
        )
        pe_mode_map = {pe["name"]: pe["mode_of_payment"] for pe in pe_docs}

    # Only include payment entries with payment_type "Receive"
    for pe_ref in payment_entries:
        mode = pe_mode_map.get(pe_ref["parent"])
        if mode:
            payments.append({
                "parent": pe_ref["parent"],
                "mode_of_payment": mode,
                "amount": pe_ref["allocated_amount"]
            })

    # Also include all Payment Entries with "Receive" type, submitted, for this company and posting_date
    extra_pe = frappe.get_all(
        "Payment Entry",
        filters={
            "payment_type": "Receive",
            "docstatus": 1,
            "company": company,
            "posting_date": posting_date
        },
        fields=["name", "mode_of_payment", "paid_amount"]
    )

    # Avoid double-counting
    existing = set((p["parent"], p["mode_of_payment"], float(p["amount"])) for p in payments)
    for pe in extra_pe:
        key = (pe["name"], pe["mode_of_payment"], float(pe["paid_amount"]))
        if key not in existing:
            payments.append({
                "parent": pe["name"],
                "mode_of_payment": pe["mode_of_payment"],
                "amount": pe["paid_amount"]
            })

    # Process payment data
    from collections import defaultdict
    mode_of_payment_totals = defaultdict(float)
    for payment in payments:
        mode_of_payment_totals[payment["mode_of_payment"]] += payment["amount"]

    # NEW: Adjust Cash mode_of_payment from Internal Transfers
    internal_transfers = frappe.get_all(
        "Payment Entry",
        filters={
            "payment_type": "Internal Transfer",
            "docstatus": 1,
            "company": company,
            "posting_date": posting_date
        },
        fields=["name", "paid_from", "paid_to", "paid_amount"]
    )

    for transfer in internal_transfers:
        if transfer.paid_from == "Cash Sales - KASL":
            # Deduct from Cash
            mode_of_payment_totals["Cash"] -= transfer.paid_amount
        elif transfer.paid_to == "Cash Sales - KASL":
            # Add to Cash
            mode_of_payment_totals["Cash"] += transfer.paid_amount

    # Rebuild payment reconciliation after internal transfers
    payment_reconciliation = [
        {"mode_of_payment": mode, "expected_amount": total}
        for mode, total in mode_of_payment_totals.items()
    ]

    # Initialize totals
    totals = {
        "grand_total": 0,
        "net_total": 0,
        "tax": 0,
        "outstanding_amount": 0,
        "total_qty": 0,
        "no_of_invoices": len(sales_invoices),
        "grand_total_declared": 0,
        "net_total_declared": 0,
        "grand_total_not_declared": 0,
        "net_total_not_declared": 0,
    }

    # Calculate totals and separate declared vs non-declared invoices
    for inv in sales_invoices:
        totals["grand_total"] += inv["grand_total"] or 0
        totals["net_total"] += inv["net_total"] or 0
        totals["tax"] += inv["total_taxes_and_charges"] or 0
        totals["outstanding_amount"] += inv["outstanding_amount"] or 0
        totals["total_qty"] += inv["total_qty"] or 0

        if inv.get("etr_invoice_number"):
            totals["grand_total_declared"] += inv["grand_total"] or 0
            totals["net_total_declared"] += inv["net_total"] or 0
        else:
            totals["grand_total_not_declared"] += inv["grand_total"] or 0
            totals["net_total_not_declared"] += inv["net_total"] or 0

    return {
        "status": "success",
        "sales_transactions": sales_invoices,
        "payment_reconciliation": payment_reconciliation,
        "totals": totals
    }
