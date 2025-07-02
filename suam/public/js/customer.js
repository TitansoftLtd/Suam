frappe.ui.form.on('Customer', {
    refresh: function(frm) {
        frm.add_custom_button(__('View Statement'), function() {
            const customer_name = frm.doc.name;

            frappe.set_route('query-report', 'Customer Statement Report', {
                customer: customer_name
            });
        });
    }
});
