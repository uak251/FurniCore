import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Human-readable payroll calculation from JSON stored in payroll.notes.
 */
export function PayrollBreakdownPanel({ breakdown, formatMoney }) {
  if (!breakdown || typeof breakdown !== "object") {
    return <p className="text-sm text-muted-foreground">No calculation details were stored for this run.</p>;
  }

  const att = breakdown.attendance && typeof breakdown.attendance === "object" ? breakdown.attendance : null;
  const bonusAdj = Array.isArray(breakdown.bonusAdjustments) ? breakdown.bonusAdjustments : [];
  const penAdj = Array.isArray(breakdown.penaltyAdjustments) ? breakdown.penaltyAdjustments : [];

  return (
    <div
      id="payroll-breakdown-print-root"
      className="space-y-6 text-sm print:space-y-4 print:text-black"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Monthly base" value={formatMoney(num(breakdown.monthlyBase))} />
        <Stat label="Working days" value={String(breakdown.workingDays ?? "—")} />
        <Stat label="Day rate" value={formatMoney(num(breakdown.dayRate))} hint="Base ÷ working days" />
        <Stat label="Net salary" value={formatMoney(num(breakdown.netSalary))} hint="After attendance & adjustments" />
      </div>

      {att ? (
        <section className="rounded-lg border bg-muted/20 p-4 print:border print:bg-white">
          <h3 className="mb-3 text-sm font-semibold">Attendance impact</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Count / amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Days recorded", att.totalRecords],
                  ["Present", att.present],
                  ["Absent", att.absent],
                  ["Late", att.late],
                  ["Half day", att.halfDay],
                ].map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell className="text-muted-foreground">{k}</TableCell>
                    <TableCell className="text-right tabular-nums">{v ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Penalty / adjustment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Absent penalty", att.absentPenalty],
                  ["Late penalty", att.latePenalty],
                  ["Half-day penalty", att.halfDayPenalty],
                  ["Total attendance penalty", att.totalAttendancePenalty],
                ].map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell className="text-muted-foreground">{k}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatMoney(num(v))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border p-4 print:border print:bg-white">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Bonus adjustments
            <Badge variant="secondary" className="text-[10px]">
              {bonusAdj.length}
            </Badge>
          </h3>
          {bonusAdj.length === 0 ? (
            <p className="text-xs text-muted-foreground">None applied.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {bonusAdj.map((b, i) => (
                <li key={i} className="flex justify-between gap-2 rounded-md bg-green-500/10 px-2 py-1">
                  <span className="text-muted-foreground">{String(b?.reason ?? b?.label ?? "Bonus")}</span>
                  <span className="font-medium tabular-nums text-green-700">{formatMoney(num(b?.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total bonus</span>
            <span className="tabular-nums text-green-700">{formatMoney(num(breakdown.totalBonus))}</span>
          </div>
        </section>

        <section className="rounded-lg border p-4 print:border print:bg-white">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Deduction adjustments
            <Badge variant="secondary" className="text-[10px]">
              {penAdj.length}
            </Badge>
          </h3>
          {penAdj.length === 0 ? (
            <p className="text-xs text-muted-foreground">None applied.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {penAdj.map((b, i) => (
                <li key={i} className="flex justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1">
                  <span className="text-muted-foreground">{String(b?.reason ?? b?.label ?? "Deduction")}</span>
                  <span className="font-medium tabular-nums text-destructive">{formatMoney(num(b?.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total deductions</span>
            <span className="tabular-nums text-destructive">{formatMoney(num(breakdown.totalDeductions))}</span>
          </div>
        </section>
      </div>

      <p className="text-[11px] text-muted-foreground print:text-gray-600">
        Figures reflect the payroll engine snapshot stored with this payroll record. Use CSV export for spreadsheet
        analysis.
      </p>
    </div>
  );
}
