/**
 * Cross-platform preinstall: remove foreign lockfiles and enforce pnpm.
 * (Shell-based preinstall does not run on Windows without Git Bash.)
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
for (const name of ["package-lock.json", "yarn.lock"]) {
  try {
    fs.unlinkSync(path.join(root, name));
  } catch {
    // ignore missing / unreadable
  }
}

const ua = process.env.npm_config_user_agent || "";
if (!ua.includes("pnpm")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
