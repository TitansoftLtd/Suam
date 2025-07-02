// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Take", {
    refresh: function(frm) {
        frm.set_query("warehouse", function() { 
            return {
                filters: {
                    company: frm.doc.company,
                    is_group: 0
                }
            };
        });

        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(__('Stock Entry'), () => {
            frappe.new_doc("Stock Entry", {
                "company": frm.doc.company,
                "custom_stock_take": frm.doc.name,
            });
            }, __("Create"));

            frm.add_custom_button(__('Material Request'), () => {
            frappe.new_doc("Material Request", {
                "company": frm.doc.company,
            });
            }, __("Create"));

            frm.page.set_inner_btn_group_as_primary(__('Create'));
        }

        if (![1, 2].includes(frm.doc.docstatus)) {
            frm.add_custom_button(__('Warehouse Linked CR'), () => {
                if (!frm.doc.warehouse) {
                    frappe.msgprint(__("Please select a Warehouse"));
                    return;
                }

                set_posting_datetime(frm);
                get_items(frm);
            }, __("Fetch Items"));

            frm.add_custom_button(__('Rack'), () => {
                set_posting_datetime(frm);
                fetch_items(frm, 'Rack');
            }, __("Fetch Items"));

            frm.add_custom_button(__('Shelf'), () => {
                set_posting_datetime(frm);
                fetch_items(frm, 'Shelf');
            }, __("Fetch Items"));

            frm.add_custom_button(__('Bin Location'), () => {
                set_posting_datetime(frm);
                fetch_items(frm, 'Bin Location');
            }, __("Fetch Items"));

            frm.page.set_inner_btn_group_as_primary(__('Fetch Items'));
        }
    },

    warehouse: function(frm) {
        // Clear the items table when the warehouse is changed
        frm.clear_table("items");
        frm.refresh_field("items");
    }
});

function set_posting_datetime(frm) {
    frm.set_value('posting_date', frappe.datetime.get_today());
    frm.set_value('posting_time', frappe.datetime.now_time());
}

function fetch_items(frm, type) {
    frappe.prompt([
        {
            fieldname: type.toLowerCase(),
            label: __(type),
            fieldtype: 'Link',
            options: type,
            reqd: 1
        }
    ], function(values) {
        let selected_value = values[type.toLowerCase()];
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: type,
                filters: { name: selected_value },
                fieldname: "warehouse"
            },
            callback: function(r) {
                if (!r.message || !r.message.warehouse) {
                    frappe.msgprint(__("No warehouse found for the selected " + type + "."));
                    return;
                }

                let warehouse = r.message.warehouse;                
                frappe.call({
                    method: "suam.suam.doctype.stock_take.stock_take.get_items_from_rack",
                    args: {
                        warehouse: warehouse,
                        location: selected_value,
                        posting_date: frm.doc.posting_date,
                        posting_time: frm.doc.posting_time,
                        ignore_empty_stock: 0
                    },
                    callback: function (r) {           
                        if (r.exc) {
                            console.error("Error fetching items:", r.exc);
                            frappe.msgprint(__("An error occurred while fetching items."));
                            return;
                        }
                        
                        if (!r.message || !r.message.length) {
                            frm.clear_table("items");
                            frm.refresh_field("items");
                            frappe.msgprint(__("No items found linked to the selected " + type + "."));
                            return;
                        }

                        frm.clear_table("items");

                        r.message.forEach((row) => {
                            let item = frm.add_child("items");
                            $.extend(item, row);
                            item.item_code = item.item_code;
                            item.item_name = item.item_name;
                            item.actual_qty = item.qty;
                            item.valuation_rate = item.valuation_rate;
                        });
            
                        frm.refresh_field("items");
                        frappe.msgprint(__("Items fetched successfully"));
                    },
                });
            }
        });
    }, __('Select ' + type), __('Fetch'));
}

function get_items(frm) {
    frappe.call({
        method: "suam.suam.doctype.stock_take.stock_take.get_items",
        args: {
            warehouse: frm.doc.warehouse,
            closing_date: frm.doc.closing_date,
            posting_date: frm.doc.posting_date,
            posting_time: frm.doc.posting_time,
            company: frm.doc.company,
            ignore_empty_stock: 0,
        },
        callback: function (r) {           
            if (r.exc || !r.message || !r.message.length) {
                frappe.msgprint(__("No items found."));
                return;
            }

            frm.clear_table("items");

            r.message.forEach((row) => {
                let item = frm.add_child("items");
                $.extend(item, row);
                item.item_code = item.item_code;
                item.item_name = item.item_name;
                item.actual_qty = item.qty || 0;
                item.valuation_rate = item.valuation_rate || 0;
            });

            frm.refresh_field("items");
            frm.save();
        },
    });
}

frappe.ui.form.on("Stock Take Items", {
    actual_qty: function(frm, cdt, cdn) {
        calculate_variance(frm, cdt, cdn);
    },
    physical_qty: function(frm, cdt, cdn) {
        calculate_variance(frm, cdt, cdn);
    }
});

function calculate_variance(frm, cdt, cdn) {
    let d = locals[cdt][cdn];
    if (d.physical_qty != null && d.actual_qty != null) {
        frappe.model.set_value(cdt, cdn, "variance", d.actual_qty - d.physical_qty);
    }
}