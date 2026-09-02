#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { auditTextFieldContracts } from "./html-field-contract.mjs";

const htmlFile = path.resolve(process.argv[2] || "");
const briefFile = path.resolve(process.argv[3] || "");
const outputFile = path.resolve(process.argv[4] || path.join(path.dirname(htmlFile || "."), "qa-report.json"));
if (!fs.existsSync(htmlFile) || !fs.existsSync(briefFile)) {
  console.error("Usage: node qa-creative-html.mjs report.html creative-brief.json [qa-report.json]");
  process.exit(2);
}
const html = fs.readFileSync(htmlFile, "utf8");
const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
const visibleText = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const brief = JSON.parse(fs.readFileSync(briefFile, "utf8"));
const issues = [];
const matches = (pattern) => [...html.matchAll(pattern)];
const sceneIds = matches(/<section\b[^>]*class=["'][^"']*\bmint-scene\b[^"']*["'][^>]*data-scene-id=["']([^"']+)["']/gi).map((match) => match[1]);
const atomRefs = new Set(matches(/data-atom-ref=["']([^"']+)["']/gi).flatMap((match) => match[1].split(/\s+/).filter(Boolean)));
const fieldPaths = matches(/data-field-path=["']([^"']+)["']/gi).map((match) => match[1]);
const editableTags = [...markup.matchAll(/<[^<>]+data-edit-policy=["']editable["'][^<>]*>/gi)].map((match) => match[0]);
const titleTags = [...markup.matchAll(/<h[1-3]\b[^<>]*data-title-contract[^<>]*>/gi)].map((match) => match[0]);
const formalTextTags = [...markup.matchAll(/<(?:h[1-6]|p|li|small|figcaption|th|td)\b[^<>]*>/gi)].map((match) => match[0]);
const typedBusinessTags = [...markup.matchAll(/<[^<>]+data-edit-kind=["']([^"']+)["'][^<>]*>/gi)].map((match) => ({ tag: match[0], kind: match[1] }));
const sceneMarkup = [...markup.matchAll(/<section\b[^>]*class=["'][^"']*\bmint-scene\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi)].map((match) => match[0]).join("\n");
const fieldAudit = auditTextFieldContracts(sceneMarkup);
const externalAssets = matches(/<(?:script|img|video|audio|source|link)\b[^>]*(?:src|href)=["']https?:\/\/[^"']+/gi).map((match) => match[0]);
if (externalAssets.length) issues.push({ gate: "offline-first", message: `存在 ${externalAssets.length} 个外部首屏资源依赖` });
const forbiddenAuditMetadata = [/report\.mint-task\.json/i, /任务边界\s*[:：]/i, /负责人\s*[A-Za-z甲乙丙丁0-9]/i, /大纲\s*(?:第\s*)?[0-9一二三四五六七八九十]+/i, /来源\s*[:：][^；。<>]*\.(?:docx|pptx|xlsx|pdf|txt|md)\b/i];
for (const pattern of forbiddenAuditMetadata) if (pattern.test(visibleText)) issues.push({ gate: "audit-metadata-visibility", message: `内部审计信息不得出现在汇报页面：${pattern}` });
const navTargets = [...markup.matchAll(/<button\b[^>]*data-scene-target[^>]*>([\s\S]*?)<\/button>/gi)].map((match) => match[1].replace(/<[^>]+>/g, "").trim());
if (navTargets.some(Boolean)) issues.push({ gate: "navigation", message: "底部页面导航只能显示圆点，不得显示标题文字" });
if (new Set(sceneIds).size !== brief.scenes.length || brief.scenes.some((scene) => !sceneIds.includes(scene.id))) issues.push({ gate: "scene-contract", message: "HTML 场景 ID 与 creative-brief 不一致" });
for (const scene of brief.scenes) for (const atomRef of scene.mustShow) if (!atomRefs.has(atomRef)) issues.push({ gate: "must-show", sceneId: scene.id, atomRef, message: "关键内容未在正式 DOM 中标注可见去向" });
if (!/scroll-snap-type\s*:\s*y\s+proximity/i.test(html)) issues.push({ gate: "scroll-contract", message: "未使用 proximity 滚动叙事" });
if (!/prefers-reduced-motion/i.test(html)) issues.push({ gate: "motion-accessibility", message: "缺少 reduced-motion 支持" });
if (!/@media\s+print/i.test(html) || !/\.mint-details\[hidden\][^{]*\{[^}]*display\s*:\s*block/is.test(html)) issues.push({ gate: "print-completeness", message: "打印状态未明确展开必要详情" });
if (!/id=["']mint-creative-data["']/.test(html)) issues.push({ gate: "edit-state", message: "缺少嵌入式结构化创意模型" });
// Repeated views of one canonical field are legal; element IDs, not field paths, identify DOM objects.
if (!editableTags.length) issues.push({ gate: "editability", message: "没有任何正式文字字段声明为可编辑" });
if (editableTags.some((tag) => !/data-field-path=["'][^"']+["']/i.test(tag))) issues.push({ gate: "editability", message: "可编辑字段缺少稳定字段路径" });
if (fieldAudit.uncovered.length) issues.push({ gate: "editability", message: `存在 ${fieldAudit.uncovered.length} 段未声明编辑策略的可见文字`, samples: fieldAudit.uncovered.slice(0, 5) });
if (fieldAudit.invalidEditable.length) issues.push({ gate: "editability", message: "可编辑文字缺少稳定字段路径" });
if (fieldAudit.invalidRestricted.length) issues.push({ gate: "editability", message: "locked/derived 文字缺少合法 data-edit-reason" });
if (fieldAudit.invalidIdentity.length) issues.push({ gate: "stable-identity", message: "可见文字合同缺少稳定 element/content ID" });
if (fieldAudit.invalidGeometry.length) issues.push({ gate: "geometry-contract", message: "可见文字合同缺少几何角色" });
if (fieldAudit.coverage !== 1) issues.push({ gate: "editability", message: `可见文字合同覆盖率 ${(fieldAudit.coverage * 100).toFixed(1)}%，要求 100%` });
if (typedBusinessTags.some(({kind}) => !/^(?:table|chart|media|diagram)$/.test(kind))) issues.push({ gate: "editability", message: "存在未知类型的业务编辑对象" });
if (typedBusinessTags.some(({tag}) => !/data-edit-policy=["']editable["']/i.test(tag) || !/data-field-path=["'][^"']+["']/i.test(tag))) issues.push({ gate: "editability", message: "表格、图表、图片或关系图未全部绑定可编辑字段" });
if (formalTextTags.some((tag) => !/data-element-id=["'][^"']+["']/i.test(tag) || !/data-content-id=["'][^"']+["']/i.test(tag))) issues.push({ gate: "stable-identity", message: "正式文字缺少稳定 element/content ID" });
if (formalTextTags.some((tag) => !/data-qa-role=["']text["']/i.test(tag) || !/data-qa-overlap=["'](?:forbid|allow-contained|allow-same-group)["']/i.test(tag))) issues.push({ gate: "geometry-contract", message: "正式文字缺少碰撞合同" });
for (const control of ["data-scene-prev", "data-scene-next", "data-edit-toggle", "data-chrome-toggle"]) if (!new RegExp(`\\b${control}\\b`, "i").test(html)) issues.push({ gate: "mandatory-controls", message: `缺少 ${control} 控件` });
if (!/class=["'][^"']*mint-scene__viewport/.test(markup) || !/class=["'][^"']*mint-scene__stage/.test(markup)) issues.push({ gate: "canvas-contract", message: "缺少固定桌面画布与受控移动布局容器" });
if (titleTags.length !== brief.scenes.length) issues.push({ gate: "title-contract", message: "每个场景必须有且只有一个声明标题合同的主标题" });
if (titleTags.some((tag) => !/data-title-role=["'](?:display|section|content|module)["']/i.test(tag))) issues.push({ gate: "title-contract", message: "标题缺少合法角色" });
if (/fallback|旧卡片模板|降级模板/i.test(html)) issues.push({ gate: "no-fallback", message: "检测到禁止的视觉回退标记" });
const compositions = brief.scenes.map((scene) => scene.compositionIntent);
for (let index = 1; index < compositions.length; index += 1) if (compositions[index] === compositions[index - 1] && !brief.scenes[index].repeatReason) issues.push({ gate: "visual-rhythm", sceneId: brief.scenes[index].id, message: "相邻场景机械重复且未说明原因" });
const report = {
  schemaVersion: "0.10.0-rc.1",
  passed: issues.length === 0,
  gates: { scenes: sceneIds.length, requiredScenes: brief.scenes.length, mustShowAtoms: brief.scenes.flatMap((scene) => scene.mustShow).length, renderedAtomRefs: atomRefs.size, stableFieldPaths: fieldPaths.length, editableFields: editableTags.length, typedBusinessObjects: typedBusinessTags.length, visibleTextRuns: fieldAudit.total, editableTextRuns: fieldAudit.editable.length, intentionallyRestrictedTextRuns: fieldAudit.intentionalRestricted.length, editabilityCoverage: fieldAudit.coverage, mandatoryControls: 4, externalAssets: externalAssets.length },
  issues
};
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
