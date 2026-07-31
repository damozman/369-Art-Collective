#!/usr/bin/env node
/**
 * Screenshot a page so Claude can look at it.
 *
 *   node scripts/screenshot.mjs <url> [outfile] [--width=1280] [--height=800]
 *                               [--full] [--dark] [--wait=selector] [--delay=ms]
 *
 * Examples:
 *   node scripts/screenshot.mjs http://localhost:5000 /tmp/home.png
 *   node scripts/screenshot.mjs http://localhost:5000/artist/dashboard /tmp/dash.png --full
 *   node scripts/screenshot.mjs http://localhost:5000 /tmp/mobile.png --width=390 --height=844
 *
 * Requires: npm i -D playwright && npx playwright install chromium
 * (skip the install in the cloud sandbox — Chromium is preinstalled, see below)
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Cloud sandboxes ship a preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH,
 * but its build number rarely matches whatever playwright version npm resolved,
 * so the default launch fails with "browser not found". Find the binary that is
 * actually on disk and point at it directly.
 */
function preinstalledChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse()
    .map((d) => join(root, d, "chrome-linux", "chrome"));
  return candidates.find((p) => existsSync(p));
}

const executablePath = preinstalledChromium();

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);
const positional = args.filter((a) => !a.startsWith("--"));

const url = positional[0];
const outfile = positional[1] ?? "/tmp/screenshot.png";

if (!url) {
  console.error("usage: node scripts/screenshot.mjs <url> [outfile] [flags]");
  process.exit(1);
}

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"], // sandbox sessions run as root
});
const page = await browser.newPage({
  viewport: {
    width: Number(flags.width ?? 1280),
    height: Number(flags.height ?? 800),
  },
  deviceScaleFactor: 2, // retina — text stays legible when Claude reads it
  colorScheme: flags.dark ? "dark" : "light",
});

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  if (flags.wait) await page.waitForSelector(String(flags.wait), { timeout: 15_000 });
  if (flags.delay) await page.waitForTimeout(Number(flags.delay));

  await page.screenshot({ path: outfile, fullPage: Boolean(flags.full) });
  console.log(`saved ${outfile}`);

  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
  }
} catch (err) {
  console.error(`failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
