#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const routing=fs.readFileSync(path.join(root,"references/data-expression-routing.md"),"utf8"),skill=fs.readFileSync(path.join(root,"SKILL.md"),"utf8"),workflow=fs.readFileSync(path.join(root,"references/collaboration-workflow.md"),"utf8");
for(const heading of ["单个指标与状态","时间、趋势与计划","比较、排序与差距","构成、占比与集中度","转化、流转与贡献","关系、相关性、分布与地域","目标、进度、风险与决策","层级、结构与系统关系","定性信息与证据","反向禁用规则"])assert.match(routing,new RegExp(`## ${heading}`));
for(const expression of ["子弹图","折线图","坡度图","排名变化图","偏差条形图","100% 堆叠条形图","帕累托图","漏斗图","瀑布图","桑基图","泳道图","散点图","箱线图","留存矩阵热力图","风险矩阵","加权决策矩阵","RACI 矩阵","系统架构图","关系网络图","截图＋高亮区域＋解释"])assert.ok(routing.includes(expression),`missing route: ${expression}`);
for(const antiRule of ["禁止“出现多个数字就必须画图”","口径、单位、对象或时间周期不同的数据不得直接比较","源材料已有关键图表时必须保留其数据","来源必须在内部来源台账中完整可追溯"])assert.ok(routing.includes(antiRule),`missing anti-rule: ${antiRule}`);
for(const colorRule of ["两个系列、任意数量类别","第一系列固定蓝色","第二系列固定橙色","三至六个系列","折线图和面积图","超过四条折线","颜色之外至少再提供文字、线型、点形或直接标签"])assert.ok(routing.includes(colorRule),`missing color rule: ${colorRule}`);
assert.match(skill,/references\/data-expression-routing\.md/);assert.match(skill,/references\/collaboration-workflow\.md/);assert.match(skill,/data-edit-kind=table\|chart\|media\|diagram/);assert.match(workflow,/正常交付只有一个 `\.mint-section\.html`/);assert.match(workflow,/日常不导出 ZIP/);assert.match(workflow,/原生可编辑对象/);
console.log(JSON.stringify({passed:true,routingFamilies:10,representationsChecked:20,antiRulesChecked:4,colorRulesChecked:7,collaborationDocumented:true}));
