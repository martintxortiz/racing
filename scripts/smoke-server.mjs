// End-to-end smoke for the session server: starts server/ (unless API_URL is set), opens a race
// over the WebSocket stream in a running Next.js app and checks that the widgets fill in, that
// playback streams more data, that the session picker lists the server's sessions and that a
// live session shows LIVE.
//   BASE_URL        Next.js app, default http://localhost:3313
//   API_URL         use an already running session server instead of starting one
//   SMOKE_API_PORT  port for the server this script starts, default 8799
//   RACING_DATA_DIR passed to the server (default: its own default)
//   SMOKE_SESSION   session id to open, default: the first race the server lists
//   SHOTS_DIR       when set, saves screenshots there
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3313";
const SHOTS = process.env.SHOTS_DIR ?? "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = "start";
const ok = (msg) => console.log(`ok  ${msg}`);
const fail = (msg) => {
  throw new Error(`${step}: ${msg}`);
};

let server = null;
let API = process.env.API_URL;
if (!API) {
  const port = process.env.SMOKE_API_PORT ?? "8799";
  API = `http://127.0.0.1:${port}`;
  const py = join(root, "server", ".venv", "bin", "python");
  if (!existsSync(py)) throw new Error("server/.venv is missing: run `npm run server:setup` first");
  server = spawn(py, ["-m", "racing_server"], { cwd: join(root, "server"), env: { ...process.env, RACING_PORT: port }, stdio: ["ignore", "ignore", "pipe"] });
  let log = "";
  server.stderr.on("data", (b) => (log = (log + b).slice(-4000)));
  server.on("exit", (code) => code && console.error(`server exited with ${code}\n${log}`));
}

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {}
    await sleep(250);
  }
  fail(`timed out waiting for ${what}`);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000 },
});
const errors = [];
let code = 0;
try {
  step = "server";
  await waitFor(() => fetch(`${API}/api/health`).then((r) => r.ok), 30000, `${API}/api/health`);
  const sessions = await (await fetch(`${API}/api/sessions`)).json();
  const id = process.env.SMOKE_SESSION ?? sessions.find((s) => !s.live && /race$/i.test(s.id))?.id ?? sessions[0]?.id;
  if (!id) fail("the server lists no sessions; set RACING_DATA_DIR");
  ok(`server up at ${API}: ${sessions.length} sessions, opening ${id}`);

  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const frames = { history: 0, stream: 0, live: 0 };
  cdp.on("Network.webSocketFrameReceived", (e) => {
    const m = /^\{"type":"batch","kind":"(\w+)"/.exec(e.response.payloadData) ?? /"type":"batch".*?"kind":"(\w+)"/.exec(e.response.payloadData.slice(0, 200));
    if (m && m[1] in frames) frames[m[1]]++;
  });
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  const q = (extra = "") => `${BASE}/?api=${encodeURIComponent(id)}&apiBase=${encodeURIComponent(API)}${extra}`;
  const tower = () =>
    page.$$eval("[data-testid=ranking-tower] tbody tr", (rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent.trim())));

  step = "replay";
  await page.goto(q("&lap=10"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=ranking-tower]", { timeout: 120000 });
  const rows = await waitFor(async () => {
    const r = await tower();
    return r.length >= 10 && r.filter((c) => c.some((x) => /^\d:\d\d\.\d{3}$/.test(x))).length >= 10 ? r : null;
  }, 60000, "lap times in the ranking tower");
  ok(`ranking tower: ${rows.length} rows with lap times at lap 10`);
  await waitFor(async () => (await tower()).filter((c) => Number(c.at(-1)) > 0).length >= 5, 60000, "speeds from the telemetry stream");
  ok(`telemetry streamed: speeds shown (${frames.history} history batches)`);
  await shot("api-replay");

  step = "play";
  const before = frames.stream;
  await page.keyboard.press("Space");
  await waitFor(() => frames.stream - before >= 5, 15000, "paced stream batches while playing");
  await page.keyboard.press("Space");
  ok(`playback streamed ${frames.stream - before} batches`);

  step = "picker";
  await page.click("[data-testid=open-sessions]");
  const listed = await waitFor(() => page.$$eval("[data-testid=session-list] [data-session-id]", (els) => els.length), 15000, "the session list");
  if (listed < sessions.filter((s) => !s.live).length) fail(`picker lists ${listed} of ${sessions.length} sessions`);
  ok(`session picker lists ${listed} sessions`);
  await shot("api-picker");
  await page.keyboard.press("Escape");

  step = "live";
  await page.goto(q("&live=1&speed=4"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=live-indicator][data-following=true]", { timeout: 60000 });
  await waitFor(async () => (await tower()).length >= 10, 30000, "tower rows in live mode");
  const live0 = frames.live;
  await waitFor(() => frames.live > live0, 20000, "live batches");
  ok("live session: LIVE shown, tower filled, live batches arriving");
  await shot("api-live");

  if (errors.length) fail(errors.join("\n"));
  ok("no page errors");
} catch (e) {
  console.error(`FAIL ${e.message}`);
  code = 1;
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
process.exit(code);
