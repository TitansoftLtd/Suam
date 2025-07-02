// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Suam Mpesa Settings", {
    register: function(frm){
		frappe.call({
			method: "register",
			doc: frm.doc,
			callback: function(res) {
				console.log("response from backend")
				console.log(res.message)

				refresh_field('registered')
				// refresh_field('response')
			}
		});
	}
});