import frappe

def validate(doc, method):
    if not doc.warehouse:
        doc.flags.ignore_mandatory = True
