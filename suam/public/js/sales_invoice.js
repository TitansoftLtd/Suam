frappe.ui.form.on('Sales Invoice', {
    refresh: function(frm) {
        // Hide sidebar
        frm.page.sidebar.hide();
                
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(__('Create Commission'), () => {
                frappe.new_doc("Commission", {
                    "company": frm.doc.company,
                    "sales_partner": frm.doc.custom_suam_sales_partner,
                    "sales_invoice": frm.doc.name,
                });
            }, __("Create"));

            frm.page.set_inner_btn_group_as_primary(__('Create'));
        }

        if (!frm.doc.custom_prepared_by) {  
            frappe.call({
                method: "frappe.client.get_value",
                args: {
                    doctype: "User",
                    filters: { name: frappe.session.user },
                    fieldname: "full_name"
                },
                callback: function(response) {
                    if (response.message && response.message.full_name) {
                        frm.set_value("custom_prepared_by", response.message.full_name);
                    }
                }
            });
        }

        // Add functionality to set Customer Tax ID if Tax Id is defined
        if (frm.doc.tax_id && frm.doc.custom_customer_tax_id != frm.doc.tax_id) {
            frm.set_value("custom_customer_tax_id", frm.doc.tax_id);
        }

        
    },

    onload_post_render: function(frm) {
        setTimeout(() => {
            frm.remove_custom_button('Quality Inspection(s)', 'Create');
            frm.remove_custom_button('Timesheet', 'Get Items From');
            frm.remove_custom_button('Sales Order', 'Get Items From');
            frm.remove_custom_button('Delivery Note', 'Get Items From');
            frm.remove_custom_button('Quotation', 'Get Items From');
        }, 0);
    },

    custom_add_multiple_items: function (frm) {
        if (!frm.doc.customer) {
            frappe.msgprint(__('Please specify a Customer to fetch Item Details.'));
            return;
        }
        add_multiple_items(frm);
    },

    paid_amount: function(frm) {
        frm.save();
    },

    tax_id: function(frm) {
        if (frm.doc.tax_id && frm.doc.custom_customer_tax_id != frm.doc.tax_id) {
            frm.set_value("custom_customer_tax_id", frm.doc.tax_id);
        }
    }
});

function custom_make_payment_prompt(frm) {
    frappe.prompt([
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
            reqd: 1,
            default: frm.doc.outstanding_amount
        },
        {
            label: 'Customer Tax ID',
            fieldname: 'custom_customer_tax_id',
            fieldtype: 'Data',
            reqd: 0,
            default: frm.doc.custom_customer_tax_id
        }
    ],
    function(values) {
        // Validate Tax ID   
        if(values.custom_customer_tax_id && !values.custom_customer_tax_id.match(/^[a-zA-Z][0-9]{9}[a-zA-Z]$/)) {
            frappe.throw("Invalid Tax ID");
        }

        // Add Customer Tax ID to Sales Invoice
        if (values.custom_customer_tax_id && frm.doc.custom_customer_tax_id != values.custom_customer_tax_id) {
            frm.set_value('custom_customer_tax_id', values.custom_customer_tax_id);
        }

        if (values.mode_of_payment === "Mpesa Express") {
            frappe.prompt([
                {
                    label: 'Mobile Number',
                    fieldname: 'mobile_number',
                    fieldtype: 'Data',
                    reqd: 1,
                    default: frm.doc.custom_mpesa_phone_number || ""
                }
            ],
            function(mobile_values) {
                // Now Call the STK Push Method
                frappe.call({
                    method: 'titan_mpesa.utils.express.stk_push.execute',
                    args: {
                        phone_number: mobile_values.mobile_number,
                        amount: values.amount,
                        invoice: frm.doc.name
                    },
                    callback: function(response) {
                        if (response.message) {
                            if(response.message.status){
                                frappe.show_alert({
                                    message: 'Payment processed successfully',
                                    indicator: 'green'
                                });

                                // Set value for checkoutID
                                frm.set_value('custom_mpesa_checkout_id', response.message.checkout_request_id);
                                frm.save();
                                frm.refresh_fields()
                                

                            }else{
                                frappe.show_alert({
                                    message: 'Error processing payment',
                                    indicator: 'red'
                                });
                            }

                            
                            d.hide();
                        } else {
                            frappe.show_alert({
                                message: 'Error processing payment',
                                indicator: 'red'
                            });
                        }
                    },
                    error: function(err) {
                        frappe.show_alert({
                            message: 'An error occurred while processing payment',
                            indicator: 'red'
                        });
                    }
                });
                

            },
            __('Enter Mobile Number'),'Make Payment' );
        } else {
            add_payment_to_sales_invoice(frm, values.mode_of_payment, values.amount);
        }
    },
    __('Make Payment'),'Make Payment');
}

// Function to set values in Sales Invoice
function add_payment_to_sales_invoice(frm, mode_of_payment, amount, mobile_number = "") {
    // Add payment entry to child table
    let child = frm.add_child("payments");
    frappe.model.set_value(child.doctype, child.name, "mode_of_payment", mode_of_payment);
    frappe.model.set_value(child.doctype, child.name, "amount", amount);

    // If Mpesa Express, set mobile number in Sales Invoice field
    if (mode_of_payment === "Mpesa Express") {
        frm.set_value("custom_mpesa_phone_number", mobile_number);
    }

    frm.refresh_field("payments");
    frm.refresh_field("custom_mpesa_phone_number");
}

// ---- Set Customer Balance and Credit Limit ----
frappe.ui.form.on('Sales Invoice', {
    validate: function (frm) {
        calculate_cost_of_sales(frm);
    },
    custom_suam_sales_partner: function (frm) {
        calculate_cost_of_sales(frm);
    },
    customer: function(frm) {
        fetch_customer_balance(frm);
        fetch_credit_limit_based_on_company(frm);
    },
    company: function(frm) {
        fetch_credit_limit_based_on_company(frm);
    },
    before_save: function(frm) {
        fetch_customer_balance(frm);
        fetch_credit_limit_based_on_company(frm);
    }
});

// Calculate Cost of Sales
function calculate_cost_of_sales(frm) {
    let total_cost = 0;
    frm.doc.items.forEach(function (row) {
        total_cost += (row.qty ) * (row.incoming_rate);
    });

    frm.set_value('custom_cost_of_sales', total_cost);
}

// Fetch Customer Balance
function fetch_customer_balance(frm) {
    if (frm.doc.customer) {
        frappe.call({
            method: "suam.suam.customizations.sales_invoice.get_customer_balance",
            args: {
                customer: frm.doc.customer
            },
            callback: (r) => {
                frm.set_value('custom_customer_balance', r.message || 0);
            }
        });
    } else {
        frm.set_value('custom_customer_balance', 0);
    }
}

// Fetch Credit Limit based on Company
function fetch_credit_limit_based_on_company(frm) {
    if (frm.doc.customer && frm.doc.company) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Customer',
                name: frm.doc.customer
            },
            callback: (r) => {
                if (r.message) {
                    const credit_limits = r.message.custom_customer_credit_limit || [];
                    const matched_limit = credit_limits.find(limit => limit.company === frm.doc.company);
                    frm.set_value('custom_credit_limit', matched_limit ? matched_limit.credit_limit : 0);
                }
            }
        });
    } else {
        frm.set_value('custom_credit_limit', 0);
    }
}


// Calculate COGS
frappe.ui.form.on('Sales Invoice Item', {
    qty: function (frm, cdt, cdn) {
        calculate_cost_of_sales(frm);
    },
    incoming_rate: function (frm, cdt, cdn) {
        calculate_cost_of_sales(frm);
    },
    items_remove: function (frm) {
        calculate_cost_of_sales(frm);
    },
    
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.item_code) {
            frappe.db.get_list("Item Price", {
                filters: {
                    item_code: row.item_code,
                    price_list: "Minimum Selling"
                },
                fields: ["price_list_rate"],
                order_by: "modified desc",
                limit: 1
            }).then((prices) => {
                if (prices.length > 0) {
                    let latest_price = prices[0].price_list_rate;
                    frappe.model.set_value(cdt, cdn, "custom_minimum_selling_rate", latest_price);
                }
            });
        }
    },
    
    rate: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.rate < row.custom_minimum_selling_rate) {
            frappe.msgprint({
                title: __("Error"),
                message: `The rate cannot be lower than the Minimum Selling Rate (${row.custom_minimum_selling_rate}).`,
                indicator: "red"
            });

            frappe.model.set_value(cdt, cdn, "rate", row.custom_minimum_selling_rate);
        }
    }
});