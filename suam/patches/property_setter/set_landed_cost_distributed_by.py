from frappe.custom.doctype.property_setter.property_setter import make_property_setter

def execute():
    new_options = "\n".join([
        "Qty",
        "Amount",
        "Distribute Manually",
        "Weight",
    ])

    make_property_setter(
        doctype="Landed Cost Voucher",
        fieldname="distribute_charges_based_on",
        property="options",
        value=new_options,
        property_type="Text",
    )