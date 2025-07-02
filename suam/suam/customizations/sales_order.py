import frappe
from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

def on_submit(doc, method):
    """
    Create a Delivery Note when a Sales Order is submitted.
    This function checks if the Sales Order has not been delivered yet.
    """
    # Ensure document is actually submitted
    if doc.docstatus != 1:
        return

    # Only create Delivery Note if nothing has been delivered yet
    if doc.per_delivered < 0.01:
        dn = make_delivery_note(doc.name)
        dn.insert(ignore_permissions=True)
        dn.submit()

        frappe.msgprint(f"Delivery Note <a href='/app/delivery-note/{dn.name}'>{dn.name}</a> created.")