/** @param {string} v */
function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} filename
 */
export function downloadPayrollRowsCsv(rows, filename) {
  const headers = [
    "id",
    "employeeId",
    "employeeName",
    "month",
    "year",
    "period",
    "baseSalary",
    "bonus",
    "deductions",
    "netSalary",
    "status",
    "paidAt",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const period = `${r.month ?? ""}/${r.year ?? ""}`;
    lines.push(
      [
        r.id,
        r.employeeId,
        r.employeeName,
        r.month,
        r.year,
        period,
        r.baseSalary,
        r.bonus,
        r.deductions,
        r.netSalary,
        r.status,
        r.paidAt ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ months: string[]; format: (n: number) => string }} ctx
 */
export function printPayrollSlip(row, ctx) {
  const name = String(row.employeeName ?? `Employee #${row.employeeId}`);
  const period = `${ctx.months[(Number(row.month) || 1) - 1]} ${row.year}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pay slip — ${name}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:480px;margin:auto}
h1{font-size:1.1rem}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px 0;border-bottom:1px solid #eee}
.num{text-align:right}.muted{color:#666;font-size:12px}</style></head><body>
<h1>FurniCore — pay slip</h1>
<p class="muted">${period}</p>
<p><strong>${name}</strong></p>
<table>
<tr><td>Base</td><td class="num">${ctx.format(Number(row.baseSalary ?? 0))}</td></tr>
<tr><td>Bonus</td><td class="num">${ctx.format(Number(row.bonus ?? 0))}</td></tr>
<tr><td>Deductions</td><td class="num">${ctx.format(Number(row.deductions ?? 0))}</td></tr>
<tr><td><strong>Net</strong></td><td class="num"><strong>${ctx.format(Number(row.netSalary ?? 0))}</strong></td></tr>
<tr><td>Status</td><td class="num">${String(row.status ?? "")}</td></tr>
</table>
<p class="muted">Generated from FurniCore payroll.</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=640,height=720");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/**
 * @param {unknown} notesRaw
 * @returns {Record<string, unknown>|null}
 */
export function parsePayrollBreakdown(notesRaw) {
  if (typeof notesRaw !== "string" || !notesRaw.trim()) return null;
  try {
    const o = JSON.parse(notesRaw);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}
