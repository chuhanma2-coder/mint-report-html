#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { validateSceneCss, validateSceneHtml } from "./scene-project.mjs";

const projectDir = path.resolve(process.argv[2] || "creative-output");
const outputFile = path.resolve(process.argv[3] || path.join(projectDir, "scene-project-qa.json"));
if (!fs.existsSync(path.join(projectDir, "creative-brief.json"))) { console.error("Usage: node validate-scene-project.mjs <project-dir> [report.json]"); process.exit(2); }
const brief = JSON.parse(fs.readFileSync(path.join(projectDir, "creative-brief.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(projectDir, "content-map.json"), "utf8"));
const errors = [];
for (const scene of brief.scenes) {
  const htmlFile = path.join(projectDir, "src", "scenes", `${scene.id}.html`), cssFile = path.join(projectDir, "src", "scenes", `${scene.id}.css`);
  if (!fs.existsSync(htmlFile) || !fs.existsSync(cssFile)) { errors.push(`${scene.id}: 缺少 HTML 或 CSS Scene 模块`); continue; }
  errors.push(...validateSceneHtml(fs.readFileSync(htmlFile, "utf8"), scene, map.contentAtoms));
  errors.push(...validateSceneCss(fs.readFileSync(cssFile, "utf8"), scene.id));
}
const modelFile = path.join(projectDir, "report-model.json");
if (fs.existsSync(modelFile)) {
  const model = JSON.parse(fs.readFileSync(modelFile, "utf8"));
  for (const [chartId, chart] of Object.entries(model.charts || {})) {
    const categories = Array.isArray(chart.categories) ? chart.categories : [];
    const series = Array.isArray(chart.series) ? chart.series : [];
    if (!chart.title || !chart.unit || !chart.period) errors.push(`${chartId}: 图表必须保留标题、单位和统计周期`);
    if (!categories.length || !series.length) errors.push(`${chartId}: 图表缺少类别或系列`);
    const seriesUnits = new Set(series.map(item => item.unit || chart.unit).filter(Boolean));
    if ((chart.axisScalePolicy || "shared-absolute") === "shared-absolute" && seriesUnits.size > 1) errors.push(`${chartId}: 不同单位不得使用统一纵轴；请改用小多图或明确双轴合同`);
    for (const item of series) {
      if (!item.name) errors.push(`${chartId}: 每个系列必须有名称`);
      if (!Array.isArray(item.values) || item.values.length !== categories.length) errors.push(`${chartId}: 系列 ${item.name || "未命名"} 的点数与类别数不一致`);
      if ((item.values || []).some(value => !Number.isFinite(Number(value)))) errors.push(`${chartId}: 系列 ${item.name || "未命名"} 含非数值点`);
    }
    const values = series.flatMap(item => item.values || []).map(Number).filter(Number.isFinite);
    if (values.some(value => value < 0) && values.some(value => value >= 0) && chart.includeZero === false) errors.push(`${chartId}: 数据跨越零点时不得隐藏零轴`);
    if (chart.axisScalePolicy === "indexed" && series.some(item => !(item.values || []).some(value => Number(value) !== 0))) errors.push(`${chartId}: 指数化系列必须有非零基期`);
  }
}
const report = { schemaVersion: "0.13.0", passed: errors.length === 0, scenes: brief.scenes.length, errors };
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
