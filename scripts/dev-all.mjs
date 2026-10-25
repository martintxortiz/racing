// `npm run dev:all`: the session server (port 8000) and the Next.js dev server together.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = process.env.RACING_PORT || "8000";
const env = { ...process.env, RACING_PORT: apiPort, NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || `http://localhost:${apiPort}` };
const procs = [
  ["api", spawn(process.execPath, [join(root, "scripts/server.mjs")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })],
  ["web", spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", ...(process.env.PORT ? ["-p", process.env.PORT] : [])], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })],
];
for (const [name, p] of procs) {
  const tag = name === "api" ? "\x1b[36m[api]\x1b[0m " : "\x1b[35m[web]\x1b[0m ";
  const pipe = (stream, out) => stream.on("data", (b) => out.write(b.toString().replace(/^(?=.)/gm, tag)));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on("exit", (code) => {
    console.log(`${tag}exited with ${code}`);
    for (const [, q] of procs) q.kill("SIGTERM");
    process.exit(code ?? 0);
  });
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => procs.forEach(([, p]) => p.kill(s)));
