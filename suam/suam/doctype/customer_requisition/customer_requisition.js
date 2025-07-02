// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Customer Requisition", {
	refresh(frm) {
        frm.add_custom_button(__('Create Stock Entry'), () => {
            frappe.new_doc("Stock Entry", {
                "company": frm.doc.company,
                "custom_customer_requisition": frm.doc.name,
            });
        }).addClass("btn-primary");
	},
});

frappe.ui.form.on("Customer Requisition Details", {
    qty_issued(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (row.qty && row.qty_issued) {
            frappe.model.get_value("Customer Requisition", frm.doc.name, "is_return", (r) => {
                if (r && r.is_return == 1) {
                    frappe.model.set_value(cdt, cdn, "qty_returnednot_issued", row.qty + row.qty_issued);
                } else {
                    frappe.model.set_value(cdt, cdn, "qty_returnednot_issued", row.qty - row.qty_issued);
                }
            });
        }
    }
});

