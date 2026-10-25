// Headless smoke test against a running dev or start server.
//   BASE_URL   default http://localhost:3313
//   SMOKE_SRC  file URL to open with ?src= instead of clicking "Load sample"
//   SHOTS_DIR  when set, saves screenshots of the steps there
//   CHROME     browser binary, default /usr/bin/google-chrome
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3313";
const SRC = process.env.SMOKE_SRC ?? "";
const SHOTS = process.env.SHOTS_DIR ?? "";
const THEME = process.env.THEME ?? "light";
const errors = [];
let step = "start";
const ok = (msg) => console.log(`ok  ${msg}`);
const fail = (msg) => {
  throw new Error(`${step}: ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});
await page.evaluateOnNewDocument((theme) => {
  if (!localStorage.getItem("racing.workspace.v1")) localStorage.setItem("racing.workspace.v1", JSON.stringify({ theme }));
}, THEME);
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

const panels = () => page.$$eval("[data-panel-id]", (els) => els.length);
const tabs = () => page.$$eval("[role=tab]", (els) => els.map((e) => e.textContent.trim()));
const menuOpen = () => page.$("[data-menu]");
const clickTab = (name) =>
  page.evaluate((name) => {
    const el = [...document.querySelectorAll("[role=tab]")].find((x) => x.textContent.trim() === name);
    el?.click();
    return !!el;
  }, name);
const clickMenuItem = (label) =>
  page.evaluate((label) => {
    const el = [...document.querySelectorAll("[data-menu] [role=menuitem]")].find((x) => x.textContent.trim().startsWith(label));
    el?.click();
    return !!el;
  }, label);
const rightClick = async (selector, dx = 0.5, dy = 0.5) => {
  const el = await page.$(selector);
  if (!el) fail(`no element ${selector}`);
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width * dx, b.y + b.height * dy, { button: "right" });
  await sleep(250);
};

try {
  step = "load";
  await page.goto(SRC ? `${BASE}/?src=${encodeURIComponent(SRC)}` : BASE, { waitUntil: "networkidle2" });
  if (!SRC) {
    await shot("smoke-empty");
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Load sample");
      b?.click();
      return !!b;
    });
    if (!clicked) fail("no Load sample button");
  }
  await page.waitForSelector("[data-testid=timing-table]", { timeout: 120000 });
  ok("file loaded, timing table rendered");

  step = "tabs";
  const names = await tabs();
  if (names.length < 3) fail(`expected 3 preset tabs, got ${names.join(", ")}`);
  for (const n of names) {
    await clickTab(n);
    await sleep(1200);
    const count = await panels();
    if (!count) fail(`tab ${n} has no panels`);
    const broken = await page.$$eval("[data-panel-id]", (els) => els.filter((e) => /This panel failed to render/.test(e.textContent)).length);
    if (broken) fail(`tab ${n}: ${broken} panels crashed`);
    ok(`tab ${n}: ${count} panels`);
  }
  await clickTab(names[0]);
  await sleep(800);

  step = "row menu";
  await rightClick("[data-testid=timing-table] tbody tr[data-entity]", 0.3, 0.5);
  if (!(await menuOpen())) fail("row menu did not open");
  const items = await page.$$eval("[data-menu] [role=menuitem]", (els) => els.map((e) => e.textContent.trim()));
  if (!items.some((x) => /^Compare/.test(x))) fail(`row menu has no Compare item: ${items.join(" | ")}`);
  await shot("smoke-row-menu");
  ok(`row menu: ${items.length} items`);
  await clickMenuItem("Compare");
  await sleep(300);
  if (await menuOpen()) await page.keyboard.press("Escape");

  step = "add panel";
  const before = await panels();
  const addBtn = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Add panel"));
  await addBtn.asElement().click();
  await page.waitForSelector("[data-widget-option=signal]", { timeout: 5000 });
  await shot("smoke-picker");
  await page.click("[data-widget-option=signal]");
  await sleep(800);
  const after = await panels();
  if (after !== before + 1) fail(`panel count ${before} -> ${after}`);
  ok(`added a panel (${before} -> ${after})`);

  step = "remove panel";
  await rightClick("[data-widget=signal] > div", 0.3, 0.5);
  if (!(await clickMenuItem("Remove panel"))) fail("no Remove panel item");
  await sleep(500);
  if ((await panels()) !== before) fail("panel was not removed");
  ok("removed the panel");

  step = "add tab";
  const tb = (await tabs()).length;
  await page.click("[aria-label='New tab']");
  await sleep(500);
  const ta = (await tabs()).length;
  if (ta !== tb + 1) fail(`tab count ${tb} -> ${ta}`);
  ok(`added a tab (${tb} -> ${ta})`);

  step = "errors";
  if (errors.length) fail(errors.join("\n"));
  ok("no page errors");
  console.log("smoke passed");
} catch (e) {
  console.error(`FAIL ${e.message}`);
  if (errors.length) console.error(errors.join("\n"));
  await shot("smoke-failure");
  process.exitCode = 1;
} finally {
  await browser.close();
}
