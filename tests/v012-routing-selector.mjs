#!/usr/bin/env node
import assert from "node:assert/strict";
import { selectRoutes } from "../scripts/select-data-expression.mjs";

const cases = {
  "metric": "单个指标与状态",
  "time-series": "时间、趋势与计划",
  "ranking": "比较、排序与差距",
  "part-to-whole": "构成、占比与集中度",
  "funnel": "转化、流转与贡献",
  "distribution": "关系、相关性、分布与地域",
  "risk": "目标、进度、风险与决策",
  "hierarchy": "层级、结构与系统关系",
  "qualitative": "定性信息与证据"
};
for (const [relation, family] of Object.entries(cases)) { const result = selectRoutes([relation]); assert.ok(result.families.includes(family), `${relation} did not route to ${family}`); assert.ok(result.guidance.every(Boolean)); assert.match(result.antiRules, /出现多个数字就必须画图/); }
const unknown = selectRoutes(["unknown-relation"]); assert.deepEqual(unknown.families, ["定性信息与证据"]); assert.doesNotMatch(JSON.stringify(unknown), /默认柱状图/);
console.log(JSON.stringify({ passed: true, families: Object.keys(cases).length, deterministic: true, fullAntiRules: true }));
