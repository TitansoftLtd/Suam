frappe.ui.form.on('Quotation',{
    custom_add_multiple_items: function (frm) {
        if (!frm.doc.party_name) {
            frappe.msgprint(__('Please specify a Customer to fetch Item Details.'));
            return;
        }
        add_multiple_items(frm);
    }
});


// Global variables to manage the dialog, item data, pagination, and search.
let dialog, filtered_data = [], current_page = 1, page_size = 10, all_items = [], search_by = 'free_text', current_search_value = '';

async function add_multiple_items(frm) {
    // Fetch all items from the server before opening the dialog.
    all_items = await fetchAllItems();

    const headers = [
        { key: "item_code", label: "Item Code" },
        { key: "item_name", label: "Item Name" },
        { key: "brand", label: "Brand" },
        { key: "qty_ordered", label: "Qty Ordered" },
        { key: "available_qty", label: "Available Qty" },
        { key: "retail_price", label: "Retail Price" },
        { key: "minimum_price", label: "Minimum Price" },
        { key: "stock_uom", label: "UOM" },
        { key: "warehouse", label: "Main Warehouse" },
        { key: "main_warehouse", label: "Main Qty" }
    ];

    // Create a new Frappe UI Dialog.
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
                        <label><input type="radio" name="search_option" value="item_code"> ${__("Item Code")}</label>
                        <label><input type="radio" name="search_option" value="item_name"> ${__("Item Name")}</label>
                        <label><input type="radio" name="search_option" value="free_text" checked> ${__("Free Text")}</label>
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
                click: function () {
                    dialog.fields_dict.search.set_value("");
                    current_search_value = '';
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

            // Iterate through each row in the table to find selected items.
            rows.each(function () {
                const checkbox = this.querySelector("input[type='checkbox']");
                if (checkbox?.checked) {
                    const rowData = {};
                    headers.forEach((h, i) => {
                        const cell = this.children[i + 1];
                        if (h.key === "qty_ordered") {
                            const input = cell.querySelector("input");
                            rowData[h.key] = input?.value?.trim() || "0";
                        } else {
                            rowData[h.key] = cell?.textContent?.trim() || "";
                        }
                    });
                    selected_items.push(rowData);
                }
            });

            dialog.hide();
            add_items_in_child_table(frm, { items: selected_items });
        }
    });

    dialog.show();

    // HTML structure for the resizable table and its styles.
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

            /* Rounded corners for the table headers and cells */
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
                        <th style="width: 50px;"><input type="checkbox" id="select_all"></th>
                        ${headers.map(h => `
                            <th style="width: 100px;">
                                ${h.label}
                                <div class="resizer"></div>
                            </th>
                        `).join("")}
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;

    dialog.fields_dict.items_html.$wrapper.html(tableHTML);
    makeColumnsResizable(dialog.$wrapper.find('#resizable_items_table')[0]);
    renderRows(all_items, headers);

    dialog.$wrapper.find('#select_all').on('change', function () {
        const checked = this.checked;
        dialog.$wrapper.find("tbody input[type='checkbox']").prop("checked", checked);
    });

    // Add click listener to table rows for direct adding
    dialog.$wrapper.find('#resizable_items_table tbody').on('click', 'tr', async function (event) {
        if ($(event.target).is('input[type="checkbox"]') || $(event.target).is('input[type="number"]')) {
            return;
        }

        const rowIndex = $(this).index();
        const item = filtered_data[(current_page - 1) * page_size + rowIndex];

        // Ensure item exists and has an item_code
        if (item && item.item_code) {
            let quantityInput = $(this).find('input[type="number"]');
            let quantity = parseFloat(quantityInput.val());

            // Only add if quantity is greater than 0
            if (quantity > 0) {
                const itemToAdd = { ...item, qty_ordered: quantity };
                await add_items_in_child_table(frm, { items: [itemToAdd] });

                $(this).find('input[type="checkbox"]').prop('checked', true);
            } else {
                frappe.show_alert({
                    message: __('Cannot add item with zero quantity.'),
                    indicator: 'red'
                });
            }
        }
    });
}

function renderRows(data, headers) {
    const tbody = dialog.$wrapper.find("#resizable_items_table tbody")[0];
    const paginationText = dialog.$wrapper.find("#pagination-text")[0];
    tbody.innerHTML = "";

    if (data.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = headers.length + 1;
        cell.style.height = "20px";
        cell.textContent = "No matching items found";
        cell.style.textAlign = "center";
        row.appendChild(cell);
        tbody.appendChild(row);
        if (paginationText) {
            paginationText.textContent = "No matching items found";
        }
        return;
    }

    const start = (current_page - 1) * page_size;
    const end = start + page_size;
    const pageItems = data.slice(start, end);

    pageItems.forEach(item => {
        const row = document.createElement("tr");
        // Add a class for styling and click event
        row.classList.add('item-row');
        // Dynamically create cells based on headers
        let cellsHTML = `<td><input type="checkbox"></td>`;
        headers.forEach(header => {
            let value = item[header.key] ?? "";
            if (header.key === "qty_ordered") {
                // For Qty Ordered, ensure a default of 0 if it's empty/invalid for display
                const displayQty = value === "";
                cellsHTML += `<td><input type="number" class="qty-ordered-input" value="${displayQty}" min="0" style="width: 80px; border: none; outline: none;" placeholder="0"></td>`;
            } else {
                cellsHTML += `<td>${value}</td>`;
            }
        });
        row.innerHTML = cellsHTML;
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

        // Mouse down event on the resizer.
        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault(); // Prevent default drag behavior
            startX = e.pageX;
            startWidth = parseInt(document.defaultView.getComputedStyle(th).width, 10);
            // Add mousemove and mouseup listeners to the document for dragging.
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
        });

        // Function to handle mouse movement during drag.
        function doDrag(e) {
            const newWidth = startWidth + e.pageX - startX;
            if (newWidth > 50) { // Minimum width for a column
                th.style.width = newWidth + 'px';
            }
        }

        // Function to stop dragging.
        function stopDrag() {
            // Remove the event listeners after dragging stops.
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        }
    });
}

async function fetchAllItems(search = "") {
    try {
        const response = await frappe.call({
            method: "suam.suam.customizations.multiple_items.get_all_items",
            args: { search }
        });

        all_items = response.message.items || [];
        filtered_data = all_items;
        return all_items;
    } catch (error) {
        console.error("Error fetching items:", error);
        frappe.msgprint(__('Error fetching items. Please try again.'));
        return [];
    }
}

function performSearch(search_value) {
    current_search_value = search_value;
    const search_lower = search_value.toLowerCase();
    const search_tokens = search_lower.split(/\s+/).map(token => token.trim()).filter(Boolean);

    filtered_data = all_items.filter(item => {
        if (search_by === 'item_code') {
            return item.item_code?.toLowerCase().includes(search_lower);
        }
        if (search_by === 'item_name') {
            return item.item_name?.toLowerCase().includes(search_lower);
        }
        if (search_by === 'free_text') {
            const fieldsToSearch = [
                "item_code", "item_name", "brand", "custom_store_location"
            ];
            // Check if all search tokens are present in any of the searchable fields.
            return search_tokens.every(token => {
                return fieldsToSearch.some(field => {
                    const value = item[field];
                    return value && value.toString().toLowerCase().includes(token);
                });
            });
        }
        return false;
    });

    current_page = 1;
    const headers = [
        { key: "item_code", label: "Item Code" },
        { key: "item_name", label: "Item Name" },
        { key: "brand", label: "Brand" },
        { key: "qty_ordered", label: "Qty Ordered" },
        { key: "available_qty", label: "Available Qty" },
        { key: "retail_price", label: "Retail Price" },
        { key: "minimum_price", label: "Minimum Price" },
        { key: "stock_uom", label: "UOM" },
        { key: "warehouse", label: "Main Warehouse" },
        { key: "main_warehouse", label: "Main Qty" }
    ];
    renderRows(filtered_data, headers);
}

async function add_items_in_child_table(frm, values) {
    let item_rows = values.items || [];
    let zero_qty_items_skipped = [];

    // Filter out any existing empty rows in the child table to prevent issues.
    frm.doc.items = frm.doc.items.filter(item => item.item_code);

    // Use a Promise.all to handle asynchronous updates for each item.
    const add_item_promises = item_rows.map(async (row) => {
        let quantity = parseFloat(row.qty_ordered);

        // **CRITICAL CHANGE**: Skip item if quantity is zero or less.
        if (isNaN(quantity) || quantity <= 0) {
            zero_qty_items_skipped.push(row.item_name || row.item_code);
            return; // Skip this item entirely
        }

        // Find if the item already exists in the child table.
        let existing_item = frm.doc.items.find(item => item.item_code === row.item_code);

        if (existing_item) {
            await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", quantity);
            await frm.events.item_code(existing_item.doctype, existing_item.name, frm);
        } else {
            let child = frm.add_child("items");
            
            await frappe.model.set_value(child.doctype, child.name, "item_code", row.item_code);
            await frappe.model.set_value(child.doctype, child.name, "item_name", row.item_name);
            await frappe.model.set_value(child.doctype, child.name, "brand", row.brand);
            await frappe.model.set_value(child.doctype, child.name, "qty", quantity);
            await frappe.model.set_value(child.doctype, child.name, "warehouse", row.warehouse);
            await frappe.model.set_value(child.doctype, child.name, "uom", row.stock_uom);
            await frappe.model.set_value(child.doctype, child.name, "custom_store_location", row.custom_store_location);

            await frm.events.item_code(child.doctype, child.name, frm);
        }
    });

    // Wait for all item additions/updates to complete before refreshing the field.
    await Promise.all(add_item_promises);

    // Refresh the "items" child table to reflect the changes.
    frm.refresh_field("items");
}