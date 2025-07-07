// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Global Item Pricing", {
    onload: function(frm) {
        frm.set_query('purchase_receipt', () => ({
            query: "suam.suam.doctype.global_item_pricing.global_item_pricing.get_available_purchase_receipts"
        }));

        frm.set_query('stock_entry', function() {
            return {
                query: "suam.suam.doctype.suam_selling_price.suam_selling_price.get_available_stock_entries",
            };
        });

        frm.set_query('region', function() {
            return {
                filters: {
                    is_group: 0
                }
            };
        });

        frm.set_query('price_list', () => ({
            filters: {
                buying: 1,
                enabled: 1
            }
        }));
    },

    apply_on: function(frm) {
        frm.clear_table('global_item_pricing_details');
        frm.refresh_field('global_item_pricing_details');
    },

    brand: function(frm) {
        if (frm.doc.global_item_pricing_details.length) {
            frm.clear_table('global_item_pricing_details');
            frm.refresh_field('global_item_pricing_details');
        }
    },

    item_group: function(frm) {
        if (frm.doc.global_item_pricing_details.length) {
            frm.clear_table('global_item_pricing_details');
            frm.refresh_field('global_item_pricing_details');
        }
    },

    purchase_receipt: function(frm) {
        if (frm.doc.apply_on === 'Purchase') {
            frm.clear_table('global_item_pricing_details');
            frm.refresh_field('global_item_pricing_details');
            fetch_purchase_receipt(frm);
        }
    },

   fetch_items: function(frm) {
        // Condition 1: Invalid combination
        if (frm.doc.price_type === "Buying" && frm.doc.apply_on === "Manual" ) {
            frappe.msgprint(__('Please set Price Type to Selling to fetch items.'));
            return;
        }

        // Condition 2: Buying + Price List + Brand/Item Group
        if (
            frm.doc.price_type === "Buying" &&
            (frm.doc.brand || frm.doc.item_group) &&
            frm.doc.price_list
        ) {
            frm.clear_table('global_item_pricing_details');
            frappe.call({
                method: "suam.suam.doctype.global_item_pricing.global_item_pricing.get_standard_buying_price_based_on",
                args: {
                    brand: frm.doc.brand,
                    item_group: frm.doc.item_group,
                    price_list: frm.doc.price_list
                },
                callback: async function(r) {
                    const items = r.message || [];
                    if (items.length > 0) {
                        await populate_item_pricing_table(frm, { items });
                        frappe.show_alert({
                            message: __(`${items.length} item(s) with Standard Buying Prices added.`),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__("No items with Standard Buying Prices found."));
                    }
                }
            });
            return;
        }

        // Condition 3: Selling and Brand/Item Group is set
        if (frm.doc.price_type === "Selling" && (frm.doc.brand || frm.doc.item_group)) {
            frm.clear_table('global_item_pricing_details');
            frappe.call({
                method: "suam.suam.doctype.global_item_pricing.global_item_pricing.get_items_based_on",
                args: {
                    brand: frm.doc.brand,
                    item_group: frm.doc.item_group
                },
                callback: async function(r) {
                    if (r.message && r.message.length > 0) {
                        await populate_item_pricing_table(frm, { items: r.message });
                        frappe.show_alert({
                            message: __(`${r.message.length} item(s) successfully added to table.`),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint(__("No items found."));
                    }
                }
            });
            return;
        }

        // Condition 4: Manual fallback
        if (frm.doc.apply_on === "Manual") {
            frm.clear_table('global_item_pricing_details');
            frm.refresh_field('global_item_pricing_details');
            fetch_multiple_items(frm);
            return;
        }

        // Condition 5: Invalid or missing setup
        frappe.msgprint(__('Please set Apply On, Brand, Item Group, and/or Price List to fetch items.'));
    },

    discount_percentage: recalculate_all_prices,
    change_type: recalculate_all_prices,
    price_change_by: recalculate_all_prices,
    minimum_margin: recalculate_all_prices,
    retail_margin: recalculate_all_prices,
    tax_rate: recalculate_all_prices,
    round_to_nearest: recalculate_all_prices
});

// Helper to recalculate all prices
function recalculate_all_prices(frm) {
    frm.doc.global_item_pricing_details.forEach(row => {
        recalculate_prices_for_row(frm, row);
    });
    frm.refresh_field('global_item_pricing_details');
}


// Rounding utility that respects selected base
function round_up_to_nearest(value, nearest) {
    value = flt(value);
    nearest = cint(nearest);

    if (!nearest || nearest <= 0) return value; // No rounding
    return Math.ceil(value / nearest) * nearest;
}

function recalculate_prices_for_row(frm, row) {
    if (!row || !frm.doc) return;

    const round_to = frm.doc.round_to_nearest ? cint(frm.doc.round_to_nearest) : 0;
    const tax = flt(frm.doc.tax_rate);
    const tax_factor = (tax / 100) + 1;
    const minimum_rate = flt(frm.doc.minimum_margin);
    const retail_rate = flt(frm.doc.retail_margin);
    const buying_price = flt(row.standard_buying_price);
    const change_by = frm.doc.price_change_by;
    const discount_percentage = flt(frm.doc.discount_percentage || 0);

    let min_price = 0;
    let retail_price = 0;

    // If change type is set and increase/decrease is selected
    if (change_by === "Increase" || change_by === "Decrease") {
        if (frm.doc.change_type === 'Percentage') {
            const min_multiplier = minimum_rate / 100;
            const retail_multiplier = retail_rate / 100;

            if (change_by === "Decrease") {
                min_price = buying_price * (1 - min_multiplier);
                retail_price = buying_price * (1 - retail_multiplier);
            } else {
                min_price = buying_price * (1 + min_multiplier);
                retail_price = buying_price * (1 + retail_multiplier);
            }
        } else if (frm.doc.change_type === 'Amount') {
            if (change_by === "Decrease") {
                min_price = buying_price - minimum_rate;
                retail_price = buying_price - retail_rate;
            } else {
                min_price = buying_price + minimum_rate;
                retail_price = buying_price + retail_rate;
            }
        }
    }

    // If discount is specified, apply it on top of calculated prices
    else if (discount_percentage > 0) {
        if (frm.doc.change_type === 'Percentage') {
            let dis_min_price = buying_price * ((minimum_rate / 100) + 1);
            min_price = dis_min_price - (dis_min_price * (discount_percentage / 100));

            let dis_retail_price = buying_price * ((retail_rate / 100) + 1);
            retail_price = dis_retail_price - (dis_retail_price * (discount_percentage / 100));
        } else if (frm.doc.change_type === 'Amount') {
            let per_min_price = buying_price + minimum_rate;
            min_price = per_min_price - (per_min_price * (discount_percentage / 100));

            let per_retail_price = buying_price + retail_rate;
            retail_price = per_retail_price - (per_retail_price * (discount_percentage / 100));
        }
    }

    // Fallback if no change_by or discount
    else {
        if (frm.doc.change_type === 'Percentage') {
            min_price = buying_price * ((minimum_rate / 100) + 1);
            retail_price = buying_price * ((retail_rate / 100) + 1);
        } else if (frm.doc.change_type === 'Amount') {
            min_price = buying_price + minimum_rate;
            retail_price = buying_price + retail_rate;
        }
    }

    // Final prices with tax
    row.minimum_selling_price = round_up_to_nearest(min_price * tax_factor, round_to);
    row.retail_selling_price = round_up_to_nearest(retail_price * tax_factor, round_to);
}

async function populate_item_pricing_table(frm, values) {
    const item_rows_to_add = values.items || [];

    // Clear existing table
    frm.clear_table('global_item_pricing_details');

    for (const selected_row of item_rows_to_add) {
        const child = frm.add_child("global_item_pricing_details");

        Object.assign(child, {
            item_code: selected_row.item_code,
            item_name: selected_row.item_name,
            uom: selected_row.stock_uom,
            batch_no: selected_row.batch_no,
            qty: selected_row.actual_qty,
            standard_buying_price: selected_row.valuation_rate
        });

        recalculate_prices_for_row(frm, child);
    }

    frm.refresh_field("global_item_pricing_details");
}

// Function to fetch purchase receipt details and populate selling price details
function fetch_purchase_receipt(frm) {
    if (frm.doc.purchase_receipt) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Purchase Receipt',
                name: frm.doc.purchase_receipt
            },
            callback: function (r) {
                if (r.message) {
                    let receipt = r.message;
                    frm.clear_table('global_item_pricing_details');

                    let item_count = receipt.items.length;
                    let processed_count = 0;

                    receipt.items.forEach(item => {
                        frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'Batch',
                                filters: {
                                    item: item.item_code,
                                    reference_doctype: 'Purchase Receipt',
                                    reference_name: frm.doc.purchase_receipt
                                },
                                limit: 1,
                                fields: ['name']
                            },
                            callback: function (batch_res) {
                                let batch_no = '';
                                if (batch_res.message && batch_res.message.length > 0) {
                                    batch_no = batch_res.message[0].name;
                                }

                                const round_to = frm.doc.round_to_nearest ? cint(frm.doc.round_to_nearest) : 0;
                                const tax = flt(frm.doc.tax_rate || 16); // Default to 16% if not set
                                const tax_factor = (tax / 100) + 1;
                                const minimum_rate = flt(frm.doc.minimum_margin);
                                const retail_rate = flt(frm.doc.retail_margin);

                                let child = frm.add_child('global_item_pricing_details');
                                child.item_code = item.item_code;
                                child.item_name = item.item_name;
                                child.uom = item.stock_uom;
                                child.qty = item.qty;
                                child.batch_no = batch_no;

                                let rate_to_use = (receipt.currency === 'KES') ? (item.net_rate || 0) : (item.base_net_rate || 0);
                                let landed_cost = rate_to_use + (item.landed_cost_voucher_amount / item.qty || 0);
                                child.standard_buying_price = landed_cost;
                                
                                // Ensure rates have values   
                                if (frm.doc.change_type === 'Percentage') {
                                    child.minimum_selling_price = round_up_to_nearest(
                                        child.standard_buying_price * ((minimum_rate / 100) + 1) * tax_factor,
                                        round_to
                                    );

                                    child.retail_selling_price = round_up_to_nearest(
                                        child.standard_buying_price * ((retail_rate / 100) + 1) * tax_factor,
                                        round_to
                                    );
                                } else if (frm.doc.change_type === 'Amount') {
                                    child.minimum_selling_price = round_up_to_nearest(
                                        (child.standard_buying_price + minimum_rate) * tax_factor,
                                        round_to
                                    );

                                    child.retail_selling_price = round_up_to_nearest(
                                        (child.standard_buying_price + retail_rate) * tax_factor,
                                        round_to
                                    );
                                }

                                processed_count++;
                                if (processed_count === item_count) {
                                    frm.refresh_field('global_item_pricing_details');
                                }
                            }
                        });
                    });
                }
            }
        });
    }
}

let dialog, all_items = [], filtered_data = [], current_page = 1, page_size = 10, current_search_value = '', search_by = 'item_code';

const headers = [
    { key: "item_code", label: "Item Code" },
    { key: "item_name", label: "Item Name" },
    { key: "brand", label: "Brand" },
    { key: "stock_uom", label: "UOM" },
    { key: "batch_no", label: "Batch No" },
    { key: "warehouse", label: "Main Warehouse" },
    { key: "actual_qty", label: "Available Qty" },
    { key: "valuation_rate", label: "Valuation Rate" }
];

async function fetch_multiple_items(frm) {
    dialog = new frappe.ui.Dialog({
        title: __('Select Items'),
        size: "extra-large",
        fields: [
            {
                fieldname: "radio_container",
                fieldtype: "HTML",
                label: __("Search Options"),
                options: `
                    <div style="display: flex; gap: 20px;">
                        <label><input type="radio" name="search_option" value="item_code" checked> ${__("Item Code")}</label>
                        <label><input type="radio" name="search_option" value="brand"> ${__("Brand")}</label>
                    </div>
                `
            },
            {
                fieldname: "search",
                fieldtype: "Data",
                label: __("Search Item"),
                onchange: function () {
                    performSearch(this.value);
                }
            },
            {
                fieldname: "clear_search",
                fieldtype: "Button",
                label: __("Clear Search"),
                click: async function () {
                    dialog.fields_dict.search.set_value("");
                    current_search_value = '';
                    all_items = await loadAllItemsFromServer(search_by);
                    filtered_data = all_items;
                    current_page = 1;
                    renderRows(filtered_data, headers);
                }
            },
            {
                fieldname: "items_html",
                fieldtype: "HTML",
                label: "Items"
            },
            {
                fieldname: "pagination_info",
                fieldtype: "HTML",
                options: '<span id="pagination-text"></span>'
            }
        ],
        // --- PRIMARY ACTION: RE-ENABLES ADDING SELECTED ITEMS ---
        primary_action_label: __('Add Selected Items'),
        primary_action() {
            const rows = dialog.$wrapper.find('tbody tr');
            const selected_items = [];

            rows.each(function () {
                const checkbox = this.querySelector("input[type='checkbox']");
                if (checkbox?.checked) {
                    const rowData = {};
                    headers.forEach((h, i) => {
                        rowData[h.key] = this.children[i + 1]?.textContent?.trim() || "";
                    });
                    selected_items.push(rowData);
                }
            });

            if (selected_items.length > 0) {
                add_items_in_child_table(frm, { items: selected_items });
                dialog.hide();
            } else {
                frappe.show_alert({
                    message: __('No items selected. Please select items or click a row to add a single item.'),
                    indicator: 'orange'
                });
            }
        }
    });

    dialog.show();

    const tableHTML = `
        <style>
            .resizable-table-container {
                width: 100%;
                overflow-x: auto;
                border-radius: 10px;
                border: 0.5px solid #ccc;
            }

            table.resizable-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
                min-width: 1200px;
                border-radius: 10px;
                overflow: hidden;
            }

            .resizable-table th,
            .resizable-table td {
                border: 0.5px solid #ccc;
                padding: 6px;
                position: relative;
                white-space: nowrap;
                overflow: hidden;
                width: 100px;
                min-width: 60px;
                max-width: 500px;
            }

            .resizable-table th {
                background-color: #f7f7f7;
                font-weight: bold;
            }

            /* Rounded corners */
            .resizable-table th:first-child {
                border-top-left-radius: 6px;
            }

            .resizable-table th:last-child {
                border-top-right-radius: 6px;
            }

            .resizable-table tr:last-child td:first-child {
                border-bottom-left-radius: 6px;
            }

            .resizable-table tr:last-child td:last-child {
                border-bottom-right-radius: 6px;
            }

            .resizer {
                position: absolute;
                right: 0;
                top: 0;
                width: 5px;
                height: 100%;
                cursor: col-resize;
                user-select: none;
                z-index: 10;
            }
            /* .item-row class will be added to <tr> elements */
            .item-row {
                cursor: pointer; /* Indicate that rows are clickable */
            }
            .item-row:hover {
                background-color: #e0e0e0; /* Highlight on hover */
            }
        </style>

        <div class="resizable-table-container">
            <table class="resizable-table" id="resizable_items_table">
                <thead>
                    <tr>
                        <th style="width: 20px;><input type="checkbox" id="select_all"></th> ${headers.map(h => `<th>${h.label}<div class="resizer"></div></th>`).join("")}
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;
    dialog.fields_dict.items_html.$wrapper.html(tableHTML);
    makeColumnsResizable(dialog.$wrapper.find('#resizable_items_table')[0]);

    all_items = await loadAllItemsFromServer(search_by);
    filtered_data = all_items;
    renderRows(filtered_data, headers);

    dialog.$wrapper.find('#select_all').on('change', function () {
        const checked = this.checked;
        dialog.$wrapper.find("tbody input[type='checkbox']").prop("checked", checked);
    });

    dialog.$wrapper.find('input[name="search_option"]').on('change', function () {
        search_by = this.value;
        if (current_search_value?.trim()) {
            performSearch(current_search_value);
        } else {
            renderRows(filtered_data, headers);
        }
    });

    const tableBody = dialog.$wrapper.find('#resizable_items_table tbody');
    tableBody.on('click', 'tr', async function(event) {
        const clickedRow = this;
        const checkbox = clickedRow.querySelector("input[type='checkbox']");

        if (event.target !== checkbox) {
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            const rowData = {};
            headers.forEach((h, i) => {
                rowData[h.key] = clickedRow.children[i + 1]?.textContent?.trim() || "";
            });

            await add_items_in_child_table(frm, { items: [rowData] });
        }
    });
}

function renderRows(data, headers) {
    const tbody = dialog.$wrapper.find("#resizable_items_table tbody")[0];
    const paginationText = dialog.$wrapper.find("#pagination-text")[0];
    tbody.innerHTML = "";

    if (!data.length) {
        const row = `<tr><td colspan="${headers.length + 1}" style="text-align:center;">No matching items found</td></tr>`;
        tbody.innerHTML = row;
        paginationText.textContent = "";
        return;
    }

    const start = (current_page - 1) * page_size;
    const end = start + page_size;
    const pageItems = data.slice(start, end);

    pageItems.forEach(item => {
        const row = document.createElement("tr");
        row.classList.add('item-row');
        const rowCells = headers.map(h => `<td>${item[h.key] ?? ""}</td>`).join("");
        row.innerHTML = `<td><input type="checkbox"></td>${rowCells}`;
        tbody.appendChild(row);
    });

     if (paginationText) {
        paginationText.textContent = `Showing ${start + 1}-${Math.min(end, data.length)} of ${data.length} item(s)`;
    }
}

function makeColumnsResizable(table) {
    const ths = table.querySelectorAll('th');
    ths.forEach((th) => {
        const resizer = th.querySelector('.resizer');
        if (!resizer) return;

        let startX, startWidth;

        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            startX = e.pageX;
            startWidth = parseInt(document.defaultView.getComputedStyle(th).width, 10);
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
        });

        function doDrag(e) {
            const newWidth = startWidth + e.pageX - startX;
            if (newWidth > 50) {
                th.style.width = newWidth + 'px';
            }
        }

        function stopDrag() {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        }
    });
}

async function loadAllItemsFromServer(search_by_option = 'item_code') {
    try {
        const response = await frappe.call({
            method: "suam.suam.doctype.global_item_pricing.global_item_pricing.get_filtered_items",
            args: {
                search_by: search_by_option
            }
        });
        return response.message || [];
    } catch (error) {
        console.error("Failed to fetch items from server:", error);
        frappe.throw(__("Failed to fetch items from server. Please check console for details."));
        return [];
    }
}

function performSearch(search_value) {
    current_search_value = search_value;
    const search_lower = search_value.toLowerCase();
    const search_tokens = search_lower.split(/\s+/).map(token => token.trim()).filter(Boolean);

    if (!['item_code', 'brand'].includes(search_by)) {
        frappe.throw(__("Search can only be performed by Item Code or Brand."));
        return;
    }

    filtered_data = all_items.filter(item => {
        const field_value = (item[search_by] || '').toLowerCase();
        return search_tokens.every(token => field_value.includes(token));
    });

    current_page = 1;
    renderRows(filtered_data, headers);
}

async function add_items_in_child_table(frm, values) {
    let item_rows_to_add = values.items || [];

    frm.doc.global_item_pricing_details = frm.doc.global_item_pricing_details.filter(item => item.item_code);

    const add_item_promises = item_rows_to_add.map(async (selected_row) => {
        let is_duplicate = frm.doc.global_item_pricing_details.some(
            (existing_child_row) => existing_child_row.item_code === selected_row.item_code
        );

        if (!is_duplicate) {
            let child = frm.add_child("global_item_pricing_details");

            await frappe.model.set_value(child.doctype, child.name, "item_code", selected_row.item_code);
            await frappe.model.set_value(child.doctype, child.name, "item_name", selected_row.item_name);
            await frappe.model.set_value(child.doctype, child.name, "uom", selected_row.stock_uom);
            await frappe.model.set_value(child.doctype, child.name, "batch_no", selected_row.batch_no);
            await frappe.model.set_value(child.doctype, child.name, "qty", selected_row.actual_qty);
            await frappe.model.set_value(child.doctype, child.name, "standard_buying_price", selected_row.valuation_rate);

            // Recalculate pricing for this row after setting values
            recalculate_prices_for_row(frm, child);

            if (frm.events && frm.events.item_code) {
                 await frm.events.item_code(child.doctype, child.name, frm);
            }
        } else {
            frappe.show_alert({
                message: __(`Item ${selected_row.item_code} already exists in the table.`),
                indicator: 'orange'
            });
        }
    });

    await Promise.all(add_item_promises);
    frm.refresh_field("global_item_pricing_details");
}