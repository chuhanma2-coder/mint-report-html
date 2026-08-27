#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { classifyTask } from "../core/scripts/classify-task.mjs";
import { buildSourceLock, compileChineseSource } from "../core/scripts/compile-chinese-source.mjs";
import { planDeck } from "../core/scripts/plan-deck.mjs";

const source = path.resolve(process.argv[2] || "");
const output = path.resolve(process.argv[3] || "creative-output");
const optionsFile = process.argv[4] ? path.resolve(process.argv[4]) : null;
if (!fs.existsSync(source)) {
  console.error("Usage: node prepare-creative.mjs source.md output-dir [options.json]");
  process.exit(2);
}

const rawText = fs.readFileSync(source, "utf8");
const options = optionsFile && fs.existsSync(optionsFile) ? JSON.parse(fs.readFileSync(optionsFile, "utf8")) : {};
const task = {
  ...classifyTask({ ...options, rawText, outputMode: "creative-html", outputs: options.outputs || ["html", "pdf", "structure"] }),
  schemaVersion: "0.9.1"
};
const map = compileChineseSource({
  rawText,
  sourceName: path.basename(source),
  taskCard: task,
  communicationJob: options.communicationJob || {},
  schemaVersion: "0.9.1"
});
const sourceLock = buildSourceLock({ rawText, sourceName: path.basename(source), sourceUnits: map.sourceUnits });
const plan = planDeck(task, map);
const atomById = new Map(map.contentAtoms.map((atom) => [atom.id, atom]));
const unitRefs = (atomRefs) => [...new Set(atomRefs.flatMap((ref) => atomById.get(ref)?.sourceUnitRefs || []))];
const relationTypes = (page) => [...new Set([
  page.primaryRelation,
  ...page.relationGraphRefs.map((ref) => map.relationships.find((relation) => relation.id === ref)?.type)
].filter(Boolean))];
const interactionFor = (page) => {
  const result = [];
  if (page.proofObject?.dataShape === "numeric") result.push("数字口径或公式详情");
  if (["paired-objects", "independent-items"].includes(page.proofObject?.dataShape)) result.push("对象聚焦或对比切换");
  if (["milestones", "ordered-actions"].includes(page.proofObject?.dataShape)) result.push("阶段推进聚焦");
  if (page.atomRefs.length > 4) result.push("支持细节展开");
  return result;
};
const compositionFor = (page) => ({
  risk: "聚焦一个风险判断，并让依据、影响与动作形成清晰层级",
  action: "用方向明确的推进结构突出动作、责任与下一节点",
  contrast: "用可比较的共同尺度呈现差异，不把并列误画成流程",
  evidence: "让关键证据或数字成为视觉重心，结论紧随其后",
  mechanism: "用真实关系组织主体、流向或层级，并保留解释空间",
  claim: "以单一判断为视觉起点，用最少但充分的证据支撑"
})[page.pageRole] || "围绕一个管理问题建立唯一阅读起点和自然阅读路径";
const titleRoleFor = (page, index) => index === 0 && page.pageRole === "claim" ? "display" : page.pageRole === "claim" ? "section" : "content";
const titleRanges = { display: [136, 184], section: [104, 144], content: [72, 104], module: [40, 60] };
const preferredBreaks = (text) => [...new Set([...text].map((char, index) => "，、；：！？—".includes(char) ? index + 1 : 0).filter((index) => index > 2 && index < text.length - 2))];
const displayTitleFor = (answer) => {
  const clean = answer.replace(/[“”]/g, "").replace(/\s+/g, " ").trim();
  if ([...clean].length <= 24) return clean;
  const clauses = clean.split(/[，；。！？]/).map((item) => item.trim()).filter(Boolean);
  const first = (clauses[0] || clean).replace(/^(目前|当前)?(已经|已)/, "");
  if ([...first].length >= 7 && [...first].length <= 34) return first;
  const combined = `${first}，${clauses[1] || ""}`.replace(/，$/g, "");
  return [...combined].length <= 34 ? combined : first;
};
const densityMode = options.densityMode || (/演讲|路演|现场|分享/.test(rawText) ? "speaker-led" : "reading-first");

const scenes = plan.pageContracts.map((page, index) => {
  const atoms = page.atomRefs.map((ref) => atomById.get(ref)).filter(Boolean);
  const mustShow = atoms.filter((atom) => atom.materiality === "primary" || atom.kind === "numeric" || ["judgment", "action", "boundary"].includes(atom.kind)).map((atom) => atom.id);
  const expandableDetails = atoms.filter((atom) => !mustShow.includes(atom.id)).map((atom) => atom.id);
  const titleRole = titleRoleFor(page, index);
  const displayTitle = displayTitleFor(page.pageAnswer);
  return {
    id: page.id.replace(/^P/, "S"),
    managementQuestion: page.pageQuestion,
    sceneAnswer: page.pageAnswer,
    displayTitle,
    titleContract: {
      role: titleRole,
      maxLines: 2,
      minPx: titleRanges[titleRole][0],
      maxPx: titleRanges[titleRole][1],
      preferredBreaks: preferredBreaks(displayTitle),
      orphanMinChars: 3,
      letterSpacing: 0
    },
    relationTypes: relationTypes(page),
    atomRefs: page.atomRefs,
    sourceUnitRefs: unitRefs(page.atomRefs),
    mustShow,
    expandableDetails,
    risksAndBoundaries: atoms.filter((atom) => atom.kind === "boundary" || atom.kind === "judgment").map((atom) => atom.id),
    interactionOpportunities: interactionFor(page),
    compositionIntent: compositionFor(page),
    readingAxis: page.readingAxis,
    densityProfile: page.densityProfile,
    repeatReason: null
  };
});
const briefStatus = task.status === "needs-confirmation" || map.status === "needs-confirmation" || plan.status === "needs-confirmation"
  ? "needs-confirmation"
  : plan.status === "repair-required" ? "repair-required" : "planned";
const brief = {
  schemaVersion: "0.9.1",
  status: briefStatus,
  outputMode: "creative-html",
  narrativeSpine: plan.narrativeSpine,
  scenes,
  artDirection: {
    brandAnchors: ["Mint 标识", "中文优先字体层级", "原版方案 C 配色", "轻量来源样式"],
    visualMood: options.visualMood || "由 Codex 根据整份材料确定；专业、清晰、富有叙事张力",
    motionLanguage: options.motionLanguage || ["scene-reveal", "semantic-progress", "focus-shift"],
    densityRhythm: scenes.map((scene) => scene.densityProfile),
    palette: "mint-scheme-c-original",
    canvasMode: "dual-fixed-desktop-controlled-mobile",
    densityMode
  },
  hardBoundaries: ["不得新增原文没有的事实、数字、实体和正式结论", "mustShow 不得依赖交互才能看见", "PDF 必须展开必要详情"],
  blockingIssues: [...new Set([...(plan.blockingIssues || []), ...(map.unknowns || []).map((item) => `待确认主语：${item.text}`), ...(map.conflicts || []).map((item) => `来源冲突：${item.subject}`), ...(map.semanticGraph?.edges || []).filter((edge) => edge.needsReview || edge.confidence < 0.75).map((edge) => `低置信度关系待确认：${edge.id} ${edge.relationType}`)])]
};

const sceneByUnit = new Map();
for (const scene of scenes) for (const unitRef of scene.sourceUnitRefs) sceneByUnit.set(unitRef, scene);
const ledger = {
  schemaVersion: "0.9.1",
  sourceLockRef: "source-lock.json",
  contentMapRef: "content-map.json",
  creativeBriefRef: "creative-brief.json",
  entries: map.sourceUnits.map((unit) => {
    const atomRefs = map.contentAtoms.filter((atom) => atom.sourceUnitRefs.includes(unit.id)).map((atom) => atom.id);
    const scene = sceneByUnit.get(unit.id);
    const visible = scene ? atomRefs.some((ref) => scene.mustShow.includes(ref)) : false;
    const detail = scene ? atomRefs.some((ref) => scene.expandableDetails.includes(ref)) : false;
    return {
      sourceUnitRef: unit.id,
      atomRefs,
      sceneIds: scene ? [scene.id] : [],
      disposition: visible ? "formal-visible" : detail ? "html-detail" : "needs-confirmation",
      placements: { html: visible ? "visible" : detail ? "detail" : "none", pdf: scene ? "visible-or-expanded-detail" : "none", pptx: "not-requested" },
      rationale: scene ? `由 ${scene.id} 承接` : "尚未获得场景去向"
    };
  })
};
const unaccounted = ledger.entries.filter((entry) => entry.disposition === "needs-confirmation");
if (unaccounted.length) {
  brief.status = "needs-confirmation";
  brief.blockingIssues.push(`存在 ${unaccounted.length} 条原始信息尚无合法去向`);
}

fs.mkdirSync(output, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
write("task-card.json", task);
write("source-lock.json", { ...sourceLock, schemaVersion: "0.9.1" });
write("content-map.json", map);
write("creative-brief.json", brief);
write("source-ledger.json", ledger);
console.log(JSON.stringify({ status: brief.status, scenes: scenes.length, sourceUnits: sourceLock.unitCount, unaccounted: unaccounted.length, output }, null, 2));
process.exit(brief.status === "repair-required" ? 1 : 0);
