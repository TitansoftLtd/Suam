import frappe

@frappe.whitelist()
def set_item_code():
    last_code = frappe.db.sql("""
        SELECT CAST(item_code AS UNSIGNED)
        FROM `tabItem`
        WHERE item_code REGEXP '^[0-9]+$'
        ORDER BY CAST(item_code AS UNSIGNED) DESC
        LIMIT 1
    """)
    next_code = 1
    if last_code and last_code[0][0]:
        next_code = int(last_code[0][0]) + 1

    return str(next_code)
