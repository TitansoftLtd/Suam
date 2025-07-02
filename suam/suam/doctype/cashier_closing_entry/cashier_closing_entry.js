// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on('Cashier Closing Entry', {
    refresh(frm) {
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Fetch Transactions'), () => fetch_transactions(frm))
                .addClass("btn-primary");
        }
        if (frm.fields_dict.sales_transactions && frm.fields_dict.sales_transactions.grid) {
            frm.fields_dict.sales_transactions.grid.grid_pagination.page_length = 15;
            frm.fields_dict.sales_transactions.grid.refresh();
        }
        // frm.fields_dict.sales_transactions.grid.refresh();
        render_reconciliation_summary(frm);
        render_payment_summary(frm);
        update_payment_totals(frm);
    },

    validate(frm) {
        render_reconciliation_summary(frm);
        render_payment_summary(frm);
        update_payment_totals(frm);
    },
    total_expected_amount(frm) {
        render_payment_summary(frm);
    },
    total_closing_amount(frm) {
        render_payment_summary(frm);
    },
    total_difference(frm) {
        render_payment_summary(frm);
    },
});

frappe.ui.form.on('Sales Closing Entry Details', {
    closing_amount(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.expected_amount !== undefined) {
            row.difference = flt(row.closing_amount) - flt(row.expected_amount);
            frm.refresh_field("payment_reconciliation");
        }
    }
});

// --- Child Table: Payment Reconciliation ---
// These events are crucial for updating the main form's totals when child table fields change.
frappe.ui.form.on('Sales Closing Entry Details', {
    expected_amount(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        row.difference = flt(row.closing_amount) - flt(row.expected_amount);
        frm.refresh_field("payment_reconciliation");
        update_payment_totals(frm);
        render_payment_summary(frm);
    },
    closing_amount(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        row.difference = flt(row.closing_amount) - flt(row.expected_amount);
        frm.refresh_field("payment_reconciliation");
        update_payment_totals(frm);
        render_payment_summary(frm);
    },
    difference(frm, cdt, cdn) {
        update_payment_totals(frm);
        render_payment_summary(frm);
    },
    form_render: function(frm, cdt, cdn) {
        update_payment_totals(frm);
        render_payment_summary(frm);
    },
    payment_reconciliation_add: function(frm) {
        update_payment_totals(frm);
        render_payment_summary(frm);
    },
    payment_reconciliation_remove: function(frm) {
        update_payment_totals(frm);
        render_payment_summary(frm);
    }
});

// --- Helper Functions ---

function fetch_transactions(frm) {
    if (!frm.doc.posting_date || !frm.doc.company) {
        frappe.msgprint(__('Please select Posting Date and Company.'));
        return;
    }

    frm.dashboard.set_headline('<span style="color:blue;">Fetching Transactions...</span>');
    frappe.dom.freeze(__('Fetching Transactions...'));

    clear_transaction_fields(frm);

    frappe.call({
        method: 'suam.suam.doctype.cashier_closing_entry.cashier_closing_entry.fetch_sales_invoices',
        args: {
            posting_date: frm.doc.posting_date,
            company: frm.doc.company
        },
        freeze: true,
        freeze_message: "Fetching Sales Transactions...",
        callback(r) {
            frappe.dom.unfreeze();
            frm.dashboard.clear_headline();

            const res = r.message;
            if (!res || res.status !== "success" || !Array.isArray(res.sales_transactions) || res.sales_transactions.length === 0) {
                frappe.msgprint(__('No sales transactions found for the selected date and company.'));
                return;
            }

            let totals = init_totals();

            res.sales_transactions.forEach(row => {
                frm.add_child("sales_transactions", {
                    sales_invoice: row.name,
                    sales_person: row.custom_prepared_by,
                    amount: row.grand_total || 0,
                    outstanding_amount: row.outstanding_amount || 0,
                    is_return: row.is_return,
                    return_against: row.return_against,
                    posting_date: row.posting_date,
                    customer: row.customer,
                    etr_invoice_number: row.etr_invoice_number || ""
                });

                update_totals(totals, row);
            });

            if (res.payment_reconciliation) {
                res.payment_reconciliation.forEach(payment => {
                    frm.add_child("payment_reconciliation", {
                        mode_of_payment: payment.mode_of_payment,
                        expected_amount: payment.expected_amount,
                        closing_amount: 0,
                        difference: -flt(payment.expected_amount)
                    });
                });
            }

            // Update totals on main form fields
            frm.set_value({
                grand_total: totals.grand_total,
                net_total: totals.net_total,
                tax: totals.tax,
                total_qty: totals.total_qty,
                outstanding_amount: totals.outstanding_amount,
                no_of_invoices: totals.no_of_invoices,
                grand_total_declared: totals.grand_total_declared,
                net_total_declared: totals.net_total_declared,
                grand_total_not_declared: totals.grand_total_not_declared,
                net_total_not_declared: totals.net_total_not_declared
            });

            frm.refresh_fields(); 
            render_reconciliation_summary(frm, totals);
            update_payment_totals(frm);
        }
    });
}

function clear_transaction_fields(frm) {
    frm.clear_table("sales_transactions");
    frm.clear_table("payment_reconciliation");
    frm.set_value({
        grand_total: 0,
        net_total: 0,
        tax: 0,
        total_qty: 0,
        outstanding_amount: 0,
        no_of_invoices: 0,
        grand_total_declared: 0,
        net_total_declared: 0,
        grand_total_not_declared: 0,
        net_total_not_declared: 0,
        // Also clear payment reconciliation summary totals
        total_expected_amount: 0,
        total_closing_amount: 0,
        total_difference: 0
    });
    frm.refresh_fields();
}

function init_totals() {
    return {
        grand_total: 0,
        net_total: 0,
        tax: 0,
        total_qty: 0,
        outstanding_amount: 0,
        no_of_invoices: 0,
        grand_total_declared: 0,
        net_total_declared: 0,
        grand_total_not_declared: 0,
        net_total_not_declared: 0
    };
}

function update_totals(totals, row) {
    totals.grand_total += flt(row.grand_total);
    totals.net_total += flt(row.net_total);
    totals.tax = totals.grand_total - totals.net_total; // Tax is grand_total - net_total
    totals.total_qty += flt(row.total_qty);
    totals.outstanding_amount += flt(row.outstanding_amount);
    totals.no_of_invoices++;

    if (row.etr_invoice_number?.trim()) {
        totals.grand_total_declared += flt(row.grand_total);
        totals.net_total_declared += flt(row.net_total);
    } else {
        totals.grand_total_not_declared += flt(row.grand_total);
        totals.net_total_not_declared += flt(row.net_total);
    }
}

function render_reconciliation_summary(frm, totals = {}) {
    const grand_total = flt(totals.grand_total || frm.doc.grand_total || 0);
    const net_total = flt(totals.net_total || frm.doc.net_total || 0);
    const tax = flt(totals.tax || frm.doc.tax || 0);

    frappe.db.get_value("Company", frm.doc.company, "default_currency").then(({ message }) => {
        const currency = message?.default_currency || "Sh";
        frappe.db.get_value("Currency", currency, "symbol").then(({ message }) => {
            const symbol = message?.symbol || "Sh";

            const html = `
                <div style="text-align: center; font-size: 14px; color: gray; margin-bottom: 10px;">
                    SALES SUMMARY
                </div>
                <table class="table table-bordered" style="width: 100%;">
                    <tr><th>Grand Total</th><td style="text-align:right;">${symbol} ${grand_total.toLocaleString(undefined, {minimumFractionDigits:2})}</td></tr>
                    <tr><th>Net Total</th><td style="text-align:right;">${symbol} ${net_total.toLocaleString(undefined, {minimumFractionDigits:2})}</td></tr>
                    <tr><th>Tax</th><td style="text-align:right;">${symbol} ${tax.toLocaleString(undefined, {minimumFractionDigits:2})}</td></tr>
                </table>
            `;

            if (frm.fields_dict.reconciliation_details) {
                frm.fields_dict.reconciliation_details.$wrapper.html(html);
                frm.refresh_field("reconciliation_details");
            }
        });
    });
}

// Render Payment Summary
function render_payment_summary(frm = {}) {
    const expected_payments = flt(frm.doc.total_expected_amount || 0);
    const closing_payments = flt(frm.doc.total_closing_amount || 0);
    const difference = flt(frm.doc.total_difference || 0);

    frappe.db.get_value("Company", frm.doc.company, "default_currency").then(({ message }) => {
        const currency = message?.default_currency || "Sh";
        frappe.db.get_value("Currency", currency, "symbol").then(({ message }) => {
            const symbol = message?.symbol || "Sh";

            const html = `
                <div style="text-align: center; font-size: 14px; color: gray; margin-bottom: 10px;">
                    PAYMENT SUMMARY
                </div>
                <table class="table table-bordered" style="width: 100%;">
                    <tr>
                        <th style="font-weight: bold; color: black;">Expected Payments</th>
                        <td style="text-align: right;">${symbol} ${expected_payments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <th style="font-weight: bold; color: black;">Closing Payments</th>
                        <td style="text-align: right;">${symbol} ${closing_payments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <th style="font-weight: bold; color: black;">Difference</th>
                        <td style="text-align: right;">${symbol} ${difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                </table>
            `;

            if (frm.fields_dict.payment_summary) {
                frm.fields_dict.payment_summary.$wrapper.html(html);
                frm.refresh_field("payment_summary");
            }
        });
    });
}

function update_payment_totals(frm) {
    let total_expected = 0, total_closing = 0, total_difference = 0;

    (frm.doc.payment_reconciliation || []).forEach(row => {
        total_expected += flt(row.expected_amount);
        total_closing += flt(row.closing_amount);
        total_difference += flt(row.difference);
    });

    frm.set_value({
        total_expected_amount: total_expected,
        total_closing_amount: total_closing,
        total_difference: total_difference
    });

    frm.refresh_fields(['total_expected_amount', 'total_closing_amount', 'total_difference']);
}
