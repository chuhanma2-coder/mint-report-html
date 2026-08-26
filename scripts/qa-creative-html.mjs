#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const htmlFile = path.resolve(process.argv[2] || "");
const briefFile = path.resolve(process.argv[3] || "");
const outputFile = path.resolve(process.argv[4] || path.join(path.dirname(htmlFile || "."), "qa-report.json"));
if (!fs.existsSync(htmlFile) || !fs.existsSync(briefFile)) {
  console.error("Usage: node qa-creative-html.mjs report.html creative-brief.json [qa-report.json]");
  process.exit(2);
}
const html = fs.readFileSync(htmlFile, "utf8");
const brief = JSON.parse(fs.readFileSync(briefFile, "utf8"));
const issues = [];
const matches = (pattern) => [...html.matchAll(pattern)];
const sceneIds = matches(/<section\b[^>]*class=["'][^"']*\bmint-scene\b[^"']*["'][^>]*data-scene-id=["']([^"']+)["']/gi).map((match) => match[1]);
const atomRefs = new Set(matches(/data-atom-ref=["']([^"']+)["']/gi).flatMap((match) => match[1].split(/\s+/).filter(Boolean)));
const fieldPaths = matches(/data-field-path=["']([^"']+)["']/gi).map((match) => match[1]);
const externalAssets = matches(/<(?:script|img|video|audio|source|link)\b[^>]*(?:src|href)=["']https?:\/\/[^"']+/gi).map((match) => match[0]);
if (externalAssets.length) issues.push({ gate: "offline-first", message: `存在 ${externalAssets.length} 个外部首屏资源依赖` });
if (new Set(sceneIds).size !== brief.scenes.length || brief.scenes.some((scene) => !sceneIds.includes(scene.id))) issues.push({ gate: "scene-contract", message: "HTML 场景 ID 与 creative-brief 不一致" });
for (const scene of brief.scenes) for (const atomRef of scene.mustShow) if (!atomRefs.has(atomRef)) issues.push({ gate: "must-show", sceneId: scene.id, atomRef, message: "关键内容未在正式 DOM 中标注可见去向" });
if (!/scroll-snap-type\s*:\s*y\s+proximity/i.test(html)) issues.push({ gate: "scroll-contract", message: "未使用 proximity 滚动叙事" });
if (!/prefers-reduced-motion/i.test(html)) issues.push({ gate: "motion-accessibility", message: "缺少 reduced-motion 支持" });
if (!/@media\s+print/i.test(html) || !/\.mint-details\[hidden\][^{]*\{[^}]*display\s*:\s*block/is.test(html)) issues.push({ gate: "print-completeness", message: "打印状态未明确展开必要详情" });
if (!/id=["']mint-creative-data["']/.test(html)) issues.push({ gate: "edit-state", message: "缺少嵌入式结构化创意模型" });
if (fieldPaths.length !== new Set(fieldPaths).size) issues.push({ gate: "edit-state", message: "存在重复字段路径" });
if (/fallback|旧卡片模板|降级模板/i.test(html)) issues.push({ gate: "no-fallback", message: "检测到禁止的视觉回退标记" });
const compositions = brief.scenes.map((scene) => scene.compositionIntent);
for (let index = 1; index < compositions.length; index += 1) if (compositions[index] === compositions[index - 1] && !brief.scenes[index].repeatReason) issues.push({ gate: "visual-rhythm", sceneId: brief.scenes[index].id, message: "相邻场景机械重复且未说明原因" });
const report = {
  schemaVersion: "0.9",
  passed: issues.length === 0,
  gates: { scenes: sceneIds.length, requiredScenes: brief.scenes.length, mustShowAtoms: brief.scenes.flatMap((scene) => scene.mustShow).length, renderedAtomRefs: atomRefs.size, stableFieldPaths: fieldPaths.length, externalAssets: externalAssets.length },
  issues
};
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
