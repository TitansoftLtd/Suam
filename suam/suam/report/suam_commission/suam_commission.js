// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Suam Commission"] = {
	filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1
        },
		{
			fieldname:"from_date",
			label: __("Start Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(),-1),
			reqd: 1
		},
		{
			fieldname:"to_date",
			label: __("End Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1
		},
        {
            fieldname: "sales_partner",
            label: __("Sales Partner"),
			fieldtype: "Link",
            options: "Kimzone Sales Partner"
        },
        {
            fieldname: "sales_person",
            label: __("Sales Person"),
			fieldtype: "Data"
        },
        {
            fieldname: "mobile_no",
            label: __("Mobile No"),
            fieldtype: "Data"
        }
    ]
};
