#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const VERSION = "0.9.3";
const SUPPORTED = new Set([".md", ".txt", ".html", ".htm", ".docx", ".pptx", ".xlsx", ".pdf", ".png", ".jpg", ".jpeg"]);
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const decodeXml = (value) => String(value || "")
  .replace(/<w:tab\/?\s*>/g, "\t").replace(/<a:br\/?\s*>/g, "\n")
  .replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const commandPath = (name) => {
  const run = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.split(/\r?\n/).find(Boolean)?.trim() || null : null;
};
const listFiles = (input) => {
  if (fs.statSync(input).isFile()) return [input];
  const found = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).forEach((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target); else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) found.push(target);
  });
  walk(input);
  return found;
};
function readZipEntries(file) {
  const bytes = fs.readFileSync(file);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) return new Map();
  const entryCount = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount && cursor + 46 <= bytes.length; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const fileNameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    if (localOffset + 30 <= bytes.length && bytes.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(start, start + compressedSize);
      try {
        const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
        if (data) entries.set(name, data);
      } catch {}
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function renderPdfPages(pdfFile, cacheDir) {
  const pdftoppm = commandPath("pdftoppm");
  if (!pdftoppm) return { files: [], warning: "缺少 pdftoppm，未生成页面视觉缓存" };
  const prefix = path.join(cacheDir, "pages", "page");
  fs.mkdirSync(path.dirname(prefix), { recursive: true });
  const run = spawnSync(pdftoppm, ["-png", "-r", "144", pdfFile, prefix], { encoding: "utf8", maxBuffer: 20_000_000 });
  if (run.status !== 0) return { files: [], warning: "PDF 页面视觉缓存生成失败" };
  return { files: fs.readdirSync(path.dirname(prefix)).filter((name) => name.startsWith("page-") && name.endsWith(".png")).sort().map((name) => path.posix.join("pages", name)), warning: null };
}

function renderOfficeOnce(file, cacheDir) {
  const soffice = process.env.MINT_SOFFICE_EXECUTABLE || commandPath("soffice") || commandPath("libreoffice");
  if (!soffice) return { files: [], warning: "缺少 LibreOffice/soffice，未生成 Office 页面视觉缓存" };
  const run = spawnSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", cacheDir, file], { encoding: "utf8", maxBuffer: 20_000_000 });
  const pdfFile = path.join(cacheDir, `${path.basename(file, path.extname(file))}.pdf`);
  if (run.status !== 0 || !fs.existsSync(pdfFile)) return { files: [], warning: "Office 页面视觉缓存生成失败；未切换其他渲染器" };
  const pages = renderPdfPages(pdfFile, cacheDir);
  return { files: [path.basename(pdfFile), ...pages.files], warning: pages.warning };
}

function normalizeOffice(file, extension, cacheDir) {
  const entries = readZipEntries(file);
  const parts = [...entries.keys()];
  if (!parts.length) return { text: "", extractionStrategy: "zip-xml", renderStrategy: "none", normalizedFiles: [], warnings: ["Office 文件无法读取 OOXML 包"], status: "needs-asset-review" };
  const selectors = extension === ".docx"
    ? [/^word\/document\.xml$/, /^word\/footnotes\.xml$/, /^word\/endnotes\.xml$/]
    : extension === ".pptx"
      ? [/^ppt\/slides\/slide\d+\.xml$/, /^ppt\/notesSlides\/notesSlide\d+\.xml$/]
      : [/^xl\/sharedStrings\.xml$/, /^xl\/worksheets\/sheet\d+\.xml$/, /^xl\/charts\/chart\d+\.xml$/];
  const selected = parts.filter((part) => selectors.some((pattern) => pattern.test(part))).sort();
  const chunks = selected.map((part) => {
    const data = entries.get(part);
    return data ? `\n## ${part}\n${decodeXml(data.toString("utf8"))}` : "";
  }).filter(Boolean);
  const mediaParts = parts.filter((part) => /\/(?:media|embeddings)\//.test(part));
  const normalizedFiles = [];
  for (const part of mediaParts) {
    const data = entries.get(part);
    if (!data?.length) continue;
    const target = path.join(cacheDir, "media", path.basename(part));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    normalizedFiles.push(path.relative(cacheDir, target));
  }
  const textFile = path.join(cacheDir, "content.md");
  fs.writeFileSync(textFile, `${chunks.join("\n").trim()}\n`);
  normalizedFiles.unshift(path.relative(cacheDir, textFile));
  const visual = [".pptx", ".docx"].includes(extension) ? renderOfficeOnce(file, cacheDir) : { files: [], warning: null };
  normalizedFiles.push(...visual.files);
  const renderStrategy = extension === ".pptx" ? "libreoffice-pdf-raster" : extension === ".xlsx" ? "data-extract-html-redraw" : "libreoffice-pdf-raster";
  const warnings = [visual.warning, extension === ".pptx" ? "PPTX 页面视觉由固定 LibreOffice 策略缓存；字体与复杂图表保真须一次性人工确认" : null].filter(Boolean);
  return { text: chunks.join("\n"), extractionStrategy: "zip-xml", renderStrategy, normalizedFiles, warnings, status: extension === ".pptx" && warnings.length ? "needs-asset-review" : warnings.length ? "normalized-with-warning" : "normalized" };
}

function normalizePdf(file, cacheDir) {
  const normalizedFiles = [], warnings = [];
  const textFile = path.join(cacheDir, "content.txt");
  const pdftotext = commandPath("pdftotext");
  if (pdftotext) {
    const run = spawnSync(pdftotext, ["-layout", file, textFile], { encoding: "utf8" });
    if (run.status !== 0) warnings.push("PDF 文本层提取失败，需要 OCR 或人工确认");
  } else warnings.push("缺少 pdftotext，PDF 文本尚未标准化");
  const text = fs.existsSync(textFile) ? fs.readFileSync(textFile, "utf8") : "";
  if (fs.existsSync(textFile)) normalizedFiles.push("content.txt");
  const pages = renderPdfPages(file, cacheDir);
  normalizedFiles.push(...pages.files);
  if (pages.warning) warnings.push(pages.warning);
  if (!text.trim()) warnings.push("PDF 没有可用文本层；必须进入本地 OCR，不得静默猜测");
  return { text, extractionStrategy: text.trim() ? "pdf-text-layer" : "ocr-required", renderStrategy: "pdf-page-original", normalizedFiles, warnings, status: warnings.length ? "needs-asset-review" : "normalized" };
}

function normalizeOne(file, root, cacheRoot) {
  const bytes = fs.readFileSync(file), sourceHash = sha(bytes), extension = path.extname(file).toLowerCase();
  const sourcePath = path.relative(root, file) || path.basename(file);
  const cacheDir = path.join(cacheRoot, sourceHash);
  const metaFile = path.join(cacheDir, "asset.json");
  if (fs.existsSync(metaFile)) return { ...JSON.parse(fs.readFileSync(metaFile, "utf8")), cacheHit: true };
  fs.mkdirSync(cacheDir, { recursive: true });
  let result;
  if ([".md", ".txt"].includes(extension)) {
    const text = bytes.toString("utf8"); fs.writeFileSync(path.join(cacheDir, "content.txt"), text);
    result = { text, extractionStrategy: "direct-text", renderStrategy: "none", normalizedFiles: ["content.txt"], warnings: [], status: "normalized" };
  } else if ([".html", ".htm"].includes(extension)) {
    const html = bytes.toString("utf8"), text = decodeXml(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " "));
    fs.writeFileSync(path.join(cacheDir, "source.html"), html); fs.writeFileSync(path.join(cacheDir, "content.txt"), text);
    result = { text, extractionStrategy: "dom-text", renderStrategy: "browser-original", normalizedFiles: ["source.html", "content.txt"], warnings: [], status: "normalized" };
  } else if ([".png", ".jpg", ".jpeg"].includes(extension)) {
    const target = path.join(cacheDir, `original${extension}`); fs.copyFileSync(file, target);
    result = { text: "", extractionStrategy: "binary-image", renderStrategy: "direct-asset", normalizedFiles: [path.basename(target)], warnings: ["图片文字未自动作为事实读取；如需分析文字必须显式执行 OCR"], status: "normalized-with-warning" };
  } else if ([".docx", ".pptx", ".xlsx"].includes(extension)) result = normalizeOffice(file, extension, cacheDir);
  else if (extension === ".pdf") result = normalizePdf(file, cacheDir);
  else result = { text: "", extractionStrategy: "unsupported", renderStrategy: "none", normalizedFiles: [], warnings: ["不支持的素材格式"], status: "needs-asset-review" };
  const item = {
    assetId: `ASSET-${sha(sourcePath).slice(0, 12)}`,
    sourcePath,
    sourceHash,
    kind: extension.slice(1),
    extractionStrategy: result.extractionStrategy,
    renderStrategy: result.renderStrategy,
    normalizedFiles: result.normalizedFiles.map((name) => path.posix.join(".work/normalized", sourceHash, name)),
    sourceUnitRefs: [],
    status: result.status,
    warnings: result.warnings,
    contentHash: sha(result.text || ""),
    normalizedAt: new Date().toISOString(),
    text: result.text
  };
  fs.writeFileSync(metaFile, `${JSON.stringify(item, null, 2)}\n`);
  return { ...item, cacheHit: false };
}

export function normalizeAssets(input, outputDir) {
  const root = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  const cacheRoot = path.join(outputDir, ".work", "normalized");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const assets = listFiles(input).map((file) => normalizeOne(file, root, cacheRoot));
  const sourceSetHash = sha(assets.map((asset) => `${asset.sourcePath}:${asset.sourceHash}`).join("\n"));
  const combinedText = assets.filter((asset) => asset.text.trim()).map((asset) => `<!-- MINT_ASSET id="${asset.assetId}" path="${asset.sourcePath}" -->\n\n${asset.text.trim()}`).join("\n\n");
  const manifest = { schemaVersion: VERSION, sourceSetHash, assets: assets.map(({ text, ...asset }) => asset), metrics: { assets: assets.length, cacheHits: assets.filter((asset) => asset.cacheHit).length, reviewRequired: assets.filter((asset) => asset.status === "needs-asset-review").length } };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, ".work", "normalized-source.md"), `${combinedText}\n`);
  return { manifest, combinedText, normalizedSource: path.join(outputDir, ".work", "normalized-source.md") };
}

function runCli() {
  const input = path.resolve(process.argv[2] || ""), output = path.resolve(process.argv[3] || "creative-output");
  if (!input || !fs.existsSync(input)) { console.error("Usage: node normalize-assets.mjs <source-file-or-directory> <output-dir>"); process.exit(2); }
  const result = normalizeAssets(input, output);
  console.log(JSON.stringify({ passed: result.manifest.metrics.reviewRequired === 0, ...result.manifest.metrics, sourceSetHash: result.manifest.sourceSetHash, output }, null, 2));
  process.exit(result.manifest.metrics.reviewRequired ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
