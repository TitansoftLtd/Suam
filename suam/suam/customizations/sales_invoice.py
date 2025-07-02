import frappe
from frappe import _
from suam.suam.customizations.workflow import apply_doc_workflow
from frappe.utils import add_days, nowdate


def on_submit(doc, method):
    # Print Invoice Automatically
    create_and_update_dispatch(doc, method)
    print_invoice_automatically(doc, method)
    
def print_invoice_automatically(doc, method = None):
    """
    Automatically print Sales Invoice with appropriate print format and printer.
    Also prints Gate Pass for non-return part collection sales.
    """
    prints = frappe.get_single("Suam Settings")

    # Required printer settings
    printer_settings = {
        "cashier": prints.cashier_printer,
        "gate_pass": prints.gate_pass_printer
    }

    # Ensure all printers are configured individually
    missing_printers = {k: v for k, v in printer_settings.items() if not v}
    if missing_printers:
        for printer_label, value in missing_printers.items():
            frappe.log_error(
                f"Missing printer configuration for '{printer_label}_printer'. Value: {value}",
                "Printer Setup Error"
            )
        return

    try:
        customer = frappe.get_doc("Customer", doc.customer)
    except frappe.DoesNotExistError:
        frappe.log_error(f"Customer not found for Sales Invoice: {doc.name}", "Sales Invoice Print Error")
        return

    # Decide main print format and printer
    if doc.is_return == 1:
        print_format = prints.credit_note_print_format
    # elif verify_url:
    #     print_format = prints.invoice_print_format
    elif customer.tax_id:
        print_format = prints.receipt_print_format
    elif doc.custom_is_credit_sales == 1:
        print_format = prints.part_collection_note_credit_sale
        # Also print credit sales gate pass
        _print_gate_pass(doc, printer_settings["gate_pass"], prints.gate_pass_credit_sales)
    else:
        print_format = prints.part_collection_print_format

    # Also print standard gate pass
    _print_gate_pass(doc, printer_settings["gate_pass"], prints.gate_pass_print_format)

    # Main print job
    _print_by_server(doc, printer_settings["cashier"], print_format)


def _print_by_server(doc, printer_name, print_format):
    frappe.call(
        "suam.suam.customizations.print_format.print_by_server",
        doctype=doc.doctype,
        name=doc.name,
        printer_setting=printer_name,
        print_format=print_format,
        no_letterhead=1
    )

def _print_gate_pass(doc, printer_name, print_format):
    """Helper to print gate pass"""
    _print_by_server(doc, printer_name, print_format)

def create_and_update_dispatch(doc, method):
    """Creates or updates Dispatch(s) for each warehouse in Sales Invoice."""

    warehouse_requisitions = {}
    submitted_warehouses = []
    updated_requisitions = []

    for item in doc.items:
        if not item.warehouse:
            continue
        
        warehouse = item.warehouse

        if warehouse not in warehouse_requisitions:
            # Check if a requisition already exists for this Sales Invoice & warehouse
            existing_req = frappe.get_value(
                "Dispatch",
                {"sales_invoice": doc.name, "warehouse": warehouse},
                "name"
            )

            if existing_req:
                # Fetch and update existing requisition
                customer_requisition = frappe.get_doc("Dispatch", existing_req)
                customer_requisition.set("items", [])
                updated_requisitions.append(existing_req)
            else:
                # Create a new requisition
                customer_requisition = frappe.get_doc({
                    "doctype": "Dispatch",
                    "customer": doc.customer,
                    "warehouse": warehouse,
                    "company": doc.company,
                    "requested_by": doc.custom_prepared_by,
                    "sales_invoice": doc.name,
                    "is_return": doc.is_return,
                })
                submitted_warehouses.append(warehouse)  # Track newly created requisition

            warehouse_requisitions[warehouse] = customer_requisition

        # Append item to the requisition (new or existing)
        warehouse_requisitions[warehouse].append("items", {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "item_group": item.item_group,
            "qty": item.qty,
            "warehouse": item.warehouse
        })

    # Insert or save requisitions
    for warehouse, req in warehouse_requisitions.items():
        if req.get("name"):  # If updating an existing requisition
            req.save()
        else:
            req.insert()
            # req.submit()  # Uncomment if auto-submission is required

    # Show messages based on action taken
    if submitted_warehouses:
        frappe.msgprint(
            _("Dispatch(s) processed for:<br><ul>{0}</ul>").format(
                "".join(f"<li>{wh}</li>" for wh in submitted_warehouses)
            ),
            title=_("Dispatch Processed"),
            indicator="green"
        )
    elif updated_requisitions:
        frappe.msgprint(
            _("Updated existing Dispatch(s):<br><ul>{0}</ul>").format(
                "".join(f"<li>{name}</li>" for name in updated_requisitions)
            ),
            title=_("Requisition Updated"),
            indicator="blue"
        )

# Function to Fetch Customer Balance
@frappe.whitelist()
def get_customer_balance(customer):
    balance = 0
    if not customer:
        return balance
    from erpnext.accounts.utils import get_balance_on

    balance = get_balance_on(party_type="Customer", party=customer)
    return balance


@frappe.whitelist()
def print_quotation(doc):
    """Print Quotation from Sales Invoice."""
    _print_document(doc, format_field="quotation_print_format", setting_field="quotation_printer", label="Quotation Print Format", error_title="Quotation Print Error")

@frappe.whitelist()
def print_receipt(doc):
    """Reprint Receipt from Sales Invoice."""
    if isinstance(doc, str):
        doc = frappe.parse_json(doc)
    if isinstance(doc, dict):
        doc = frappe.get_doc(doc)

    try:
        customer = frappe.get_doc("Customer", doc.customer)
    except frappe.DoesNotExistError:
        frappe.log_error(f"Customer not found for Sales Invoice: {doc.name}", "Sales Invoice Print Error")
        return "Customer not found."

    # Determine the appropriate print format
    if doc.custom_verify_url:
        format_field = "invoice_print_format"
    elif customer.tax_id:
        format_field = "receipt_print_format"
    else:
        format_field = "part_collection_print_format"

    _print_document(doc, setting_field="cashier_printer", format_field=format_field, label="Receipt Reprint Format", error_title="Receipt Print Error")


def _print_document(doc, setting_field, format_field, label, error_title):
    """
    Common helper to print a document using printer and format from Suam Settings.
    """
    try:
        if isinstance(doc, str):
            doc = frappe.parse_json(doc)
        if isinstance(doc, dict):
            doc = frappe.get_doc(doc)

        if not hasattr(doc, "doctype") or not hasattr(doc, "name"):
            frappe.throw("Invalid document format.")

        prints = frappe.get_single("Suam Settings")
        printer_name = getattr(prints, setting_field, None)
        print_format = getattr(prints, format_field, None)

        if not printer_name:
            frappe.throw(f"No printer configured in Suam Settings for {label}")
        if not print_format:
            frappe.throw(f"No print format configured in Suam Settings for {label}")

        frappe.call(
            "suam.suam.customizations.print_format.print_by_server",
            doctype=doc.doctype,
            name=doc.name,
            printer_setting=printer_name,
            print_format=print_format,
            no_letterhead=1
        )
        return "success"
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), error_title)