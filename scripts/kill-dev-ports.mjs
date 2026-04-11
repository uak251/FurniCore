/**
 * Free common dev ports (API 3000, Vite 5173–5180) so `pnpm run dev` / `dev:api` can bind.
 * Windows: netstat + taskkill. Unix: lsof/ss + kill.
 */
import { execSync } from "node:child_process";

const PORTS = [3000, 5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];

function killWindows(port) {
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING"))
        continue;
      if (!line.includes(`:${port}`))
        continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid))
        pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
        console.log(`freed port ${port} (PID ${pid})`);
      }
      catch {
        /* ignore */
      }
    }
  }
  catch {
    /* ignore */
  }
}

function killUnix(port) {
  try {
    const out = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf8", shell: true });
    const pids = out.trim().split(/\n/).filter(Boolean);
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "pipe" });
        console.log(`freed port ${port} (PID ${pid})`);
      }
      catch {
        /* ignore */
      }
    }
  }
  catch {
    /* ignore */
  }
}

const killPort = process.platform === "win32" ? killWindows : killUnix;
console.log(`Clearing ports ${PORTS.join(", ")}...`);
for (const p of PORTS)
  killPort(p);
console.log("Done.");
