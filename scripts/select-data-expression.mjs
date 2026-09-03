#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routingFile = path.join(here, "..", "references", "data-expression-routing.md");
const FAMILY_TAGS = {
  "单个指标与状态": ["metric", "kpi", "status", "target", "threshold", "progress", "current"],
  "时间、趋势与计划": ["temporal", "time-series", "trend", "timeline", "milestone", "plan", "schedule", "before-after", "rank-over-time", "gate-timeline", "forecast-window"],
  "比较、排序与差距": ["comparison", "ranking", "difference", "benchmark", "variance", "pair", "target-vs-actual", "scorecard", "strategic-role"],
  "构成、占比与集中度": ["part-to-whole", "composition", "share", "concentration", "hierarchical-share", "positive-negative", "ownership", "equity", "portfolio", "allocation"],
  "转化、流转与贡献": ["funnel", "conversion", "flow", "waterfall", "contribution", "process", "sequence", "value-chain", "convergence", "acquisition-path", "account-flow", "screening"],
  "关系、相关性、分布与地域": ["correlation", "distribution", "scatter", "geography", "cohort", "heatmap", "cluster"],
  "目标、进度、风险与决策": ["risk", "decision", "priority", "scenario", "sensitivity", "action", "responsibility", "causal", "regulatory-gate", "budget-bridge"],
  "层级、结构与系统关系": ["hierarchy", "network", "architecture", "dependency", "raci", "capability", "cycle", "license-ladder", "ownership-tree"],
  "定性信息与证据": ["qualitative", "evidence", "quote", "screenshot", "case", "uncertain", "detail", "parallel"]
};

const uniq = values => [...new Set((values || []).map(value => String(value).trim()).filter(Boolean))];
const numeric = values => (values || []).map(Number).filter(Number.isFinite);

function inferDataShape(context) {
  const periods = uniq(context.periods);
  const metrics = uniq(context.metrics);
  const categories = uniq(context.categories);
  const units = uniq(context.units);
  const values = numeric(context.values);
  const text = [context.decisionIntent, ...metrics, ...categories, ...periods].join(" ");
  const hasTime = periods.length >= 2 || /(?:Y[1-9]\d*|20\d{2}|H[12]|Q[1-4]|上半年|下半年|月|季度|年度)/i.test(text);
  const finance = /收入|成本|费用|利润|损益|预算|预测|实际|估值|倍数|ROE|ROI|现金流/i.test(text);
  const breakEven = values.some(value => value < 0) && values.some(value => value >= 0);
  const valuation = /估值|倍数|股权价值|市盈率|市净率|EV|EBITDA/i.test(text);
  const budgetBridge = /预算|预测|实际|余量|差额|节省/i.test(text) && metrics.length + categories.length >= 2;
  return {
    hasTime,
    finance,
    breakEven,
    valuation,
    budgetBridge,
    metrics,
    categories,
    periods,
    units,
    values,
    containsNegative: context.containsNegative === true || values.some(value => value < 0),
    crossesZero: context.crossesZero === true || breakEven
  };
}

function routeDataShape(context) {
  const shape = inferDataShape(context);
  const families = [];
  const preferred = [];
  const forbidden = [];
  const reasons = [];
  if (shape.valuation) {
    families.push("目标、进度、风险与决策", "比较、排序与差距");
    preferred.push("估值公式或估值桥", "情景比较矩阵");
    forbidden.push("把估值倍数当作普通类别柱状图");
    reasons.push("估值需要同时保留公式、口径和情景，不是普通并列数据");
  }
  if (shape.breakEven) {
    families.push("时间、趋势与计划", "转化、流转与贡献");
    preferred.push("带零轴的盈亏平衡趋势", "利润桥或精确表格");
    forbidden.push("隐藏负值或分别归一化各系列");
    reasons.push("数值跨越零点，必须展示首次转正期间和共同零轴");
  } else if (shape.finance && shape.hasTime) {
    families.push("时间、趋势与计划");
    preferred.push(shape.units.length <= 1 ? "共享绝对坐标轴的财务趋势" : "按单位拆分的小多图", "精确财务表格");
    if (shape.units.length > 1) forbidden.push("不同单位直接使用同一纵轴");
    reasons.push("财务指标具有明确期间顺序，应按时间和单位表达");
  }
  if (shape.budgetBridge) {
    families.push("转化、流转与贡献", "目标、进度、风险与决策");
    preferred.push("预算桥或瀑布图", "分类预算使用率条形图");
    forbidden.push("只展示孤立预算数字而不说明实际、计划和余量关系");
    if (shape.units.length > 1) forbidden.push("金额、比例等不同单位直接使用同一纵轴");
    reasons.push("预算问题同时包含总量桥接、结构使用率和管理动作");
  }
  return { shape, families: uniq(families), preferred: uniq(preferred), forbidden: uniq(forbidden), reasons: uniq(reasons) };
}

function section(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`); if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + 4); return markdown.slice(start, next < 0 ? markdown.length : next).trim();
}

export function selectRoutes(input, markdown = fs.readFileSync(routingFile, "utf8")) {
  const context = Array.isArray(input) ? { relationTypes: input } : (input || {});
  const tags = uniq(context.relationTypes).map(value => value.toLowerCase());
  const dataRoute = routeDataShape(context);
  const families = uniq([
    ...dataRoute.families,
    ...Object.entries(FAMILY_TAGS).filter(([, aliases]) => tags.some(tag => aliases.some(alias => tag === alias || tag.includes(alias) || alias.includes(tag)))).map(([heading]) => heading)
  ]);
  if (!families.length) families.push("定性信息与证据");
  return {
    schemaVersion: "0.13.0",
    relationTypes: tags,
    dataShape: dataRoute.shape,
    families,
    preferredExpressions: dataRoute.preferred,
    forbiddenExpressions: dataRoute.forbidden,
    reasons: dataRoute.reasons,
    guidance: families.map(heading => section(markdown, heading)),
    antiRules: section(markdown, "反向禁用规则")
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input = process.argv.slice(2);
  if (input.length === 1 && fs.existsSync(path.resolve(input[0]))) input = JSON.parse(fs.readFileSync(path.resolve(input[0]), "utf8"));
  console.log(JSON.stringify(selectRoutes(input), null, 2));
}
