import frappe
from frappe import _

def on_submit(doc, method):
    if not doc.custom_suam_commission:
        print_receipt_automatically(doc, method)

def print_receipt_automatically(doc, method):
    """
    Print Receipt automatically when payment entry is submitted'.
    """
    # Fetch the printer settings document
    prints  = frappe.get_single("Suam Settings")

    printer_name = prints.cashier_printer

    if not printer_name:
        frappe.log_error(f"No printer settings found for printer: {printer_name}", "Receipt Print Error")
        return

    # Call the function directly (No background queue)
    frappe.call(
        "suam.suam.customizations.print_format.print_by_server",
        doctype=doc.doctype,
        name=doc.name,
        printer_setting=printer_name,
        print_format=prints.customer_credit_payment,
        no_letterhead=1
    )