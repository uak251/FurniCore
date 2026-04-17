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
 * @param {string} s
 */
function sanitizeFilenamePart(s) {
  return String(s ?? "")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 48);
}

function escapeHtmlTitle(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ months: string[]; format: (n: number) => string }} ctx
 * @param {{ intent: "print" | "pdf" }} options
 */
export function openPayrollSlipWindow(row, ctx, options) {
  const intent = options?.intent === "pdf" ? "pdf" : "print";
  const name = String(row.employeeName ?? `Employee #${row.employeeId}`);
  const period = `${ctx.months[(Number(row.month) || 1) - 1]} ${row.year}`;
  const breakdown = parsePayrollBreakdown(row.notes);
  const attendance = breakdown?.attendance && typeof breakdown.attendance === "object" ? breakdown.attendance : null;
  const signatureUrl = row.signatureUrl ? String(row.signatureUrl) : "";
  const signatureBlock = signatureUrl
    ? `<div style="margin-top:24px"><div class="muted">Employee Signature</div><img src="${signatureUrl}" alt="Employee signature" style="max-height:80px;max-width:180px;object-fit:contain;border-bottom:1px solid #ddd;padding-bottom:8px" /></div>`
    : `<div style="margin-top:24px" class="muted">Employee Signature: _____________________</div>`;
  const pdfTitle = `Pay-slip-${sanitizeFilenamePart(name)}-${row.year}-${String(Number(row.month) || 1).padStart(2, "0")}`;
  const pdfBanner =
    intent === "pdf"
      ? `<div style="margin:0 0 16px;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;font-size:13px;color:#9a3412">Use your browser’s print dialog and choose <strong>Save as PDF</strong> as the destination to download this slip.</div>`
      : "";
  const title = intent === "pdf" ? pdfTitle : `Pay slip — ${name}`;
  const onloadScript =
    intent === "pdf"
      ? `<script>window.onload=function(){document.title=${JSON.stringify(pdfTitle)};setTimeout(function(){window.print();},400);}<\/script>`
      : `<script>window.onload=function(){window.print();}<\/script>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtmlTitle(title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;padding:24px;max-width:680px;margin:auto;color:#111}
 h1{font-size:1.2rem;margin:0 0 8px} h2{font-size:1rem;margin:22px 0 8px}
 table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:7px 0;border-bottom:1px solid #eee}
 .num{text-align:right}.muted{color:#666;font-size:12px}.meta{display:flex;justify-content:space-between;gap:8px}
 .card{border:1px solid #eee;border-radius:10px;padding:12px 14px;background:#fafafa}</style></head><body>
${pdfBanner}
<h1>FurniCore Payroll Slip</h1>
<div class="meta"><p class="muted">Period: ${period}</p><p class="muted">Employee: ${name}</p></div>
<table>
<tr><td>Base</td><td class="num">${ctx.format(Number(row.baseSalary ?? 0))}</td></tr>
<tr><td>Bonus</td><td class="num">${ctx.format(Number(row.bonus ?? 0))}</td></tr>
<tr><td>Deductions</td><td class="num">${ctx.format(Number(row.deductions ?? 0))}</td></tr>
<tr><td><strong>Net</strong></td><td class="num"><strong>${ctx.format(Number(row.netSalary ?? 0))}</strong></td></tr>
<tr><td>Status</td><td class="num">${String(row.status ?? "")}</td></tr>
</table>
${attendance ? `<h2>Attendance Breakdown</h2><div class="card"><table>
<tr><td>Present</td><td class="num">${attendance.present ?? 0}</td></tr>
<tr><td>Absent</td><td class="num">${attendance.absent ?? 0}</td></tr>
<tr><td>Late</td><td class="num">${attendance.late ?? 0}</td></tr>
<tr><td>Half Day</td><td class="num">${attendance.halfDay ?? 0}</td></tr>
<tr><td>Attendance Penalty</td><td class="num">${ctx.format(Number(attendance.totalAttendancePenalty ?? 0))}</td></tr>
</table></div>` : ""}
${signatureBlock}
<p class="muted" style="margin-top:20px">Generated from FurniCore payroll.</p>
${onloadScript}
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=640,height=720");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ months: string[]; format: (n: number) => string }} ctx
 */
export function printPayrollSlip(row, ctx) {
  openPayrollSlipWindow(row, ctx, { intent: "print" });
}

/**
 * Opens the same slip layout with guidance to save via the system print dialog (Save as PDF).
 * @param {Record<string, unknown>} row
 * @param {{ months: string[]; format: (n: number) => string }} ctx
 */
export function savePayrollSlipAsPdf(row, ctx) {
  openPayrollSlipWindow(row, ctx, { intent: "pdf" });
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

/**
 * Flatten nested breakdown JSON into CSV rows (section, key, value).
 * @param {Record<string, unknown>} breakdown
 */
function flattenBreakdownRows(breakdown, prefix = "") {
  /** @type {Array<{ section: string; key: string; value: string }>} */
  const out = [];
  if (breakdown == null || typeof breakdown !== "object") return out;

  const walk = (obj, pfx) => {
    if (obj == null) return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        if (item != null && typeof item === "object") walk(item, `${pfx}[${i}]`);
        else out.push({ section: "array", key: `${pfx}[${i}]`, value: String(item ?? "") });
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const key = pfx ? `${pfx}.${k}` : k;
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        walk(v, key);
      }
      else if (Array.isArray(v)) {
        walk(v, key);
      }
      else {
        const sec = key.split(".")[0] || "field";
        out.push({ section: sec, key, value: String(v ?? "") });
      }
    }
  };
  walk(breakdown, prefix);
  return out;
}

/**
 * @param {{ employeeName?: string; employeeId?: number; month?: number; year?: number }} row
 * @param {Record<string, unknown>} breakdown
 * @param {string} filename
 */
export function downloadPayrollBreakdownCsv(row, breakdown, filename) {
  const meta = [
    ["meta", "employeeName", String(row?.employeeName ?? "")],
    ["meta", "employeeId", String(row?.employeeId ?? "")],
    ["meta", "month", String(row?.month ?? "")],
    ["meta", "year", String(row?.year ?? "")],
  ];
  const flat = flattenBreakdownRows(breakdown);
  const lines = [["section", "key", "value"].map(escapeCsvCell).join(",")];
  for (const r of meta) lines.push(r.map(escapeCsvCell).join(","));
  for (const r of flat) lines.push([r.section, r.key, r.value].map(escapeCsvCell).join(","));
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Printable breakdown (same window pattern as pay slip).
 * @param {{ employeeName?: string; employeeId?: number; month?: number; year?: number }} row
 * @param {Record<string, unknown>} breakdown
 * @param {{ periodLabel: string; format: (n: number) => string }} ctx
 */
export function printPayrollBreakdown(row, breakdown, ctx) {
  const name = String(row?.employeeName ?? `Employee #${row?.employeeId ?? ""}`);
  const period = ctx.periodLabel;
  const rows = flattenBreakdownRows(breakdown);
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtmlTitle(r.key)}</td><td class="num">${escapeHtmlTitle(r.value)}</td></tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Payroll breakdown — ${escapeHtmlTitle(name)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;padding:24px;max-width:720px;margin:auto;color:#111}
h1{font-size:1.15rem;margin:0 0 6px}
.muted{color:#666;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:6px 0;border-bottom:1px solid #eee}
.num{text-align:right}
@media print{body{padding:12px}}
</style></head><body>
<h1>Payroll calculation breakdown</h1>
<p class="muted">${escapeHtmlTitle(name)} · ${escapeHtmlTitle(period)}</p>
<table><thead><tr><th align="left">Field</th><th class="num">Value</th></tr></thead><tbody>${body}</tbody></table>
<p class="muted" style="margin-top:18px">Generated from FurniCore payroll.</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

