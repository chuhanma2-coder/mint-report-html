#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planDeck } from "../core/scripts/plan-deck.mjs";
import { compileChineseSource } from "../core/scripts/compile-chinese-source.mjs";
import { selectRoutes } from "../scripts/select-data-expression.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const text=index=>`第${index}项管理事实：${"这是来自原始资料且不得删除的完整业务说明。".repeat(12)}`;
const discourseUnits=Array.from({length:6},(_,index)=>({id:`SU${index+1}`,text:text(index+1),sectionId:"S1",section:"经营进展",subject:"经营进展",role:"evidence",numericClaimRefs:[],listGroup:null}));
const contentAtoms=discourseUnits.map((unit,index)=>({id:`A${index+1}`,text:unit.text,kind:"fact",discourseRefs:[unit.id]}));
const map={status:"planned",sourceUnits:discourseUnits,discourseUnits,contentAtoms,semanticGraph:{edges:[]}};
const task={status:"planned",readingMode:"presentation",pageContract:{constraint:"minimum-needed",overflowPolicy:"recompose"}};
const plan=planDeck(task,map);
assert.ok(plan.pageContracts.length>1,"连续同章节内容不得通过传递合并挤入一个超容量页面");
assert.equal(plan.capacityConflicts.length,0,"可拆分的容量问题应自动拆页而不是要求用户确认");
assert.deepEqual(new Set(plan.pageContracts.flatMap(page=>page.clusterContract.sourceUnitRefs)),new Set(discourseUnits.map(unit=>unit.id)),"自动拆页不得丢失任何原始单元");

const hugeUnit={...discourseUnits[0],id:"HUGE",text:"不可切分的单条原始事实。".repeat(120)};
const hugePlan=planDeck(task,{status:"planned",sourceUnits:[hugeUnit],discourseUnits:[hugeUnit],contentAtoms:[{id:"AH",text:hugeUnit.text,kind:"fact",discourseRefs:[hugeUnit.id]}],semanticGraph:{edges:[]}});
assert.equal(hugePlan.capacityConflicts.length,1,"真正不可切分的超容量单元仍必须触发完整性安全门");

const storyUnits=[
  {id:"B1",text:"390万白名单与970余万设备构成当前可经营资源池。",sectionId:"S4",section:"现有资源如何转化为放款规模",subject:"资源池",role:"evidence",numericClaimRefs:["N1"]},
  {id:"B2",text:"通过主动触达形成安装与核额漏斗。",sectionId:"S4",section:"现有资源如何转化为放款规模",subject:"转化路径",role:"action",numericClaimRefs:[]},
  {id:"B3",text:"白名单低欺诈、定价与手机锁构成风险约束。",sectionId:"S4",section:"现有资源如何转化为放款规模",subject:"风险约束",role:"boundary",numericClaimRefs:[]}
];
const storyPlan=planDeck(task,{status:"planned",sourceUnits:storyUnits,discourseUnits:storyUnits,contentAtoms:storyUnits.map((unit,index)=>({id:`B-A${index+1}`,text:unit.text,kind:index===0?"numeric":index===1?"action":"boundary",discourseRefs:[unit.id]})),semanticGraph:{edges:[]}});
assert.equal(storyPlan.pageContracts.length,1,"同一管理故事中的证据、动作和风险约束应优先合成一页");
assert.deepEqual(new Set(storyPlan.pageContracts[0].clusterContract.sourceUnitRefs),new Set(storyUnits.map(unit=>unit.id)),"页面合并不得删除任何来源单元");
assert.ok(storyPlan.pageContracts[0].decisionKey.startsWith("DK-"),"每个管理决策必须有稳定 decisionKey");
assert.doesNotMatch(storyPlan.pageContracts[0].pageQuestion,/这一页需要回答什么|需要形成什么判断/,'管理问题不得使用空泛占位句');

const financialRoute=selectRoutes({relationTypes:["parallel"],decisionIntent:"Y1-Y5收入、成本、利润与盈亏平衡",metrics:["收入","成本","利润"],periods:["Y1","Y2","Y3","Y4","Y5"],values:[-10,-3,2,8,15],units:["万元"]});
assert.ok(financialRoute.families.includes("时间、趋势与计划"),"跨期财务数据必须路由到时间趋势");
assert.ok(financialRoute.preferredExpressions.some(value=>/盈亏平衡/.test(value)),"负转正财务数据必须识别盈亏平衡");
assert.ok(financialRoute.forbiddenExpressions.some(value=>/分别归一化/.test(value)),"多系列不得分别归一化后比较绝对值");

const valuationRoute=selectRoutes({relationTypes:["comparison"],decisionIntent:"估值与股权价值情景",metrics:["收入倍数","估值"],categories:["基准","上行情景"],values:[1.2,1.8],units:["倍","亿美元"]});
assert.ok(valuationRoute.preferredExpressions.some(value=>/估值公式|估值桥/.test(value)),"估值关系必须路由到公式、桥或情景矩阵");

const budgetRoute=selectRoutes({relationTypes:["comparison"],decisionIntent:"年初预算、滚动预测、预算余量和分类使用率",metrics:["年初预算","滚动预测","预算余量","使用率"],categories:["人力","IT"],values:[4839,3606,1233,75,40],units:["万元","%"]});
assert.ok(budgetRoute.preferredExpressions.some(value=>/预算桥/.test(value)),"预算样本必须识别总盘桥接关系");
assert.ok(budgetRoute.forbiddenExpressions.some(value=>/不同单位/.test(value)),"预算金额和使用率不得直接共轴");

const negativeMap=compileChineseSource({rawText:"利润计划\nY1利润 -10万元；Y2利润 3万元。",sourceName:"financial.md",schemaVersion:"0.13.0"});
assert.ok(negativeMap.numericClaims.some(claim=>claim.value===-10),"财务编译必须保留负数符号");
assert.ok(negativeMap.numericClaims.some(claim=>claim.period==="Y1"),"财务编译必须识别Y期间");

const skill=fs.readFileSync(path.join(root,"SKILL.md"),"utf8");
const css=fs.readFileSync(path.join(root,"assets/mint-creative-runtime.css"),"utf8");
const editor=fs.readFileSync(path.join(root,"assets/mint-typed-editor.js"),"utf8");
const visualQa=fs.readFileSync(path.join(root,"scripts/visual-qa-creative.mjs"),"utf8");
const pptx=fs.readFileSync(path.join(root,"scripts/export-editable-pptx.mjs"),"utf8");
assert.match(skill,/Audit metadata and audience-facing report content are separate contracts/);
assert.match(css,/transform:scale\(\.8\)/);
assert.match(css,/mint-editor>\.mint-editor__close/);
assert.match(editor,/#2F86A6.*#F08A5D/);
assert.match(editor,/mint-chart__legend/);
assert.match(editor,/axisScalePolicy/);
assert.match(editor,/scale\.y\(value\)/);
assert.doesNotMatch(editor,/function points\([^)]*\) \{ const max=/);
assert.doesNotMatch(visualQa,/name:\s*"mobile"/);
assert.match(visualQa,/information-density/);
assert.match(visualQa,/table-density/);
assert.doesNotMatch(pptx,/note\.text=\[value\.period,value\.source\]/);
console.log(JSON.stringify({passed:true,automaticScenes:plan.pageContracts.length,sourceUnits:discourseUnits.length,irreducibleCapacityGate:true,mobileQaRemoved:true}));
