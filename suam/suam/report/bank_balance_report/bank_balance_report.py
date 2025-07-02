import frappe

def execute(filters=None):
    # Ensure filters is not None
    filters = filters or {}

    # Column Headers
    columns = [
        {"label": "Bank Balances", "fieldname": "bank_name", "fieldtype": "Data", "width": 250},
        {"label": "Ledger Bank Balance", "fieldname": "ledger_balance", "fieldtype": "Currency", "width": 200},
        {"label": "Unreconciled Entries", "fieldname": "unreconciled_entries", "fieldtype": "Currency", "width": 200},
        {"label": "Difference", "fieldname": "difference", "fieldtype": "Currency", "width": 150}
    ]

    # Fetch dynamic bank & cash accounts
    account_filters = {"account_type": ["in", ["Bank", "Cash"]], "is_group": 0}

    # Apply Account Filter (if selected)
    if filters.get("account"):
        account_filters["name"] = filters["account"]

    bank_accounts = frappe.get_all("Account", filters=account_filters, fields=["name"])

    data = []

    for account in bank_accounts:
        account_name = account["name"]

        # Get Ledger Balance
        ledger_balance = frappe.db.sql("""
            SELECT SUM(debit) - SUM(credit) AS balance
            FROM `tabGL Entry`
            WHERE account = %s
        """, (account_name,), as_dict=True)[0].get("balance", 0) or 0

        # Get Unreconciled Entries
        unreconciled_entries = frappe.db.sql("""
            SELECT SUM(debit) - SUM(credit) AS unreconciled
            FROM `tabGL Entry`
            WHERE account = %s AND (against_voucher IS NULL OR against_voucher = '')
        """, (account_name,), as_dict=True)[0].get("unreconciled", 0) or 0

        # Calculate Difference
        difference = ledger_balance - unreconciled_entries

        # Append data row
        data.append({
            "bank_name": account_name,
            "ledger_balance": ledger_balance,
            "unreconciled_entries": unreconciled_entries,
            "difference": difference
        })

    return columns, data