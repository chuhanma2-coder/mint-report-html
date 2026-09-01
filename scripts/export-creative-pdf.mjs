#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = path.resolve(process.argv[2] || "");
const pdfFile = path.resolve(process.argv[3] || path.join(path.dirname(input || "."), "report.pdf"));
const manifestFile = path.resolve(process.argv[4] || path.join(path.dirname(pdfFile), "export-manifest.json"));
const kind = process.argv.find((arg) => arg.startsWith("--kind="))?.slice(7) || "formal";
if (!fs.existsSync(input)) { console.error("Usage: node export-creative-pdf.mjs report.html [report.pdf] [export-manifest.json]"); process.exit(2); }
const moduleName = process.env.MINT_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ headless: true, executablePath: process.env.MINT_CHROMIUM_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { window.mintFields?.prepareExport(); await window.mintFields?.flush(); });
  await page.evaluate(() => {
    window.mintCreative?.setEditing(false); window.mintCreative?.closeModals();
    document.body.classList.remove("editing"); document.body.classList.add("exporting");
    document.querySelectorAll(".mint-scene").forEach((node) => node.classList.add("is-visible"));
    document.querySelectorAll("[data-reveal]").forEach((node) => { node.removeAttribute("data-reveal"); node.style.cssText += ";opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important"; });
  });
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(80);
  const state = await page.evaluate(() => ({ editable: document.querySelectorAll('[contenteditable="true"]').length, visibleControls: [...document.querySelectorAll(".mint-nav,.mint-edit-status,.mint-control,.mint-modal,.mint-interaction-controls")].filter((node) => getComputedStyle(node).display !== "none").length, hiddenDetails: [...document.querySelectorAll(".mint-details[hidden]")].filter((node) => getComputedStyle(node).display === "none").length, focusedGraph: document.querySelectorAll('.mint-node-focused,.mint-edge-focused').length, model: document.querySelector("#mint-creative-data")?.textContent || "" }));
  if (state.editable || state.visibleControls || state.hiddenDetails || state.focusedGraph || !state.model) throw new Error(`PDF 导出状态不完整：${JSON.stringify({ ...state, model: undefined })}`);
  fs.mkdirSync(path.dirname(pdfFile), { recursive: true });
  await page.evaluate(() => document.querySelectorAll(".mint-details[hidden]").forEach((node) => { node.hidden = false; }));
  await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
  await page.evaluate(() => document.querySelectorAll(".mint-nav,.mint-edit-status,.mint-control,.mint-modal").forEach((node) => node.style.setProperty("display", "none", "important")));
  const sceneImages = [];
  for (const scene of await page.locator(".mint-scene").all()) sceneImages.push((await scene.screenshot({ type: "png", animations: "disabled" })).toString("base64"));
  const printPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await printPage.setContent(`<!doctype html><html><head><style>@page{size:16in 9in;margin:0}html,body{margin:0;background:#fff}.pdf-scene{width:16in;height:9in;break-after:page;display:grid;place-items:center;overflow:hidden}.pdf-scene:last-child{break-after:auto}.pdf-scene img{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}</style></head><body>${sceneImages.map((image) => `<section class="pdf-scene"><img src="data:image/png;base64,${image}"></section>`).join("")}</body></html>`, { waitUntil: "load" });
  await printPage.pdf({ path: pdfFile, width: "16in", height: "9in", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  await printPage.close();
  const contentHash = sha(state.model);
  const original = fs.readFileSync(input, "utf8");
  const updated = original.replace(/<meta name="mint-pdf-state" content="[^"]*">/g, "").replace(/<meta name="mint-pdf-content-hash" content="[^"]*">/g, "").replace("</head>", `<meta name="mint-pdf-state" content="${kind === "formal" ? "available" : "preview"}"><meta name="mint-pdf-content-hash" content="${contentHash}"></head>`);
  fs.writeFileSync(input, updated);
  const manifest = { schemaVersion: "0.10.0-rc.1", status: "matched", kind, mode: "creative-scene-snapshot", htmlFile: path.basename(input), pdfFile: path.basename(pdfFile), contentHash, htmlHash: sha(updated), pdfHash: sha(fs.readFileSync(pdfFile)), sceneSnapshotHash: sha(sceneImages.join("")), sceneCount: sceneImages.length, generatedAt: new Date().toISOString(), exportState: { editable: state.editable, visibleControls: state.visibleControls, hiddenDetails: state.hiddenDetails } };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, pdfFile, manifestFile, contentHash }, null, 2));
} finally { await browser.close(); }
