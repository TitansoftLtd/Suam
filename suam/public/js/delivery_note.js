frappe.ui.form.on('Delivery Note',{
    custom_add_multiple_items: function (frm) {
        if (!frm.doc.customer) {
            frappe.msgprint(__('Please specify a Customer to fetch Item Details.'));
            return;
        }
        add_multiple_items(frm);
    }
});