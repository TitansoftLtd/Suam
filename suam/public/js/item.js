frappe.ui.form.on('Item', {
    onload: function(frm) {
        if (!frm.doc.__islocal) return;

        frappe.call({
            method: 'kimzone.kimzone_ltd.customizations.item.set_item_code',
            callback: function(r) {
                if (r.message) {
                    frm.set_value('item_code', r.message);
                    frm.set_df_property('item_code', 'read_only', 1);
                }
            }
        });
    }
});
