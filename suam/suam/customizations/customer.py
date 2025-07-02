import frappe
from frappe import _

def validate(doc, method):
    '''
    Validate the Customer
    '''
    validate_tax_id(doc)

def validate_tax_id(doc):
    '''
    Method that validate the Tax ID
    '''
    # Check if Tax ID is already set
    if not doc.tax_id:
        return
    
    # Check That Tax ID is 11 Charaters long
    if len(doc.tax_id) != 11:
        frappe.throw(_("Tax ID must be 11 characters long"))
    
    # Check that Tax Tax with and Alphabet and Ends with an Alphabet
    if not doc.tax_id[0].isalpha():
        frappe.throw(_("Tax ID must start with an alphabet"))
    if not doc.tax_id[-1].isalpha():
        frappe.throw(_("Tax ID must end with an alphabet"))

    # Check that Apart from the First and Last Character, the Tax ID is a Number
    if not doc.tax_id[1:-1].isdigit():
        frappe.throw(_("Tax ID must be a number"))
    
    

