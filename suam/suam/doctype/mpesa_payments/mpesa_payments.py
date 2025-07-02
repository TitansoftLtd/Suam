# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

from datetime import date
import frappe
from frappe.model.document import Document

class MpesaPayments(Document):
    def validate(self):
        '''
        Method that runs validation before the document is
        saved
        '''
        # validate  fields
        self.validate_fields()

    def before_save(self):
        '''
        Method that runs before the document is 
        saved
        '''
        if self.status == "Submitted":
            #prepare erpnext payment details
            self.prepare_payment_entry_details()
            
            #now add the payment to a payment entry
            self.create_payment_entry()
                
    def validate_fields(self):
        '''
        Method that validates the given
        fields
        '''
        required_fields = [
            {'field_name':'Account','value':self.bill_reference_number},
            {'field_name':'Amount','value':self.transaction_amount},
            {'field_name':'Shortcode','value':self.business_short_code}
        ]
        #loop through required fields
        for field in required_fields:
            if not field.get('value'):
                frappe.throw('The {} field is required'.format(field['field_name']))

    def get_erpnext_invoice(self):
        #get ref invoice
        inv_docs = frappe.db.get_all("Sales Invoice",filters={'custom_bill_reference_number':self.bill_reference_number}, fields = ['name', 'customer'])
        
        # check if a customer details document was found
        if inv_docs:
            #get linked customer account
            erpnext_inv = inv_docs[0].get('name')
            customer = inv_docs[0].get('customer')
     
            #now return the customer account
            return {'status':True,'erpnext_inv':erpnext_inv, 'customer': customer}
   
    def prepare_payment_entry_details(self):
        '''
        Method that prepares the required details for new payment entry
        '''
        #get customer account
        inv_details = self.get_erpnext_invoice()
        
        # get mobile payment settings
        mobile_payment_settings = frappe.db.get_all("Suam Mpesa Settings", filters={"mpesa_shortcode":self.business_short_code}, fields=["company", "account_paid_from", "account_paid_to", "account_currency"])
        
        if mobile_payment_settings:
            #define details based on account details status
            customer = inv_details['customer']
            inv_name = inv_details['erpnext_inv']
            company = mobile_payment_settings[0].get("company")
            paid_from = mobile_payment_settings[0].get("account_paid_from")
            paid_to = mobile_payment_settings[0].get("account_paid_to")
            acc_currency = mobile_payment_settings[0].get("account_currency")
      
        self.payment_details = {
            'customer':customer,
            'company':company,
            'paid_from':paid_from,
            'paid_to':paid_to,
            'acc_currency':acc_currency
        }

    def create_payment_entry(self):
        '''
        Method that creates a payment entry for an associated 
        customer
        '''
        mop = get_mode_of_payment(self.payment_details['paid_to'])
        
        #check if the document is already linked with payment entry
        if self.linked_payment_entry:
            return 

        #create new payment entry doc
        new_payment = frappe.new_doc("Payment Entry")
        new_payment.payment_type = "Receive"
        new_payment.party_type = "Customer"
        new_payment.party = self.payment_details['customer']
        new_payment.company = self.payment_details['company']
        new_payment.mode_of_payment = mop
        new_payment.paid_from = self.payment_details['paid_from']
        new_payment.paid_to = self.payment_details['paid_to']
        new_payment.paid_to_account_currency = self.payment_details['acc_currency']
        new_payment.received_amount = float(self.transaction_amount)
        new_payment.paid_amount = float(self.transaction_amount)
        new_payment.reference_no = self.transaction_id
        new_payment.reference_date = date.today()
        
        #add advances invoices
        try:
            new_payment.validate()
        except Exception as e:
            frappe.throw(e)
        #now save to database()
        new_payment.save(ignore_permissions = True)
        frappe.db.commit()
        #now submite the payment entry
        new_payment.submit()
        frappe.db.commit()
        #Now add the linked payment entry to payment entry
        self.linked_payment_entry = new_payment.name
        
def get_mode_of_payment(paid_to):
    mop_name = "Cash"
    
    mop_list = frappe.db.get_all("Mode of Payment Account", filters={"default_account": paid_to}, fields=["parent"])
    if mop_list:
        mop_name = mop_list[0].get("parent")
        
    return mop_name