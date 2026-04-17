/** Client-side table: filter, sort, paginate (for datasets loaded in full from the API). */
export function compareValues(a, b) {
    if (typeof a === "number" && typeof b === "number")
        return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
export function filterAndSortRows(rows, options) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const q = String(options?.search ?? "").trim().toLowerCase();
    const filtered = safeRows.filter((r) => options.match(r, q));
    return [...filtered].sort((a, b) => {
        const va = options.getSortValue(a, options.sortKey);
        const vb = options.getSortValue(b, options.sortKey);
        const cmp = compareValues(va, vb);
        return options.sortDir === "asc" ? cmp : -cmp;
    });
}
export function paginateRows(sorted, page, pageSize) {
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);
    return { pageRows, total, totalPages, page: safePage };
}
/** @deprecated Use filterAndSortRows + paginateRows */
export function processClientTable(rows, options) {
    const sorted = filterAndSortRows(rows, options);
    return paginateRows(sorted, options.page, options.pageSize);
}
function escapeCsvCell(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
export function exportRowsToCsv(filename, headers, rows) {
    const lines = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
