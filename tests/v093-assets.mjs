#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAssets } from "../scripts/normalize-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
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

const image = path.join(temp, "source.png");
fs.writeFileSync(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
assert.equal(normalizeAssets(image, out("image")).manifest.assets[0].renderStrategy, "direct-asset");

const pdf = path.join(temp, "source.pdf");
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>", "<< /Length 0 >>\nstream\n\nendstream"];
let pdfText = "%PDF-1.4\n", offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdfText)); pdfText += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdfText); pdfText += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(pdf, pdfText);
const pdfAsset = normalizeAssets(pdf, out("pdf")).manifest.assets[0];
assert.ok(pdfAsset.normalizedFiles.some((file) => /pages\/page-/.test(file)), "PDF 必须缓存页面图");

const pptx = path.join(temp, "source.pptx");
writeStoredZip(pptx, {
  "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  "ppt/presentation.xml": `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
  "ppt/_rels/presentation.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
  "ppt/slides/slide1.xml": `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>PPTX test</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
});
const pptOut = out("pptx");
const pptFirst = normalizeAssets(pptx, pptOut).manifest.assets[0];
const pptSecond = normalizeAssets(pptx, pptOut).manifest.assets[0];
assert.equal(pptSecond.cacheHit, true, "PPTX 第二次不得重新渲染");
assert.equal(pptFirst.renderStrategy, "libreoffice-pdf-raster");
assert.ok(pptFirst.normalizedFiles.some((file) => /pages\/page-/.test(file)), "PPTX 必须缓存页面视觉资产");

console.log(JSON.stringify({ passed: true, formats: ["html", "docx", "xlsx", "pdf", "image", "pptx"], pptCacheHit: true }, null, 2));
