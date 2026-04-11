/**
 * One-shot TS → JS conversion: strips types, preserves module structure.
 * Run from repo root: node scripts/ts-to-js-convert.mjs <targetDir>
 * Example: node scripts/ts-to-js-convert.mjs backend/api-server
 *
 * Requires: typescript (workspace devDependency)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("Usage: node scripts/ts-to-js-convert.mjs <path-to-package-root>");
  process.exit(1);
}

const pkgRoot = path.resolve(repoRoot, targetArg);

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walk(p, acc);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      if (e.name.endsWith(".d.ts")) continue;
      acc.push(p);
    }
  }
  return acc;
}

function transpile(filePath, source) {
  const isTsx = filePath.endsWith(".tsx");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      // Preserve JSX in .tsx → .jsx so Vite keeps compiling it; easier to read than React 17+ `_jsx` output.
      jsx: isTsx ? ts.JsxEmit.Preserve : ts.JsxEmit.Preserve,
      removeComments: false,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });
  if (diagnostics?.length) {
    const msg = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error(`${filePath}: ${msg}`);
  }
  return outputText;
}

async function main() {
  const files = await walk(pkgRoot);
  files.sort();
  console.log(`Found ${files.length} files under ${pkgRoot}`);

  for (const filePath of files) {
    const rel = path.relative(pkgRoot, filePath);
    const source = await fs.readFile(filePath, "utf8");
    const out = transpile(filePath, source);
    const outPath =
      filePath.endsWith(".tsx") ? filePath.slice(0, -4) + ".jsx" : filePath.slice(0, -3) + ".js";
    await fs.writeFile(outPath, out, "utf8");
    await fs.unlink(filePath);
    console.log(`${rel} → ${path.relative(pkgRoot, outPath)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
