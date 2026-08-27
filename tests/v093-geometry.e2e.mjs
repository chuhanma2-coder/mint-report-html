#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { geometryAuditInPage } from "../scripts/geometry-audit.mjs";

const moduleName = process.env.MINT_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const candidates = [process.env.MINT_CHROMIUM_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const sceneMarkup = `<section class="mint-scene" data-scene-id="MC-test"><h2 class="text" data-element-id="title" data-qa-role="text" data-qa-overlap="forbid">不能遮挡文字</h2><div class="line" data-element-id="line" data-qa-role="connector" data-qa-overlap="forbid"></div></section>`;
  await page.setContent(`<!doctype html><style>body{margin:0}.mint-scene{position:relative;width:800px;height:500px}.text{position:absolute;left:80px;top:190px;margin:0;font:40px sans-serif}.line{position:absolute;left:20px;top:190px;width:600px;height:50px;background:#087c66}</style>${sceneMarkup}`);
  const failed = await page.evaluate(geometryAuditInPage, ["MC-test"]);
  assert.ok(failed.some((issue) => issue.type === "connector-text-collision"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "mint-geometry-repair-"));
  fs.mkdirSync(path.join(project, "src", "scenes"), { recursive: true });
  fs.writeFileSync(path.join(project, "src", "scenes", "MC-test.html"), sceneMarkup);
  fs.writeFileSync(path.join(project, "visual-qa.json"), JSON.stringify({ issues: failed.map((issue) => ({ gate: "geometry-collision", ...issue })) }));
  const repairScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/repair-geometry.mjs");
  const repair = spawnSync(process.execPath, [repairScript, project, path.join(project, "visual-qa.json")], { encoding: "utf8" });
  assert.equal(repair.status, 0, repair.stderr || repair.stdout);
  assert.match(fs.readFileSync(path.join(project, "src", "scenes", "MC-test.html"), "utf8"), /data-geometry-repair="shift"/);
  assert.notEqual(spawnSync(process.execPath, [repairScript, project, path.join(project, "visual-qa.json")]).status, 0, "同一轮只允许自动修复一次");
  await page.locator(".line").evaluate((node) => { node.style.top = "100px"; });
  const passed = await page.evaluate(geometryAuditInPage, ["MC-test"]);
  assert.equal(passed.filter((issue) => issue.type === "connector-text-collision").length, 0);
  await page.setContent(`<!doctype html><style>.mint-scene{position:relative;width:800px;height:500px}.t{position:absolute;left:100px;top:180px;margin:0;font:40px sans-serif}</style><section class="mint-scene" data-scene-id="MC-svg"><p class="t" data-element-id="body" data-qa-role="text" data-qa-overlap="forbid">SVG不能穿正文</p><svg width="700" height="400"><path d="M20 205 L680 205" stroke="green" stroke-width="8" data-element-id="curve" data-qa-role="connector" data-qa-overlap="forbid"/></svg></section>`);
  assert.ok((await page.evaluate(geometryAuditInPage, ["MC-svg"])).some((issue) => issue.type === "connector-text-collision"), "SVG 曲线穿字必须失败");
  await page.setContent(`<!doctype html><style>.mint-scene{position:relative;width:800px;height:500px}.t,.media{position:absolute;left:100px;top:100px;width:300px;height:120px}</style><section class="mint-scene" data-scene-id="MC-media"><p class="t" data-element-id="body" data-qa-role="text" data-qa-overlap="forbid">图片不能覆盖正文</p><div class="media" data-element-id="image" data-qa-role="media" data-qa-overlap="forbid"></div></section>`);
  assert.ok((await page.evaluate(geometryAuditInPage, ["MC-media"])).some((issue) => issue.type === "visual-text-collision"), "媒体覆盖文字必须失败");
  await page.setContent(`<!doctype html><style>.mint-scene{position:relative;width:800px;height:500px}.bg{position:absolute;inset:20px}.t{position:absolute;left:100px;top:100px}</style><section class="mint-scene" data-scene-id="MC-legal"><div class="bg" data-element-id="bg" data-qa-role="decoration" data-qa-group="hero" data-qa-overlap="allow-contained"><p class="t" data-element-id="body" data-qa-role="text" data-qa-group="hero" data-qa-overlap="allow-contained">合法背景包含</p></div></section>`);
  assert.equal((await page.evaluate(geometryAuditInPage, ["MC-legal"])).filter((issue) => /collision|cover/.test(issue.type)).length, 0, "登记的同组背景包含必须允许");
  console.log(JSON.stringify({ passed: true, collisionDetected: true, svgCollisionDetected: true, mediaCollisionDetected: true, legalContainmentAccepted: true, deterministicRepair: true, singleAttempt: true, cleanLayoutAccepted: true }, null, 2));
} finally { await browser.close(); }
