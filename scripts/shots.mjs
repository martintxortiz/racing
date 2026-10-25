// Screenshot helper for visual review (not part of the app). Usage:
//   node scripts/shots.mjs <outdir> <name> <url-query> [theme]
// Optional: W=1920 H=1080 set the viewport (default 1600x1000).
// Optional: RCLICK=<selector> RCLICK_AT=fx,fy right-clicks before the capture; SUBMENU=<label> then opens that submenu.
import puppeteer from "puppeteer-core";

const [out, name, query = "", theme = "light"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3313";
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 1000);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox", `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
await page.evaluateOnNewDocument((th) => {
  try {
    const k = "racing.workspace.v1";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    v.theme = th;
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}, theme);
await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle2" });
if (query.includes("src=")) await page.waitForSelector("[data-testid=timing-table], [data-testid=mosaic]", { timeout: 60000 });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 2500)));
if (process.env.RCLICK) {
  const el = await page.$(process.env.RCLICK);
  if (!el) throw new Error(`no element ${process.env.RCLICK}`);
  const b = await el.boundingBox();
  const [fx, fy] = (process.env.RCLICK_AT ?? "0.5,0.5").split(",").map(Number);
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy);
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy, { button: "right" });
  await new Promise((r) => setTimeout(r, 400));
  if (process.env.SUBMENU) {
    const item = await page.evaluateHandle((l) => [...document.querySelectorAll("[data-menu] [role=menuitem]")].find((x) => x.textContent.trim().startsWith(l)), process.env.SUBMENU);
    const ib = await item.asElement()?.boundingBox();
    if (ib) await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
    await new Promise((r) => setTimeout(r, 500));
  }
}
await page.screenshot({ path: `${out}/${name}.png` });
await browser.close();
console.log("saved", `${out}/${name}.png`);
