// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Suam Commission", {
	refresh(frm) {
        if (frm.doc.docstatus === 1 && !frm.doc.payment_entry) {
            frm.add_custom_button(__('Make Payment'), () => {
                show_payment_dialog(frm);
            }).addClass("btn-primary");
        }
    },
    fetch_commission(frm) {
        if (!validate_date_range(frm)) return;

        check_date_overlap(frm, overlapping => {
            if (!overlapping) {
                fetch_individual_commissions(frm);
            }
        });
    },

    validate(frm) {
        if (!validate_date_range(frm, true)) return;

        check_date_overlap(frm, overlapping => {
            if (overlapping) {
                frappe.throw("Overlapping Suam Commission, records found. Please adjust your date range.");
            }
        }, true);
    },

    onload(frm) {
        calculate_total(frm);
    }
});

function show_payment_dialog(frm) {
    let d = new frappe.ui.Dialog({
        title: 'Make Payment',
        fields: [
            {
                label: 'Mode of Payment',
                fieldname: 'mode_of_payment',
                fieldtype: 'Link',
                options: 'Mode of Payment',
                reqd: 1
            },
            {
                label: 'Amount',
                fieldname: 'amount',
                fieldtype: 'Currency',
                default: frm.doc.total,
                read_only: 1
            }
        ],
        primary_action_label: 'Create Payment Entry',
        primary_action(values) {
            d.hide();

            frappe.call({
                method: 'suam.suam.doctype.suam_commission.suam_commission.create_payment_entry_for_commission',
                args: {
                    commission_name: frm.doc.name,
                    mode_of_payment: values.mode_of_payment
                },
                callback: function (r) {
                    if (r.message) {
                        frappe.msgprint(__('Payment Entry {0} created', [r.message]));
                        frm.reload_doc();
                        frappe.set_route('Form', 'Payment Entry', r.message);
                    }
                }
            });
        }
    });
    d.show();
}

frappe.ui.form.on('Suam Commission Details', {
    approved_commission(frm, cdt, cdn) {
        calculate_row_commission(cdt, cdn);
    },
    tax_rate(frm, cdt, cdn) {
        calculate_row_commission(cdt, cdn);
    },
    calculated_commission(frm) {
        calculate_total(frm);
    },
    commission_remove(frm) {
        calculate_total(frm);
    }
});

// Helper Functions

function validate_date_range(frm, throw_error = false) {
    if (!frm.doc.from_date || !frm.doc.to_date) {
        const message = "Please fill From Date and To Date.";
        throw_error ? frappe.throw(message) : frappe.msgprint(message);
        return false;
    }

    if (frm.doc.from_date > frm.doc.to_date) {
        const message = "From Date cannot be after To Date.";
        throw_error ? frappe.throw(message) : frappe.msgprint(message);
        return false;
    }
    return true;
}

function check_date_overlap(frm, callback, is_validate = false) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Suam Commission",
            filters: [
                ["docstatus", "<", 2],
                ["name", "!=", frm.doc.name],
                ["from_date", "<=", frm.doc.to_date],
                ["to_date", ">=", frm.doc.from_date]
            ],
            fields: ["name", "from_date", "to_date"]
        }
    }).then(r => {
        if (r.message.length > 0) {
            if (is_validate) {
                callback(true);
            } else {
                let records = r.message.map(record =>
                    `<li><a href="/app/suam-commission/${record.name}" target="_blank">${record.name}</a>: ${record.from_date} to ${record.to_date}</li>`
                ).join("");

                frappe.msgprint({
                    title: "Overlapping Records Found",
                    indicator: "error",
                    message: `<p>Date range overlaps with:</p><ul>${records}</ul>`
                });
                callback(true);
            }
        } else {
            callback(false);
        }
    });
}

function fetch_individual_commissions(frm) {
    let start = 0, limit = 1000;

    function fetch_batch() {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Sales Invoice",
                filters: [
                    ["posting_date", ">=", frm.doc.from_date],
                    ["posting_date", "<=", frm.doc.to_date],
                    ["docstatus", "=", 1],
                    ["custom_suam_sales_partner", "!=", ""]
                ],
                fields: [
                    "name",
                    "custom_suam_sales_partner",
                    "custom_mobile_no",
                    "grand_total",
                    "custom_proposed_commission",
                    "custom_cost_of_sales",
                    "custom_prepared_by"
                ],
                limit_start: start,
                limit_page_length: limit
            }
        }).then(r => {
            if (r.message.length > 0) {
                r.message.forEach(inv => {
                    let row = frm.add_child("commission");
                    row.sales_partner = inv.custom_suam_sales_partner;
                    row.mobile_no = inv.custom_mobile_no;
                    row.sales_invoice = inv.name;
                    row.sales_amount = inv.grand_total || 0;
                    row.proposed_commission = inv.custom_proposed_commission || 0;
                    row.sales_person = inv.custom_prepared_by || 0;
                    row.cost_of_sales = inv.custom_cost_of_sales || 0;
                    row.amount_eligible_for_commission = row.sales_amount - row.cost_of_sales;
                });

                start += limit;
                fetch_batch();
            } else {
                frm.refresh_field("commission");

                // frappe.msgprint(`Commission data fetched for ${frm.doc.commission.length} sales invoices.`);
                frappe.msgprint(`Commission data fetched successfully.`);

                calculate_total(frm);
                frm.enable_save();
            }
        });
    }

    frm.clear_table("commission");
    fetch_batch();
}

function calculate_row_commission(cdt, cdn) {
    let row = locals[cdt][cdn];
    let approved_commission = row.approved_commission || 0;
    let tax_rate = row.tax_rate || 0;
    let calculated_commission = 0;
    if (tax_rate === 0) {
        calculated_commission = approved_commission;
    } else {
        calculated_commission = (approved_commission- (approved_commission * tax_rate / 100));
    }

    frappe.model.set_value(cdt, cdn, 'calculated_commission', calculated_commission);
}

function calculate_total(frm) {
    let total = 0;
    frm.doc.commission.forEach(row => { 
        total += flt(row.calculated_commission);
    });
    frm.set_value('total', total);
    frm.refresh_field('total');
}
