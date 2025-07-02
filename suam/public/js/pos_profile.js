frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        frm.set_df_property('warehouse', 'reqd', 0);
        frm.set_value('warehouse', '');
    },
    validate: function(frm) {
        // Prevent validation for warehouse field
        if (!frm.doc.warehouse) {
            frm.fields_dict['warehouse'].df.reqd = 0;
        }
        frm.set_value('warehouse', '');
    }
});