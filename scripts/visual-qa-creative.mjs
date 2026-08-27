#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = path.resolve(process.argv[2] || "");
const outputFile = path.resolve(process.argv[3] || path.join(path.dirname(input || "."), "visual-qa.json"));
const shots = path.resolve(process.argv[4] || path.join(path.dirname(outputFile), "visual-qa"));
if (!fs.existsSync(input)) { console.error("Usage: node visual-qa-creative.mjs report.html [visual-qa.json] [screenshots-dir]"); process.exit(2); }
const moduleName = process.env.MINT_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, executablePath: process.env.MINT_CHROMIUM_EXECUTABLE || undefined });
const viewports = [{ name: "desktop", width: 1920, height: 1080 }, { name: "laptop", width: 1280, height: 720 }, { name: "mobile", width: 390, height: 844 }];
const issues = [], results = [];
fs.mkdirSync(shots, { recursive: true });
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate(() => {
    const visible = (node) => { const style = getComputedStyle(node); const box = node.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0; };
    const renderedLines = (node) => {
      const textNode = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (!textNode) return [];
      const groups = new Map();
      for (let index = 0; index < textNode.textContent.length; index += 1) {
        const range = document.createRange(); range.setStart(textNode, index); range.setEnd(textNode, index + 1);
        const rect = range.getBoundingClientRect(); if (!rect.width && !rect.height) continue;
        const key = Math.round(rect.top); groups.set(key, `${groups.get(key) || ""}${textNode.textContent[index]}`);
      }
      return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map((entry)=>entry[1].trim()).filter(Boolean);
    };
    const scenes = [...document.querySelectorAll(".mint-scene")];
    const uncoveredText = scenes.flatMap((scene) => {
      const walker = document.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
      const missing = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        const parent = walker.currentNode.parentElement;
        if (text && parent && visible(parent) && !parent.closest('[data-edit-policy]')) missing.push(text.slice(0, 48));
      }
      return missing;
    });
    return {
      scenes: scenes.map((scene) => {
        const box = scene.getBoundingClientRect();
        const texts = [...scene.querySelectorAll("h1,h2,h3,p,li,small")].filter(visible);
        const minFont = texts.length ? Math.min(...texts.map((node) => parseFloat(getComputedStyle(node).fontSize))) : 0;
        const overflowX = getComputedStyle(scene).overflowX;
        const stage = scene.querySelector('.mint-scene__stage');
        const title = scene.querySelector('[data-title-contract]');
        const titleStyle = title ? getComputedStyle(title) : null;
        const lines = title ? renderedLines(title) : [];
        const stageBox = stage?.getBoundingClientRect();
        return { id: scene.dataset.sceneId, width: box.width, height: box.height, minFont, overflowX: !["hidden", "clip"].includes(overflowX) && scene.scrollWidth > scene.clientWidth + 2, empty: !scene.innerText.trim(), answerVisible: !!title, stage: stage ? { width: parseFloat(getComputedStyle(stage).width), height: parseFloat(getComputedStyle(stage).height), visualWidth: stageBox.width, visualHeight: stageBox.height, left: stageBox.left, right: stageBox.right } : null, title: title ? { role: title.dataset.titleRole, fontSize: parseFloat(titleStyle.fontSize), letterSpacing: parseFloat(titleStyle.letterSpacing) || 0, lines, heightRatio: title.getBoundingClientRect().height / Math.max(1, scene.querySelector('.mint-scene__viewport')?.getBoundingClientRect().height || box.height) } : null };
      }),
      navVisible: visible(document.querySelector(".mint-nav")),
      previousVisible: visible(document.querySelector("[data-scene-prev]")),
      nextVisible: visible(document.querySelector("[data-scene-next]")),
      editToggleVisible: visible(document.querySelector("[data-edit-toggle]")),
      requiredEditable: document.querySelectorAll('[data-edit-policy="editable"][data-field-path]').length,
      unexpectedEditable: document.querySelectorAll('[contenteditable="true"]:not([data-edit-policy="editable"])').length,
      uncoveredText,
      bodyOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    };
  });
  if (state.bodyOverflowX) issues.push({ viewport: viewport.name, gate: "overflow", message: "页面存在横向溢出" });
  if (!state.navVisible) issues.push({ viewport: viewport.name, gate: "navigation", message: "导航不可见" });
  if (!state.previousVisible || !state.nextVisible) issues.push({ viewport: viewport.name, gate: "navigation", message: "左右翻页控件不可见" });
  if (!state.editToggleVisible) issues.push({ viewport: viewport.name, gate: "editability", message: "可见编辑入口不可用" });
  if (!state.requiredEditable) issues.push({ viewport: viewport.name, gate: "editability", message: "没有带稳定字段路径的可编辑文字" });
  if (state.unexpectedEditable) issues.push({ viewport: viewport.name, gate: "editability", message: "存在合同外可编辑元素" });
  if (state.uncoveredText.length) issues.push({ viewport: viewport.name, gate: "editability", message: `存在 ${state.uncoveredText.length} 个未声明编辑策略的正式文字节点`, samples: state.uncoveredText.slice(0, 5) });
  for (const scene of state.scenes) {
    if (scene.overflowX) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "overflow", message: "场景横向溢出" });
    if (scene.empty || !scene.answerVisible) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "reading-start", message: "场景缺少明确阅读起点" });
    if (scene.minFont && scene.minFont < (viewport.name === "mobile" ? 13 : 14)) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "typography", message: `最小字号 ${scene.minFont}px` });
    if (!scene.stage) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "canvas-contract", message: "缺少场景画布" });
    if (viewport.name !== "mobile" && scene.stage && (Math.abs(scene.stage.width - 1920) > 1 || Math.abs(scene.stage.height - 1080) > 1)) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "canvas-contract", message: `桌面画布不是 1920×1080：${scene.stage.width}×${scene.stage.height}` });
    if (viewport.name !== "mobile" && scene.stage && (Math.abs(scene.stage.visualWidth - viewport.width) > 2 || Math.abs(scene.stage.left) > 2 || Math.abs(scene.stage.right - viewport.width) > 2)) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "canvas-scaling", message: `固定画布没有完整缩放到视口：left=${scene.stage.left}, right=${scene.stage.right}, width=${scene.stage.visualWidth}` });
    if (!scene.title) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-contract", message: "缺少标题合同" });
    if (scene.title) {
      const ranges = { display: [136,184], section: [104,144], content: [72,104], module: [40,60] };
      const range = viewport.name === "mobile" ? [36,58] : ranges[scene.title.role];
      if (!range || scene.title.fontSize < range[0] - .5 || scene.title.fontSize > range[1] + .5) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-role-size", message: `标题角色 ${scene.title.role} 的字号 ${scene.title.fontSize}px 不在合法范围` });
      if (scene.title.lines.length > 2) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-lines", message: `标题渲染为 ${scene.title.lines.length} 行`, lines: scene.title.lines });
      if (/^[，。、；：？！）》】」』…]/.test(scene.title.lines[1] || "")) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-break", message: "标题第二行以闭合标点开头", lines: scene.title.lines });
      if (/[（《【「『]$/.test(scene.title.lines[0] || "")) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-break", message: "标题第一行以开放标点结束", lines: scene.title.lines });
      if (scene.title.lines.length > 1 && [...scene.title.lines.at(-1).replace(/[，。、；：？！）》】」』…\s]/g, "")].length < 3) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-orphan", message: "标题末行少于三个有效字符", lines: scene.title.lines });
      if (scene.title.letterSpacing < 0) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-tracking", message: `中文标题使用负字距 ${scene.title.letterSpacing}px` });
      if (scene.title.heightRatio > .34) issues.push({ viewport: viewport.name, sceneId: scene.id, gate: "title-height", message: `标题高度占比 ${scene.title.heightRatio.toFixed(3)} 超过 0.34` });
    }
  }
  await page.keyboard.press("e");
  const editingOn = await page.evaluate(() => ({ body: document.body.classList.contains("editing"), editable: document.querySelectorAll('[data-edit-policy="editable"][contenteditable="true"]').length, unexpected: document.querySelectorAll('[contenteditable="true"]:not([data-edit-policy="editable"])').length }));
  if (!editingOn.body || editingOn.editable !== state.requiredEditable || editingOn.unexpected) issues.push({ viewport: viewport.name, gate: "editability", message: `E 键编辑覆盖异常：${editingOn.editable}/${state.requiredEditable}` });
  await page.keyboard.press("e");
  const editingOff = await page.evaluate(() => ({ body: document.body.classList.contains("editing"), editable: document.querySelectorAll('[contenteditable="true"]').length }));
  if (editingOff.body || editingOff.editable) issues.push({ viewport: viewport.name, gate: "editability", message: "E 键未能退出编辑状态" });
  await page.keyboard.press("ArrowRight");
  if (state.scenes.length > 1) {
    await page.waitForTimeout(500);
    const current = await page.locator('.mint-nav [aria-current="true"]').count();
    if (current !== 1) issues.push({ viewport: viewport.name, gate: "keyboard", message: "左右方向键导航未形成唯一当前场景" });
    await page.locator('[data-scene-prev]').click();
    await page.waitForTimeout(350);
    const returned = await page.evaluate(() => document.querySelector('[data-scene-target][aria-current="true"]') === document.querySelector('[data-scene-target]'));
    if (!returned) issues.push({ viewport: viewport.name, gate: "navigation", message: "上一页按钮未返回前一场景" });
  }
  await page.screenshot({ path: path.join(shots, `${viewport.name}.png`), fullPage: true, animations: "disabled" });
  results.push({ viewport, ...state, runtimeErrors });
  for (const error of runtimeErrors) issues.push({ viewport: viewport.name, gate: "runtime", message: error });
  await page.close();
}
const printPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await printPage.goto(pathToFileURL(input).href, { waitUntil: "load" });
await printPage.emulateMedia({ media: "print", reducedMotion: "reduce" });
const printState = await printPage.evaluate(() => ({ hiddenDetails: [...document.querySelectorAll(".mint-details[hidden]")].filter((node) => getComputedStyle(node).display === "none").length, visibleControls: [...document.querySelectorAll(".mint-nav,.mint-edit-status,.mint-control,.mint-page-arrow,.mint-edit-toggle")].filter((node) => getComputedStyle(node).display !== "none").length }));
if (printState.hiddenDetails) issues.push({ gate: "print", message: "打印状态仍隐藏必要详情" });
if (printState.visibleControls) issues.push({ gate: "print", message: "打印状态仍显示交互控件" });
await printPage.close();
await browser.close();
const report = { schemaVersion: "0.9.1", passed: issues.length === 0, results, printState, issues };
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, viewports: results.length, issues: issues.length, outputFile }, null, 2));
process.exit(report.passed ? 0 : 1);
