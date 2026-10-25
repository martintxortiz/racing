// Run the Python session server (server/) from npm: `npm run server`, `--setup`, `--test`.
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "server");
const win = process.platform === "win32";
const py = join(dir, ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");
const arg = process.argv[2];

function setup() {
  const sys = process.env.PYTHON || (win ? "python" : "python3");
  console.log(`Creating server/.venv with ${sys} and installing requirements…`);
  let r = spawnSync(sys, ["-m", "venv", ".venv"], { cwd: dir, stdio: "inherit" });
  if (r.status) process.exit(r.status);
  r = spawnSync(py, ["-m", "pip", "install", "-q", "-r", "requirements-dev.txt"], { cwd: dir, stdio: "inherit" });
  if (r.status) process.exit(r.status);
}

if (arg === "--setup" || !existsSync(py)) setup();
if (arg === "--setup") process.exit(0);
const args = arg === "--test" ? ["-m", "pytest", "-q", ...process.argv.slice(3)] : ["-m", "racing_server"];
const child = spawn(py, args, { cwd: dir, stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
