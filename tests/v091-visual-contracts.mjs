#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlSkill = path.resolve(here, "..");
const skillsRoot = path.resolve(htmlSkill, "..");
const repo = path.resolve(skillsRoot, "..");
const canonicalFile = fs.existsSync(path.join(repo, "shared/design-tokens.json"))
  ? path.join(repo, "shared/design-tokens.json")
  : path.join(htmlSkill, "assets/design-tokens.json");
const canonical = JSON.parse(fs.readFileSync(canonicalFile, "utf8"));
const htmlTokens = JSON.parse(fs.readFileSync(path.join(htmlSkill, "assets/design-tokens.json"), "utf8"));
const deckTokenFile = path.join(skillsRoot, "mint-report-deck/assets/design-tokens.json");

assert.deepEqual(htmlTokens, canonical, "创意 HTML 必须使用公共设计 Token");
if (fs.existsSync(deckTokenFile)) {
  const deckTokens = JSON.parse(fs.readFileSync(deckTokenFile, "utf8"));
  assert.deepEqual(deckTokens, canonical, "同仓库正式 Deck 必须使用公共设计 Token");
}
assert.deepEqual(
  Object.fromEntries(["page", "paper", "ink900", "jade700", "blue500", "coral500", "jade100", "ink600", "line"].map((key) => [key, canonical.palette[key]])),
  {
    page: "#F7FBF9",
    paper: "#FFFFFF",
    ink900: "#18312A",
    jade700: "#087C66",
    blue500: "#2F86A6",
    coral500: "#F08A5D",
    jade100: "#E9F5F1",
    ink600: "#586B65",
    line: "#D4E2DD"
  }
);

const tokenCss = fs.readFileSync(path.join(htmlSkill, "assets/mint-creative-tokens.css"), "utf8");
const runtimeCss = fs.readFileSync(path.join(htmlSkill, "assets/mint-creative-runtime.css"), "utf8");
const runtimeJs = fs.readFileSync(path.join(htmlSkill, "assets/mint-creative-runtime.js"), "utf8");
for (const hex of ["#F7FBF9", "#FFFFFF", "#18312A", "#087C66", "#2F86A6", "#F08A5D"]) {
  assert.match(tokenCss, new RegExp(hex, "i"), `缺少方案 C 色值 ${hex}`);
}
assert.match(runtimeCss, /\.mint-scene__stage\s*\{/);
assert.match(runtimeCss, /width:\s*1920px/);
assert.match(runtimeCss, /height:\s*1080px/);
assert.match(runtimeCss, /letter-spacing:\s*0/);
assert.match(runtimeJs, /ArrowLeft/);
assert.match(runtimeJs, /ArrowRight/);
assert.match(runtimeJs, /data-edit-policy="editable"/);
assert.match(runtimeJs, /contenteditable/);

const forbidden = ["#F5F0E6", "#FFFDF8", "#0E453A", "#1C7866", "#BC794D"];
const componentCssFile = path.join(skillsRoot, "mint-report-deck/assets/runtime/mint-components.css");
if (fs.existsSync(componentCssFile)) {
  const componentCss = fs.readFileSync(componentCssFile, "utf8");
  for (const hex of forbidden) {
    assert.doesNotMatch(componentCss, new RegExp(hex, "i"), `正式组件仍残留旧配色 ${hex}`);
  }
}

console.log(JSON.stringify({ passed: true, scheme: "C-original", sharedTokens: true, fixedDesktopStage: true, editingAndPaging: true }, null, 2));
