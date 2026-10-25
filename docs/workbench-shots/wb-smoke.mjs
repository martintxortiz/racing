import { createRequire } from "module";
const require = createRequire("/workspace/pitwall-ds/tools/");
const { chromium } = require("playwright-core");
const base = process.argv[2] ?? "http://localhost:3311";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const ok = (name, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
await page.goto(base + "/s/demo?theme=light&t=4985", { timeout: 120000 });
await page.waitForSelector('.wb[data-status="ready"]', { timeout: 180000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const panels = () => page.locator(".wb-panel").count();
const n0 = await panels();
ok("default layout panels", n0 === 5, n0);
// picker via P
await page.locator(".wb-main").click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.keyboard.press("p");
ok("picker opens with P", await page.locator(".wb-picker").isVisible());
await page.keyboard.type("trace");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
ok("picker adds panel", (await panels()) === n0 + 1, await panels());
// close the added panel through its close button (last panel)
await page.locator(".wb-panel").last().locator('[aria-label="Close panel"], button[title^="Close"]').first().click();
await page.waitForTimeout(300);
ok("close panel", (await panels()) === n0, await panels());
// right-click panel header -> menu
await page.locator(".wb-panel__header").first().click({ button: "right" });
ok("panel context menu", await page.locator(".wb-menu").isVisible(), (await page.locator(".wb-menu").innerText()).replace(/\n/g, " | ").slice(0, 200));
await page.keyboard.press("Escape");
// right-click a timing row
await page.locator(".wb-timing tbody tr").nth(2).click({ button: "right" });
const rowMenu = await page.locator(".wb-menu").innerText().catch(() => "");
ok("driver row menu", /Set as A/.test(rowMenu) && /Set as B/.test(rowMenu), rowMenu.replace(/\n/g, " | ").slice(0, 160));
await page.keyboard.press("Escape");
ok("Esc closed menu but kept B", /LEC/.test(await page.locator(".wb-ab").innerText()));
// X swaps A/B
const ab0 = await page.locator(".wb-ab").innerText();
await page.locator("body").press("x");
await page.waitForTimeout(200);
const ab1 = await page.locator(".wb-ab").innerText();
ok("X swaps A/B", ab0 !== ab1, `${ab0.replace(/\s+/g, " ")} -> ${ab1.replace(/\s+/g, " ")}`);
await page.locator("body").press("x");
// new tab
const tabs0 = await page.locator(".pw-tab").count();
await page.locator('[aria-label="New tab"]').click();
await page.waitForTimeout(300);
ok("new tab", (await page.locator(".pw-tab").count()) === tabs0 + 1);
ok("new tab empty state", await page.locator(".wb-tab-empty").isVisible());
// right-click empty space
await page.locator(".wb-tab-empty").click({ button: "right" });
ok("empty-space menu", await page.locator(".wb-menu").isVisible(), (await page.locator(".wb-menu").innerText().catch(() => "")).replace(/\n/g, " | ").slice(0, 160));
await page.keyboard.press("Escape");
// tab context menu -> delete
await page.locator(".pw-tab").last().click({ button: "right" });
const tabMenu = await page.locator(".wb-menu").innerText();
await page.locator(".wb-menu").getByText(/^Delete/).first().click();
await page.waitForTimeout(300);
ok("tab menu delete", (await page.locator(".pw-tab").count()) === tabs0, tabMenu.replace(/\n/g, " | "));
// playback
await page.locator(".pw-tab").first().click();
const clock = () => page.locator(".wb-clock").first().innerText();
const c0 = await clock();
await page.locator("body").press("Space");
await page.waitForTimeout(2000);
await page.locator("body").press("Space");
const c1 = await clock();
ok("Space plays", c0 !== c1, `${c0.replace(/\s+/g, " ")} -> ${c1.replace(/\s+/g, " ")}`);
await page.locator("body").press("ArrowRight");
await page.waitForTimeout(100);
ok("ArrowRight seeks", (await clock()) !== c1, (await clock()).replace(/\s+/g, " "));
// theme toggle
const th0 = await page.locator(".wb").getAttribute("data-theme");
await page.locator("body").press("\\");
await page.waitForTimeout(300);
ok("\\ toggles theme", (await page.locator(".wb").getAttribute("data-theme")) !== th0);
await page.locator("body").press("\\");
// save layout with ctrl+s
await page.locator("body").press("Control+s");
await page.waitForTimeout(300);
const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("layouts/v1/")));
ok("Ctrl+S saves layout", saved.length > 1, saved.join(","));
// URL state
await page.waitForTimeout(800);
ok("URL reflects state", /[?&]t=/.test(page.url()) && /[?&]a=/.test(page.url()), page.url());
// compare tab screenshot
await page.locator(".pw-tab", { hasText: "Compare" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/workbench-shots/smoke-compare.png" });
ok("compare tab panels", (await panels()) >= 2, await panels());
ok("no page errors", errs.length === 0, errs.slice(0, 5).join(" || "));
await browser.close();
