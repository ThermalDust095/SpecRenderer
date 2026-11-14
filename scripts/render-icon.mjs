// Renders media/icon.svg to the 128×128 PNG the Marketplace requires.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Uses any installed Playwright (local or global via NODE_PATH); not a project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const svg = await readFile(new URL("../media/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
await page.locator("svg").screenshot({ path: "media/icon.png", omitBackground: true });
await browser.close();
console.log("Wrote media/icon.png");
