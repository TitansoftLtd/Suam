import frappe
from frappe.utils import today

def execute(filters=None):
    if not filters:
        filters = {}

    from_date = filters.get("from_date", today())
    to_date = filters.get("to_date", today())
    company = filters.get("company")

    # Fetch all Mode of Payments used in Sales Invoices
    mops_si = frappe.db.sql(f"""
        SELECT DISTINCT sip.mode_of_payment
        FROM `tabSales Invoice` si
        JOIN `tabSales Invoice Payment` sip ON sip.parent = si.name
        WHERE si.docstatus = 1
        AND si.posting_date BETWEEN %s AND %s
        {f"AND si.company = %s" if company else ""}
    """, tuple([from_date, to_date] + ([company] if company else [])))

    # Fetch all Mode of Payments used in Payment Entries
    mops_pe = frappe.db.sql(f"""
        SELECT DISTINCT pe.mode_of_payment
        FROM `tabPayment Entry` pe
        WHERE pe.docstatus = 1
        AND pe.payment_type = 'Receive'
        AND pe.posting_date BETWEEN %s AND %s
        {f"AND pe.company = %s" if company else ""}
    """, tuple([from_date, to_date] + ([company] if company else [])))

    # Combine and deduplicate MOPs
    mode_of_payments = sorted(set([r[0] for r in mops_si + mops_pe if r[0]]))

    # Report columns
    columns = [
        {
            "label": "Sales Person",
            "fieldname": "sales_person",
            "fieldtype": "Data",
            "width": 150
        },
        {
            "label": "Total Sales",
            "fieldname": "total_sales",
            "fieldtype": "Currency",
            "width": 130
        },
    ]

    for mop in mode_of_payments:
        columns.append({
            "label": mop,
            "fieldname": frappe.scrub(mop),
            "fieldtype": "Currency",
            "width": 130
        })

    columns += [
        {"label": "Total Payment", "fieldname": "total_payment", "fieldtype": "Currency", "width": 150},
        {"label": "Credit Sales", "fieldname": "credit_sales", "fieldtype": "Currency", "width": 130},
        {"label": "Unpaid Invoices", "fieldname": "unpaid_invoices", "fieldtype": "Currency", "width": 130},
        {"label": "Raw Sales Person", "fieldname": "raw_sales_person", "fieldtype": "Data", "hidden": 1},
    ]

    # Data dictionary
    sales_data = {}

    # --- Sales Invoice Data ---
    si_data = frappe.db.sql(f"""
        SELECT
            COALESCE(u.full_name, si.owner) AS sales_person,
            si.name AS invoice,
            si.grand_total,
            si.outstanding_amount,
            si.custom_credit_limit,
            sip.mode_of_payment,
            sip.amount
        FROM `tabSales Invoice` si
        LEFT JOIN `tabSales Invoice Payment` sip ON sip.parent = si.name
        LEFT JOIN `tabUser` u ON u.name = si.owner
        WHERE si.docstatus = 1
        AND si.posting_date BETWEEN %s AND %s
        {f"AND si.company = %s" if company else ""}
    """, tuple([from_date, to_date] + ([company] if company else [])), as_dict=True)

    processed_invoices = set()

    for row in si_data:
        key = row.sales_person or "Unknown"

        if key not in sales_data:
            sales_data[key] = {
                "sales_person": key,
                "raw_sales_person": key,
                "total_sales": 0,
                "credit_sales": 0,
                "unpaid_invoices": 0,
                "total_payment": 0,
                **{frappe.scrub(mop): 0 for mop in mode_of_payments}
            }

        if row.invoice not in processed_invoices:
            sales_data[key]["total_sales"] += row.grand_total or 0
            processed_invoices.add(row.invoice)

        if (row.custom_credit_limit or 0) > 0:
            sales_data[key]["credit_sales"] += row.outstanding_amount or 0
        else:
            sales_data[key]["unpaid_invoices"] += row.outstanding_amount or 0

        if row.mode_of_payment:
            mop_key = frappe.scrub(row.mode_of_payment)
            sales_data[key][mop_key] += row.amount or 0

        sales_data[key]["total_payment"] = sum(
            sales_data[key][frappe.scrub(mop)] for mop in mode_of_payments
        )

    # --- Payment Entry Data ---
    pe_data = frappe.db.sql(f"""
        SELECT
            COALESCE(u.full_name, pe.owner) AS sales_person,
            pe.mode_of_payment,
            pe.paid_amount
        FROM `tabPayment Entry` pe
        LEFT JOIN `tabUser` u ON u.name = pe.owner
        WHERE
            pe.docstatus = 1
            AND pe.payment_type = 'Receive'
            AND pe.posting_date BETWEEN %s AND %s
            {f"AND pe.company = %s" if company else ""}
    """, tuple([from_date, to_date] + ([company] if company else [])), as_dict=True)

    for row in pe_data:
        key = row.sales_person or "Unknown"

        if key not in sales_data:
            sales_data[key] = {
                "sales_person": key,
                "raw_sales_person": key,
                "total_sales": 0,
                "credit_sales": 0,
                "unpaid_invoices": 0,
                "total_payment": 0,
                **{frappe.scrub(mop): 0 for mop in mode_of_payments}
            }

        if row.mode_of_payment:
            mop_key = frappe.scrub(row.mode_of_payment)
            sales_data[key][mop_key] += row.paid_amount or 0

        sales_data[key]["total_payment"] = sum(
            sales_data[key][frappe.scrub(mop)] for mop in mode_of_payments
        )

    return columns, list(sales_data.values())
