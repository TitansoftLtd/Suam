frappe.query_reports["Bank Balance Report"] = {
    "filters": [
        {
            "fieldname": "account",
            "label": __("Account"),
            "fieldtype": "Link",
            "options": "Account",
            "get_query": function() {
                return {
                    filters: {
                        "account_type": ["in", ["Bank", "Cash"]],
                        "is_group": 0
                    }
                };
            }
        }
    ]
};
