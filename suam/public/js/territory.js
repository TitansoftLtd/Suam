frappe.ui.form.on('Territory', {
    onload: function(frm) {
        frm.set_query('custom_parent_warehouse', function() {
            return {
                filters: {
                    is_group: 1
                }
            };
        });
    }
});
