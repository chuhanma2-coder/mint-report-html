#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditTextFieldContracts } from "./html-field-contract.mjs";

const VERSION = "0.9.3";
const e = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function validateSceneCss(css, sceneId) {
  const errors = [];
  const source = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/!important\b/i.test(source)) errors.push(`${sceneId}: Scene CSS 禁止 !important`);
  const reserved = /(^|[\s,>+~])(html|body|:root)(?=$|[\s,>+~.#[:])/;
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const selectorText = match[1].trim();
    if (!selectorText || selectorText.startsWith("@")) continue;
    for (const selector of selectorText.split(",").map((item) => item.trim())) {
      if (reserved.test(selector)) errors.push(`${sceneId}: 禁止 Scene CSS 修改 ${selector}`);
      if (!selector.startsWith(`[data-scene-id="${sceneId}"]`)) errors.push(`${sceneId}: 选择器未命名空间化 ${selector}`);
      if (/\.mint-(?:nav|control|page-arrow|edit-toggle|edit-status|modal)\b/.test(selector)) errors.push(`${sceneId}: 禁止修改 Runtime 控件 ${selector}`);
    }
  }
  return errors;
}

export function validateSceneHtml(html, scene, atoms) {
  const errors = [];
  const open = String(html || "").match(/<section\b[^>]*>/i)?.[0] || "";
  if (!new RegExp(`data-scene-id=["']${scene.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(open)) errors.push(`${scene.id}: Scene 根节点 ID 不匹配`);
  if (/data-scene-status=["']placeholder["']/.test(html)) errors.push(`${scene.id}: Scene 仍是占位稿`);
  const elementIds = [...html.matchAll(/data-element-id=["']([^"']+)["']/g)].map((match) => match[1]);
  if (elementIds.length !== new Set(elementIds).size) errors.push(`${scene.id}: data-element-id 重复`);
  for (const qaElement of html.matchAll(/<[^>]+data-qa-role=["'](?:text|connector|node|media|decoration)["'][^>]*>/gi)) if (!/data-element-id=["'][^"']+["']/.test(qaElement[0])) errors.push(`${scene.id}: 几何元素缺少 data-element-id`);
  for (const tag of html.matchAll(/<(h[1-6]|p|li|small|figcaption|th|td)\b([^>]*)>/gi)) {
    const attrs = tag[2];
    if (!/data-element-id=["'][^"']+["']/.test(attrs)) errors.push(`${scene.id}: 正式文字 ${tag[1]} 缺少 data-element-id`);
    if (!/data-content-id=["'][^"']+["']/.test(attrs)) errors.push(`${scene.id}: 正式文字 ${tag[1]} 缺少 data-content-id`);
    if (!/data-field-path=["'][^"']+["']/.test(attrs)) errors.push(`${scene.id}: 正式文字 ${tag[1]} 缺少 data-field-path`);
    if (!/data-edit-policy=["'](?:editable|derived|locked)["']/.test(attrs)) errors.push(`${scene.id}: 正式文字 ${tag[1]} 缺少编辑合同`);
    if (!/data-qa-role=["']text["']/.test(attrs) || !/data-qa-overlap=["'](?:forbid|allow-contained|allow-same-group)["']/.test(attrs)) errors.push(`${scene.id}: 正式文字 ${tag[1]} 缺少碰撞合同`);
  }
  const fieldAudit = auditTextFieldContracts(html);
  if (fieldAudit.uncovered.length) errors.push(`${scene.id}: ${fieldAudit.uncovered.length} 段可见文字没有编辑合同（${fieldAudit.uncovered.slice(0, 3).map((run) => run.text).join(" / ")}）`);
  if (fieldAudit.invalidEditable.length) errors.push(`${scene.id}: 可编辑文字缺少稳定 data-field-path`);
  if (fieldAudit.invalidRestricted.length) errors.push(`${scene.id}: locked/derived 文字缺少合法 data-edit-reason`);
  if (fieldAudit.invalidIdentity.length) errors.push(`${scene.id}: 可见文字合同缺少稳定 element/content ID`);
  if (fieldAudit.invalidGeometry.length) errors.push(`${scene.id}: 可见文字合同缺少几何角色`);
  if (fieldAudit.coverage !== 1) errors.push(`${scene.id}: 可见文字合同覆盖率不是 100%`);
  for (const atomRef of scene.mustShow || []) if (!new RegExp(`data-atom-ref=["'][^"']*${atomRef}`).test(html)) errors.push(`${scene.id}: mustShow ${atomRef} 未在 Scene 中出现`);
  const known = new Set(atoms.map((atom) => atom.id));
  for (const match of html.matchAll(/data-content-id=["']([^"']+)["']/g)) for (const ref of match[1].split(/\s+/)) if (ref.startsWith("A") && !known.has(ref)) errors.push(`${scene.id}: data-content-id 引用了未知 Atom ${ref}`);
  return errors;
}

export function syncSceneProject(projectDir) {
  const brief = readJson(path.join(projectDir, "creative-brief.json"));
  const map = readJson(path.join(projectDir, "content-map.json"));
  const atomById = new Map(map.contentAtoms.map((atom) => [atom.id, atom]));
  const sceneDir = path.join(projectDir, "src", "scenes");
  fs.mkdirSync(sceneDir, { recursive: true });
  const created = [];
  for (const scene of brief.scenes) {
    const htmlFile = path.join(sceneDir, `${scene.id}.html`), cssFile = path.join(sceneDir, `${scene.id}.css`);
    if (!fs.existsSync(htmlFile)) {
      const primary = scene.mustShow[0] || scene.atomRefs[0] || "scene-answer";
      const title = `<h2 data-element-id="scene-answer" data-content-id="${e(primary)}" data-field-path="sceneById.${e(scene.id)}.displayTitle" data-edit-policy="editable" data-qa-role="text" data-qa-overlap="forbid" data-title-contract data-title-role="${e(scene.titleContract.role)}">${e(scene.displayTitle)}</h2>`;
      const body = scene.mustShow.map((ref) => `<p data-element-id="atom-${e(ref)}" data-content-id="${e(ref)}" data-atom-ref="${e(ref)}" data-field-path="atoms.${e(ref)}" data-edit-policy="editable" data-qa-role="text" data-qa-overlap="forbid">${e(atomById.get(ref)?.text || ref)}</p>`).join("\n");
      fs.writeFileSync(htmlFile, `<section class="mint-scene" data-scene-id="${e(scene.id)}" data-scene-status="placeholder"><div class="mint-scene__viewport"><div class="mint-scene__stage">${title}\n${body}</div></div></section>\n`);
      created.push(path.relative(projectDir, htmlFile));
    }
    if (!fs.existsSync(cssFile)) {
      fs.writeFileSync(cssFile, `[data-scene-id="${scene.id}"] .mint-scene__stage { display: grid; align-content: center; gap: 28px; }\n`);
      created.push(path.relative(projectDir, cssFile));
    }
  }
  return { created, sceneDir };
}

function runCli() {
  const projectDir = path.resolve(process.argv[2] || "creative-output");
  if (!fs.existsSync(path.join(projectDir, "creative-brief.json"))) { console.error("Usage: node scene-project.mjs <project-dir>"); process.exit(2); }
  const result = syncSceneProject(projectDir);
  console.log(JSON.stringify({ passed: true, ...result }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
