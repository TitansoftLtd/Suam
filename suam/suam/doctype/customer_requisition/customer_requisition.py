# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document

class CustomerRequisition(Document):
    def on_change(self):
        if not frappe.flags.in_import:
            if not self.printed and not self.is_return:
                self.print_document()
            elif self.is_return and self.printed:
                self.print_return_requisition()

    def get_printer_setting(self):
        if not self.warehouse:
            return None

        printer_name = frappe.db.get_value("Warehouse", self.warehouse, "custom_network_printer")
        if not printer_name:
            frappe.log_error(f"No printer found for warehouse: {self.warehouse}", "Customer Requisition Print Error")
            return None

        try:
            printer_doc = frappe.get_doc("Network Printer Settings", printer_name)
            printer_setting = printer_doc.printer_name
        except Exception as e:
            frappe.log_error(f"Failed to get printer settings for printer: {printer_name}\n{str(e)}", "Customer Requisition Print Error")
            return None

        if not printer_setting:
            frappe.log_error(f"No printer settings found for printer: {printer_name}", "Customer Requisition Print Error")
            return
        
        prints  = frappe.get_single("Suam Settings")
            
        # Call the function directly (No background queue)
        # if self.printed == 0:
        #     frappe.call(
        #     "suam.suam.customizations.print_format.print_by_server",
        #     doctype=self.doctype,
        #     name=self.name,
        #     printer_setting=printer_setting,
        #     print_format=prints.requisition_print_format,
        #     no_letterhead=1
        # )

        return printer_setting

    def print_document(self):
        printer_setting = self.get_printer_setting()
        if not printer_setting:
            return

        prints = frappe.get_single("Suam Settings")

        if self.printed == 0 and self.is_return == 0:
            frappe.call(
                "suam.suam.customizations.print_format.print_by_server",
                doctype=self.doctype,
                name=self.name,
                printer_setting=printer_setting,
                print_format=prints.requisition_print_format,
                no_letterhead=1
            )
            frappe.db.set_value("Customer Requisition", self.name, "printed", 1)

    def print_return_requisition(self):
        printer_setting = self.get_printer_setting()
        if not printer_setting:
            return

        prints = frappe.get_single("Suam Settings")

        if self.is_return == 1 and self.printed == 0:
            self._print_return_document(printer_setting, prints.return_requisition_print_format)
            frappe.db.set_value("Customer Requisition", self.name, "printed", 1)
        
        elif self.is_return == 1 and self.printed == 1:
            self._print_return_document(printer_setting, prints.return_requisition_print_format)

    def _print_return_document(self, printer_setting, print_format):
        frappe.call(
            "suam.suam.customizations.print_format.print_by_server",
            doctype=self.doctype,
            name=self.name,
            printer_setting=printer_setting,
            print_format=print_format,
            no_letterhead=1
        )