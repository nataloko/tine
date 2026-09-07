// Verify + screenshot the query-builder "ƒ filter" button (ADR 0038): it opens
// the Sheets formula editor targeting `tine.query-filter::`, so a coarse query's
// results can be refined with a readable boolean expression
// (`priority == "A" && deadline < today()`) without leaving the visual builder or
// breaking the Logseq round-trip. Replaces the retired "⚙ advanced" Datalog
// switch. Headless Chromium over the mock backend.
//
// Set TINE_CHROMIUM=/path/to/chromium to use a system browser (e.g. on NixOS,
// where Playwright's bundled Chromium won't launch); defaults to the bundled one.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { waitForHttpServer } from "./e2e-capabilities.mjs";

const PORT = 5263;
const OUT = "screenshots";
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });

try {
  // FORK: upstream's shared readiness helper (a scripts/*.mjs may not define its
  // own waitForServer — e2e-capabilities.test.mjs I-12/DUP-12b enforces it), with
  // the fork's system-Chromium escape hatch on the launch below.
  await waitForHttpServer(`http://localhost:${PORT}/`, 40, 250, { failureMessage: "server did not start" });
  const browser = await chromium.launch({
    executablePath: process.env.TINE_CHROMIUM || undefined,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1300 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("pageerror:", String(e).split("\n")[0]));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector(".page-title", { timeout: 8000 });
  await sleep(500);

  // The ƒ-filter button lives in the query builder bar; assert its label, then
  // shoot the bar so the affordance is visible next to + sort / + summarize.
  const btn = page.locator(".qb-advanced").first();
  const label = (await btn.innerText().catch(() => "")).trim();
  console.log("filter button label:", JSON.stringify(label), label === "ƒ filter" ? "(ok)" : "(UNEXPECTED)");

  const bar = page.locator(".qb-bar").first();
  await bar.scrollIntoViewIfNeeded();
  await sleep(200);
  const barBox = await bar.boundingBox();
  if (barBox) {
    await page.screenshot({
      path: `${OUT}/query-filter-button.png`,
      clip: { x: Math.max(0, barBox.x - 8), y: Math.max(0, barBox.y - 8), width: Math.min(1200, barBox.width + 16), height: barBox.height + 16 },
    });
    console.log(`wrote ${OUT}/query-filter-button.png`);
  }

  // Clicking it opens the formula editor (not a Datalog rewrite). Type a filter so
  // the editor's field chips + expression box are captured, then save and confirm
  // the button reflects the active filter.
  await btn.click();
  await sleep(500);
  const editor = page.locator(".formula-editor").first();
  const opened = (await editor.count()) > 0;
  console.log("formula editor opened:", opened);
  if (opened) {
    const ta = page.locator(".formula-editor-textarea").first();
    if (await ta.count()) { await ta.fill('priority == "A"'); await sleep(300); }
    await page.screenshot({ path: `${OUT}/query-filter-editor.png` });
    console.log(`wrote ${OUT}/query-filter-editor.png`);

    const save = page.locator(".formula-editor-btn.primary").first();
    if (await save.count()) { await save.click(); await sleep(500); }
    const active = await page.locator(".qb-advanced.active").count();
    const filterErr = await page.locator(".query-filter-error").count();
    console.log("filter active after save:", active > 0, "| fail-open notice shown:", filterErr > 0);
  }

  await browser.close();
  console.log("DONE");
} catch (e) {
  console.log("ERROR:", String(e).split("\n").slice(0, 3).join(" | "));
  process.exitCode = 2;
} finally {
  server.kill("SIGTERM");
}
