#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routingFile = path.join(here, "..", "references", "data-expression-routing.md");
const FAMILY_TAGS = {
  "单个指标与状态": ["metric", "kpi", "status", "target", "threshold", "progress", "current"],
  "时间、趋势与计划": ["temporal", "time-series", "trend", "timeline", "milestone", "plan", "schedule", "before-after", "rank-over-time"],
  "比较、排序与差距": ["comparison", "ranking", "difference", "benchmark", "variance", "pair", "target-vs-actual"],
  "构成、占比与集中度": ["part-to-whole", "composition", "share", "concentration", "hierarchical-share", "positive-negative"],
  "转化、流转与贡献": ["funnel", "conversion", "flow", "waterfall", "contribution", "process", "sequence", "value-chain"],
  "关系、相关性、分布与地域": ["correlation", "distribution", "scatter", "geography", "cohort", "heatmap", "cluster"],
  "目标、进度、风险与决策": ["risk", "decision", "priority", "scenario", "sensitivity", "action", "responsibility", "causal"],
  "层级、结构与系统关系": ["hierarchy", "network", "architecture", "dependency", "raci", "capability", "cycle"],
  "定性信息与证据": ["qualitative", "evidence", "quote", "screenshot", "case", "uncertain", "detail", "parallel"]
};

function section(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`); if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + 4); return markdown.slice(start, next < 0 ? markdown.length : next).trim();
}

export function selectRoutes(relationTypes, markdown = fs.readFileSync(routingFile, "utf8")) {
  const tags = [...new Set((relationTypes || []).map(value => String(value).trim().toLowerCase()).filter(Boolean))];
  const families = Object.entries(FAMILY_TAGS).filter(([, aliases]) => tags.some(tag => aliases.some(alias => tag === alias || tag.includes(alias) || alias.includes(tag)))).map(([heading]) => heading);
  if (!families.length) families.push("定性信息与证据");
  return { schemaVersion: "0.12.0", relationTypes: tags, families, guidance: families.map(heading => section(markdown, heading)), antiRules: section(markdown, "反向禁用规则") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let relations = process.argv.slice(2);
  if (relations.length === 1 && fs.existsSync(path.resolve(relations[0]))) { const value = JSON.parse(fs.readFileSync(path.resolve(relations[0]), "utf8")); relations = Array.isArray(value) ? value : value.relationTypes || []; }
  console.log(JSON.stringify(selectRoutes(relations), null, 2));
}
