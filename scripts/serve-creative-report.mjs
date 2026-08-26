#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = path.resolve(process.argv[2] || "");
const port = Number(process.env.MINT_REPORT_PORT || 41737);
if (!fs.existsSync(input)) { console.error("Usage: node serve-creative-report.mjs report.html"); process.exit(2); }
const moduleName = process.env.MINT_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Expose-Headers": "X-Mint-Content-Hash" };
const server = http.createServer(async (req, res) => { try {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.url === "/api/health") { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, service: "mint-creative-pdf", version: "0.9" })); }
  if (req.method === "POST" && req.url === "/api/export-pdf") {
    let body = "", size = 0; for await (const chunk of req) { size += chunk.length; if (size > 25 * 1024 * 1024) throw new Error("HTML 超过 25MB"); body += chunk; }
    const payload = JSON.parse(body || "{}"), html = String(payload.html || "");
    if (!html.includes("mint-scene") || !html.includes("mint-creative-data")) throw new Error("提交内容不是有效 Mint 创意汇报");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.MINT_CHROMIUM_EXECUTABLE || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.setContent(html, { waitUntil: "load" }); await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        window.mintCreative?.setEditing(false); window.mintCreative?.closeModals();
        document.body.classList.remove("editing"); document.body.classList.add("exporting");
        document.querySelectorAll(".mint-scene").forEach((node) => node.classList.add("is-visible"));
        document.querySelectorAll("[data-reveal]").forEach((node) => { node.removeAttribute("data-reveal"); node.style.cssText += ";opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important"; });
      });
      await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(80);
      const state = await page.evaluate(() => ({ editable: document.querySelectorAll('[contenteditable="true"]').length, controls: [...document.querySelectorAll(".mint-nav,.mint-edit-status,.mint-control,.mint-modal")].filter((node) => getComputedStyle(node).display !== "none").length, hiddenDetails: [...document.querySelectorAll(".mint-details[hidden]")].filter((node) => getComputedStyle(node).display === "none").length, model: document.querySelector("#mint-creative-data")?.textContent || "" }));
      if (state.editable || state.controls || state.hiddenDetails || !state.model) throw new Error("当前编辑版本尚未进入可导出状态");
      await page.evaluate(() => document.querySelectorAll(".mint-details[hidden]").forEach((node) => { node.hidden = false; }));
      await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
      await page.evaluate(() => document.querySelectorAll(".mint-nav,.mint-edit-status,.mint-control,.mint-modal").forEach((node) => node.style.setProperty("display", "none", "important")));
      const sceneImages = [];
      for (const scene of await page.locator(".mint-scene").all()) sceneImages.push((await scene.screenshot({ type: "png", animations: "disabled" })).toString("base64"));
      const printPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await printPage.setContent(`<!doctype html><style>@page{size:16in 9in;margin:0}html,body{margin:0}.pdf-scene{width:16in;height:9in;break-after:page}.pdf-scene:last-child{break-after:auto}.pdf-scene img{display:block;width:100%;height:100%;object-fit:contain}</style>${sceneImages.map((image) => `<section class="pdf-scene"><img src="data:image/png;base64,${image}"></section>`).join("")}`, { waitUntil: "load" });
      const pdf = await printPage.pdf({ width: "16in", height: "9in", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
      await printPage.close();
      const contentHash = crypto.createHash("sha256").update(state.model).digest("hex");
      res.writeHead(200, { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${String(payload.filename || "mint-report.pdf").replace(/[^A-Za-z0-9._-]/g, "-")}"`, "X-Mint-Content-Hash": contentHash }); res.end(pdf);
    } finally { await browser.close(); }
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/report.html")) { res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" }); return res.end(fs.readFileSync(input)); }
  res.writeHead(404, cors); res.end("not found");
} catch (error) { res.writeHead(400, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: error.message })); } });
server.listen(port, "127.0.0.1", () => console.log(`Mint creative report: http://127.0.0.1:${port}/report.html`));
