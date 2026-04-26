# FurniCore Business & Workflow Notes

## Business Nature
FurniCore is a furniture manufacturing ERP focused on end-to-end operations across sourcing, production, finance, workforce, and customer order fulfillment.

## Operating Flow (High-level)
1. **Inventory & Procurement**
   - Raw materials are tracked in inventory with reorder levels.
   - Supplier quotes are collected and compared.
   - Approved purchasing feeds stock availability and costs.

2. **Production / Manufacturing**
   - Production orders and manufacturing tasks are created per product.
   - Material usage and QC checkpoints are logged.
   - Progress status drives visibility for managers and workers.

3. **HR & Payroll**
   - Employees, attendance, and performance reviews are maintained.
   - Attendance and adjustments contribute to payroll calculation/approval.

4. **Sales / Customer Lifecycle**
   - Customer orders move through processing and invoice/payment states.
   - Customer profiles retain locality/currency preferences for experience.

5. **Accounting & Finance**
   - Transactions and journals provide operational financial reporting.
   - Valuation method (FIFO/LIFO/WAC) influences inventory-finance views.

6. **Notifications & Governance**
   - Alerts and activity logs provide traceability and operational follow-up.
   - Settings define system defaults, access behavior, and analytics context.

## Decision Focus
- Keep module KPIs actionable (not just descriptive).
- Tie charts to operational decisions (reorder, quote selection, bottlenecks, payroll variance, unresolved alerts).
- Prefer consistent chart semantics across modules for team readability.
