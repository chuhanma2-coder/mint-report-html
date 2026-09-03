#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = spawnSync(process.execPath, [path.join(root, "tests/v011-collaboration-contracts.mjs")], { encoding: "utf8", maxBuffer: 20_000_000 });
assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);
const info = JSON.parse(fixture.stdout.trim().split("\n").at(-1));

async function loadPlaywright() {
  if (process.env.MINT_PLAYWRIGHT_MODULE) return import(pathToFileURL(process.env.MINT_PLAYWRIGHT_MODULE).href);
  const require = createRequire(path.join(process.env.RUNTIME_NODE_MODULES, "package.json"));
  return import(pathToFileURL(require.resolve("playwright")).href);
}

const playwright = await loadPlaywright(), chromium = playwright.chromium || playwright.default?.chromium;
const browser = await chromium.launch({ headless: true, executablePath: process.env.MINT_CHROMIUM_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(info.productWork).href); await page.keyboard.press("e");
  const chart = page.locator('[data-edit-kind="chart"]'); await chart.click();
  await page.locator('.mint-editor [name="type"]').selectOption("line");
  await page.locator('.mint-editor textarea').fill('系列/分类\tY1\tY2\n收入\t10\t20\n成本\t100\t110');
  await page.locator('.mint-editor [data-apply]').click();
  const points = await chart.locator('polyline').evaluateAll(nodes => nodes.map(node => node.getAttribute('points').split(' ').map(pair => Number(pair.split(',')[1]))));
  assert.equal(points.length, 2); assert.ok(points[1][0] < points[0][0] && points[1][1] < points[0][1], '同单位多系列必须使用共享绝对坐标');

  await chart.click(); await page.locator('.mint-editor [name="type"]').selectOption("bar");
  await page.locator('.mint-editor textarea').fill('系列/分类\tY1\tY2\n利润\t-10\t20');
  await page.locator('.mint-editor [data-apply]').click();
  assert.equal(await chart.locator('line[stroke-dasharray]').count(), 1, '跨零数据必须显示零轴');
  assert.equal(await chart.locator('rect').count(), 2);
  console.log(JSON.stringify({ passed: true, sharedAbsoluteAxis: true, negativeZeroAxis: true }));
} finally { await browser.close(); }
