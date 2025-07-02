// Copyright (c) 2025, Team Web Africa and contributors
// For license information, please see license.txt

frappe.query_reports["Daily Cashier Sales Report"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            default: frappe.defaults.get_default("company"),
            reqd: 1
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        }
    ],

    // Custom formatter to add clickable link to sales_person
    formatter: function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "sales_person" && data && data.raw_sales_person) {
            // No need to get or format dates if we're not filtering by them in the URL
            // const to_date = frappe.query_report.get_filter_value("to_date");
            // const format_date = (date_str) => { ... };
            // const formatted_to = format_date(to_date);
            // const date_filter_value = formatted_to;

            // Construct the URL with ONLY 'custom_prepared_by' filter
            const url = `/app/sales-invoice?custom_prepared_by=${encodeURIComponent(data.raw_sales_person)}`;

            return `<a href="${url}" target="_blank">${value}</a>`;
        }

        return value;
    }
};