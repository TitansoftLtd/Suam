frappe.ui.form.on('Quotation',{
    custom_add_multiple_items: function (frm) {
        if (!frm.doc.party_name) {
            frappe.msgprint(__('Please specify a Customer to fetch Item Details.'));
            return;
        }
        add_multiple_items(frm);
    }
});