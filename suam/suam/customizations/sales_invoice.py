import frappe
from frappe import _
from suam.suam.customizations.workflow import apply_doc_workflow
from frappe.utils import add_days, nowdate


def validate(doc, method):
    if doc.workflow_state == "Credit Approved":
        doc.custom_is_credit_sales = 1
    if doc.docstatus == 0:
        doc.posting_date = frappe.utils.nowdate()
    create_and_update_requisition(doc, method)
    update_custom_qty_requested(doc, method)
    # update_customer_requisition_workflow(doc, method)
    update_cr_workflow(doc, method)

def before_submit(doc, _method=None):
    # Only apply checks if not credit sales
    if doc.custom_credit_limit == 0:
        if doc.is_return == 0:
            if doc.paid_amount < doc.grand_total:
                frappe.throw("Paid Amount cannot be less than the Invoice Amount.")
            elif doc.paid_amount > doc.grand_total:
                frappe.throw("Paid Amount cannot be greater than the Invoice Amount.")
        else:
            if doc.paid_amount < doc.grand_total:
                frappe.throw("Paid Amount cannot be less than the Return Amount.")
            elif doc.paid_amount > doc.outstanding_amount:
                frappe.throw("Paid Amount cannot be greater than the Outstanding Amount for Returns. Kindly make return payment.")

def on_submit(doc, method):
    # Print Invoice Automatically
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

def create_and_update_requisition(doc, method):
    """Creates or updates Customer Requisition(s) when workflow_state is 'Requisition Sent'"""

    if doc.workflow_state != "Requisition Sent":
        return

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
                "Customer Requisition", 
                {"sales_invoice": doc.name, "warehouse": warehouse}, 
                "name"
            )

            if existing_req:
                # Fetch and update existing requisition
                customer_requisition = frappe.get_doc("Customer Requisition", existing_req)
                customer_requisition.set("items", [])
                updated_requisitions.append(existing_req)
            else:
                # Create a new requisition
                customer_requisition = frappe.get_doc({
                    "doctype": "Customer Requisition",
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
            _("Requisition(s) processed for:<br><ul>{0}</ul>").format(
                "".join(f"<li>{wh}</li>" for wh in submitted_warehouses)
            ),
            title=_("Requisition Processed"),
            indicator="green"
        )
    elif updated_requisitions:
        frappe.msgprint(
            _("Updated existing Customer Requisition(s):<br><ul>{0}</ul>").format(
                "".join(f"<li>{name}</li>" for name in updated_requisitions)
            ),
            title=_("Requisition Updated"),
            indicator="blue"
        )


def update_custom_qty_requested(doc, method):
    """
    Update custom_qty_requested based on qty when workflow_state is "Requisition Sent".
    """
    if doc.workflow_state == "Requisition Sent":
        for item in doc.items:
            item.custom_qty_requested = item.qty

        # Recalculate total requested quantity
        doc.custom_total_requested = sum(item.custom_qty_requested or 0 for item in doc.items)

# def update_customer_requisition_workflow(doc, method):    
#     if doc.workflow_state == "Draft" and doc.get_doc_before_save().workflow_state == "Requisition Sent":
#         # Fetch all Customer Requisition documents linked to the Sales Invoice
#         requisitions = frappe.get_all(
#             "Customer Requisition",
#             filters={"sales_invoice": doc.name},
#             pluck="name"
#         )

#         if not requisitions:
#             frappe.log_error(f"No Customer Requisition found for Sales Invoice: {doc.name}", "Customer Requisition Workflow Update Error")
#             return

#         # Apply workflow for each linked Customer Requisition
#         for requisition_name in requisitions:
#             apply_doc_workflow("Customer Requisition", requisition_name, "Recall Requisition", "Recalled for Adjustment")


def update_cr_workflow(doc, method):
    """Update Customer Requisition when Sales Invoice changes."""
    customer_requisition = frappe.get_all(
        "Customer Requisition",
        filters={"sales_invoice": doc.name},
        fields=["name", "workflow_state"]
    )

    for requisition in customer_requisition:
        if doc.workflow_state and requisition["workflow_state"] and \
           doc.workflow_state == "Draft" and requisition["workflow_state"] == "Requisition Recalled":
            # Apply workflow for each linked Customer Requisition
            apply_doc_workflow("Customer Requisition", requisition["name"], "Recall Requisition", "Recalled for Adjustment")
            frappe.db.set_value("Customer Requisition", requisition["name"], "printed", 0)

            frappe.msgprint(f"Customer Requisition {requisition['name']} updated due to Sales Invoice changes.")

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


# Cron Job to delete old draft Sales Invoices
def delete_old_draft_sales_invoices():
    # Calculate the date 7 days ago
    cutoff_date = add_days(nowdate(), -7)

    # Get all draft Sales Invoices with posting_date <= cutoff_date
    invoices = frappe.get_all(
        "Sales Invoice",
        filters={
            "docstatus": 0,
            "posting_date": ("<=", cutoff_date)
        },
        pluck="name"
    )
    for name in invoices:
        try:
            frappe.delete_doc("Sales Invoice", name, force=1)
            frappe.logger().info(f"Deleted draft Sales Invoice: {name}")
        except Exception as e:
            frappe.log_error(f"Error deleting Sales Invoice {name}: {e}")