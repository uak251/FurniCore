import fs from "fs";
const s = fs.readFileSync(new URL("../src/pages/customer-portal.jsx", import.meta.url), "utf8");
const line = s.split("\n").find((l) => l.includes("showCheckout") && l.includes("Place order"));
let o = 0,
    c = 0;
for (const ch of line) {
    if (ch === "[") o++;
    if (ch === "]") c++;
}
console.log("[", o, "] ", c, "diff", o - c);
