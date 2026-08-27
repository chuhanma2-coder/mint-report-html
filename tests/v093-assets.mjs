#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAssets } from "../scripts/normalize-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mint-v093-assets-"));
const writeStoredZip = (target, entries) => {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const fileName = Buffer.from(name), data = Buffer.from(value);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(0, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName); offset += local.length + fileName.length + data.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0), count = Object.keys(entries).length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(target, Buffer.concat([...locals, ...centrals, end]));
};
const out = (name) => path.join(temp, `out-${name}`);

const html = path.join(temp, "source.html"); fs.writeFileSync(html, "<main><h1>HTML 来源</h1><p>保留正文</p></main>");
assert.match(normalizeAssets(html, out("html")).combinedText, /保留正文/);

const docx = path.join(temp, "source.docx");
writeStoredZip(docx, { "word/document.xml": "<w:document><w:p><w:r><w:t>DOCX正文</w:t></w:r></w:p></w:document>" });
assert.match(normalizeAssets(docx, out("docx")).combinedText, /DOCX正文/);

const xlsx = path.join(temp, "source.xlsx");
writeStoredZip(xlsx, { "xl/sharedStrings.xml": "<sst><si><t>收入</t></si></sst>", "xl/worksheets/sheet1.xml": "<worksheet><sheetData><row><c><v>120</v></c></row></sheetData></worksheet>", "xl/charts/chart1.xml": "<chart><title>收入趋势</title></chart>" });
const xlsxResult = normalizeAssets(xlsx, out("xlsx"));
assert.match(xlsxResult.combinedText, /120/);
assert.equal(xlsxResult.manifest.assets[0].renderStrategy, "data-extract-html-redraw");

const image = path.join(repo, "skills/mint-report-deck/assets/media/mint-waves.png");
assert.equal(normalizeAssets(image, out("image")).manifest.assets[0].renderStrategy, "direct-asset");

const pdf = path.join(repo, "outputs/v09-forward/report.pdf");
const pdfAsset = normalizeAssets(pdf, out("pdf")).manifest.assets[0];
assert.ok(pdfAsset.normalizedFiles.some((file) => /pages\/page-/.test(file)), "PDF 必须缓存页面图");

const pptx = path.join(repo, "skills/mint-report-deck/assets/presentation/Mint_Report_Component_Library.pptx");
const pptOut = out("pptx");
const pptFirst = normalizeAssets(pptx, pptOut).manifest.assets[0];
const pptSecond = normalizeAssets(pptx, pptOut).manifest.assets[0];
assert.equal(pptSecond.cacheHit, true, "PPTX 第二次不得重新渲染");
assert.equal(pptFirst.renderStrategy, "libreoffice-pdf-raster");
assert.ok(pptFirst.normalizedFiles.some((file) => /pages\/page-/.test(file)), "PPTX 必须缓存页面视觉资产");

console.log(JSON.stringify({ passed: true, formats: ["html", "docx", "xlsx", "pdf", "image", "pptx"], pptCacheHit: true }, null, 2));
