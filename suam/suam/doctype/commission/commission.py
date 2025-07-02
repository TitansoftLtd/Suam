# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Commission(Document):
	def on_submit(self):
		# get the sales invoice id
		sales_invoice = frappe.get_doc("Sales Invoice", self.sales_invoice)

		# update the sales invoice with the following fields
		sales_invoice.custom_suam_sales_partner = self.sales_partner
		sales_invoice.custom_mobile_no = self.mobile_no
		sales_invoice.custom_national_id = self.national_id
		sales_invoice.custom_proposed_commission = self.proposed_commission

		# save the sales invoice
		sales_invoice.save()