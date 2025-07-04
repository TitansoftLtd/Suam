// Copyright (c) 2025, Titansoft Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("Suam Selling Price", {
    onload: function(frm) {
        frm.set_query('purchase_receipt', function() {
            return {
                query: "suam.suam.doctype.suam_selling_price.suam_selling_price.get_available_purchase_receipts",
            };
        });

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
    },
    based_on: function(frm) {
        frm.clear_table('selling_price_details');
        frm.refresh_field('selling_price_details');
    },
    purchase_receipt: function(frm) {
        if (frm.doc.based_on === 'Purchase') {
        // Clear existing details before fetching new ones
            frm.clear_table('selling_price_details');
            frm.refresh_field('selling_price_details');
            fetch_purchase_receipt(frm);
        }
    },
    stock_entry: function(frm) {
        if (frm.doc.based_on === 'Stock Entry') {
        // Clear existing details before fetching new ones
            frm.clear_table('selling_price_details');
            frm.refresh_field('selling_price_details');
            fetch_stock_entry(frm);
        }
    },
    fetch_item: function(frm) {
        if (frm.doc.based_on === 'Manual') {
            // Clear existing details before fetching new ones
            frm.clear_table('selling_price_details');
            frm.refresh_field('selling_price_details');
            fetch_multiple_items(frm);
        } else {
            frappe.msgprint(__('Please select Based on "Manual" as the basis for fetching items.'));
        }
    }
});

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
                    frm.clear_table('selling_price_details');

                    let item_count = receipt.items.length;
                    let processed_count = 0;

                    function round_up_to_nearest_50(value) {
                        return Math.ceil(value / 50) * 50;
                    }

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

                                let child = frm.add_child('selling_price_details');
                                child.item_code = item.item_code;
                                child.item_name = item.item_name;
                                child.uom = item.stock_uom;

                                let rate_to_use = (receipt.currency === 'KES') ? (item.net_rate || 0) : (item.base_net_rate || 0);

                                child.landed_cost = rate_to_use + (item.landed_cost_voucher_amount / item.qty || 0);
                                child.purchase_cost = rate_to_use;

                                // Ensure rates have values
                                child.ss_maximum_rate = child.ss_maximum_rate || 0;
                                child.ss_minimum_rate = child.ss_minimum_rate || 0;
                                child.ss_retail_rate = child.ss_retail_rate || 0;
                                child.tax_rate = child.tax_rate || 0;

                                child.maximum_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_maximum_rate / 100) + 1) * ((child.tax_rate / 100) + 1));
                                child.minimum_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_minimum_rate / 100) + 1) * ((child.tax_rate / 100) + 1));
                                child.retail_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_retail_rate / 100) + 1) * ((child.tax_rate / 100) + 1));

                                processed_count++;
                                if (processed_count === item_count) {
                                    frm.refresh_field('selling_price_details');
                                }
                            }
                        });
                    });
                }
            }
        });
    }
}

// Function to fetch purchase receipt details and populate selling price details
function fetch_stock_entry(frm) {
    if (frm.doc.stock_entry) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Stock Entry',
                name: frm.doc.stock_entry
            },
            callback: function (r) {
                if (r.message) {
                    let transfer = r.message;
                    frm.clear_table('selling_price_details');

                    let item_count = transfer.items.length;
                    let processed_count = 0;

                    function round_up_to_nearest_50(value) {
                        return Math.ceil(value / 50) * 50;
                    }

                    transfer.items.forEach(item => {
                        let child = frm.add_child('selling_price_details');
                        child.item_code = item.item_code;
                        child.item_name = item.item_name;
                        child.uom = item.stock_uom;
                        
                        let rate_to_use = item.basic_rate;

                        child.landed_cost = rate_to_use + (item.additional_cost / item.qty || 0);
                        child.purchase_cost = rate_to_use;

                        // Ensure rates have values
                        child.ss_maximum_rate = child.ss_maximum_rate || 0;
                        child.ss_minimum_rate = child.ss_minimum_rate || 0;
                        child.ss_retail_rate = child.ss_retail_rate || 0;
                        child.tax_rate = child.tax_rate || 0;

                        child.maximum_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_maximum_rate / 100) + 1) * ((child.tax_rate / 100) + 1));
                        child.minimum_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_minimum_rate / 100) + 1) * ((child.tax_rate / 100) + 1));
                        child.retail_selling_price = round_up_to_nearest_50(child.landed_cost * ((child.ss_retail_rate / 100) + 1) * ((child.tax_rate / 100) + 1));

                        processed_count++;
                        if (processed_count === item_count) {
                            frm.refresh_field('selling_price_details');
                        }
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
            method: "suam.suam.doctype.suam_selling_price.suam_selling_price.get_filtered_items",
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

    frm.doc.selling_price_details = frm.doc.selling_price_details.filter(item => item.item_code);

    const add_item_promises = item_rows_to_add.map(async (selected_row) => {
        let is_duplicate = frm.doc.selling_price_details.some(
            (existing_child_row) => existing_child_row.item_code === selected_row.item_code
        );

        if (!is_duplicate) {
            let child = frm.add_child("selling_price_details");

            await frappe.model.set_value(child.doctype, child.name, "item_code", selected_row.item_code);
            await frappe.model.set_value(child.doctype, child.name, "item_name", selected_row.item_name);
            await frappe.model.set_value(child.doctype, child.name, "uom", selected_row.stock_uom);
            await frappe.model.set_value(child.doctype, child.name, "purchase_cost", selected_row.valuation_rate);
            await frappe.model.set_value(child.doctype, child.name, "landed_cost", selected_row.valuation_rate);

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
    frm.refresh_field("selling_price_details");
}

frappe.ui.form.on('Suam Selling Price', {
    apply_rate: function(frm) {
        frm.doc.selling_price_details.forEach(row => {
            row.ss_maximum_rate = frm.doc.maximum_rate;
            row.ss_minimum_rate = frm.doc.minimum_rate;
            row.ss_retail_rate = frm.doc.retail_rate;

            recalculate_prices_for_row(frm, row);
        });

        frm.refresh_field('selling_price_details');
    }
});

frappe.ui.form.on('Suam Selling Price Details', {
    landed_cost: update_prices,
    purchase_cost: update_prices,
    tax_rate: update_prices,
    ss_maximum_rate: update_prices,
    ss_minimum_rate: update_prices,
    ss_retail_rate: update_prices,

    maximum_selling_price: reverse_maximum_rate,
    minimum_selling_price: reverse_minimum_rate,
    retail_selling_price: reverse_retail_rate
});

function update_prices(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    recalculate_prices_for_row(frm, row);
    frm.fields_dict.selling_price_details.grid.refresh_row(row.idx - 1);
}

function round_up_to_nearest_50(value) {
    return Math.ceil(flt(value) / 50) * 50;
}

function recalculate_prices_for_row(frm, row) {
    if (!row || !frm.doc) return;

    const landed = flt(row.landed_cost);
    const tax = flt(row.tax_rate);
    const tax_factor = (tax / 100) + 1;

    row.maximum_selling_price = round_up_to_nearest_50(
        landed * ((flt(row.ss_maximum_rate) / 100) + 1) * tax_factor
    );

    row.minimum_selling_price = round_up_to_nearest_50(
        landed * ((flt(row.ss_minimum_rate) / 100) + 1) * tax_factor
    );

    row.retail_selling_price = round_up_to_nearest_50(
        landed * ((flt(row.ss_retail_rate) / 100) + 1) * tax_factor
    );
}

// Reverse functions (keep as-is but refresh only the row)
function reverse_maximum_rate(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (row.landed_cost > 0) {
        const without_tax = row.maximum_selling_price / ((row.tax_rate / 100) + 1);
        row.ss_maximum_rate = (((without_tax / row.landed_cost) - 1) * 100).toFixed(2);
    }
    frm.fields_dict.selling_price_details.grid.refresh_row(row.idx - 1);
}

function reverse_minimum_rate(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (row.landed_cost > 0) {
        const without_tax = row.minimum_selling_price / ((row.tax_rate / 100) + 1);
        row.ss_minimum_rate = (((without_tax / row.landed_cost) - 1) * 100).toFixed(2);
    }
    frm.fields_dict.selling_price_details.grid.refresh_row(row.idx - 1);
}

function reverse_retail_rate(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (row.landed_cost > 0) {
        const without_tax = row.retail_selling_price / ((row.tax_rate / 100) + 1);
        row.ss_retail_rate = (((without_tax / row.landed_cost) - 1) * 100).toFixed(2);
    }
    frm.fields_dict.selling_price_details.grid.refresh_row(row.idx - 1);
}
