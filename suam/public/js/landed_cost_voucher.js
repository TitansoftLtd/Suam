frappe.provide("erpnext.stock");

erpnext.landed_cost_taxes_and_charges.setup_triggers("Landed Cost Voucher");
erpnext.stock.LandedCostVoucher = class LandedCostVoucher extends erpnext.stock.StockController {
	set_applicable_charges_for_item() {
		var me = this;

        if (this.frm.doc.taxes.length) {
            var total_item_cost = 0.0;
            var based_on = this.frm.doc.distribute_charges_based_on.toLowerCase();

            // Map display value to actual field in items
            var field_map = {
                "weight": "custom_weight",
                "amount": "amount",
                "qty": "qty",
            };

            let item_field = field_map[based_on];

            if (based_on != "distribute manually") {
                $.each(this.frm.doc.items || [], function (i, d) {
                    total_item_cost += flt(d[item_field]);
                });

                var total_charges = 0.0;
                $.each(this.frm.doc.items || [], function (i, item) {
                    item.applicable_charges =
                        (flt(item[item_field]) * flt(me.frm.doc.total_taxes_and_charges)) /
                        flt(total_item_cost);

                    item.applicable_charges = flt(
                        item.applicable_charges,
                        precision("applicable_charges", item)
                    );

                    total_charges += item.applicable_charges;
                });

                // Adjust for rounding difference
                if (total_charges != this.frm.doc.total_taxes_and_charges) {
                    var diff = this.frm.doc.total_taxes_and_charges - flt(total_charges);
                    this.frm.doc.items.slice(-1)[0].applicable_charges += diff;
                }

                refresh_field("items");
            }
        }
	}
	distribute_charges_based_on(frm) {
		this.set_applicable_charges_for_item();
	}
};