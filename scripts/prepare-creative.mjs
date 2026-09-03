#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { classifyTask } from "../core/scripts/classify-task.mjs";
import { buildSourceLock, compileChineseSource } from "../core/scripts/compile-chinese-source.mjs";
import { planDeck } from "../core/scripts/plan-deck.mjs";
import { createProjectState, sessionBrief } from "../core/scripts/project-state.mjs";
import { normalizeAssets } from "./normalize-assets.mjs";
import { syncSceneProject } from "./scene-project.mjs";
import { writeReportModel } from "./report-model.mjs";
import { selectRoutes } from "./select-data-expression.mjs";

const source = path.resolve(process.argv[2] || "");
const output = path.resolve(process.argv[3] || "creative-output");
const optionsFile = process.argv[4] ? path.resolve(process.argv[4]) : null;
if (!fs.existsSync(source)) {
  console.error("Usage: node prepare-creative.mjs source.md output-dir [options.json]");
  process.exit(2);
}

const options = optionsFile && fs.existsSync(optionsFile) ? JSON.parse(fs.readFileSync(optionsFile, "utf8")) : {};
const priorStateFile = path.join(output, "project-state.json");
const priorClustersFile = path.join(output, "management-clusters.json");
const priorState = fs.existsSync(priorStateFile) ? JSON.parse(fs.readFileSync(priorStateFile, "utf8")) : null;
const priorClusters = fs.existsSync(priorClustersFile) ? JSON.parse(fs.readFileSync(priorClustersFile, "utf8")).clusters || [] : [];
const priorMapFile = path.join(output, "content-map.json");
const priorMap = fs.existsSync(priorMapFile) ? JSON.parse(fs.readFileSync(priorMapFile, "utf8")) : null;
const normalization = normalizeAssets(source, output);
const rawText = normalization.combinedText;
const task = {
  ...classifyTask({ ...options, rawText, outputMode: "creative-html", outputs: options.outputs || ["html", "pdf", "structure"] }),
  schemaVersion: "0.9.3"
};
const map = compileChineseSource({
  rawText,
  sourceName: path.basename(normalization.normalizedSource),
  taskCard: task,
  communicationJob: options.communicationJob || {},
  schemaVersion: "0.9.3"
});
const sourceLock = buildSourceLock({ rawText, sourceName: path.basename(normalization.normalizedSource), sourceUnits: map.sourceUnits });
const refsByAsset = new Map();
for (const unit of map.sourceUnits) if (unit.assetId) refsByAsset.set(unit.assetId, [...new Set([...(refsByAsset.get(unit.assetId) || []), unit.id])]);
for (const asset of normalization.manifest.assets) asset.sourceUnitRefs = refsByAsset.get(asset.assetId) || [];
fs.writeFileSync(path.join(output, "asset-manifest.json"), `${JSON.stringify(normalization.manifest, null, 2)}\n`);
const plan = planDeck(task, map, { previousClusters: priorClusters });
const atomById = new Map(map.contentAtoms.map((atom) => [atom.id, atom]));
const unitRefs = (atomRefs) => [...new Set(atomRefs.flatMap((ref) => atomById.get(ref)?.sourceUnitRefs || []))];
const relationTypes = (page) => [...new Set([
  page.primaryRelation,
  ...page.relationGraphRefs.map((ref) => map.relationships.find((relation) => relation.id === ref)?.type)
].filter(Boolean))];
const interactionFor = (page) => {
  const result = [];
  if (page.proofObject?.dataShape === "numeric") result.push("查看关键数字的原始口径与已提供公式；不依靠点击隐藏结论");
  if (["paired-objects", "independent-items"].includes(page.proofObject?.dataShape)) result.push("聚焦一个对象，查看其对应证据；并列对象不新增方向连线");
  if (["milestones", "ordered-actions"].includes(page.proofObject?.dataShape)) result.push("按原文已明确的阶段顺序讲解当前重点，完整步骤默认可见");
  if (page.atomRefs.length > 4) result.push("按需展开支持细节以核对来源，关键事实始终可见");
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
const titleRoleFor = (page) => ["balanced", "compact"].includes(page.densityProfile) ? "module" : "content";
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
    id: page.id,
    decisionKey: page.decisionKey,
    sectionPageBudget: page.sectionPageBudget,
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
    consolidationContract: page.consolidationContract,
    repeatReason: null
  };
});
const numericById = new Map((map.numericClaims || []).map(claim => [claim.id, claim]));
const discourseById = new Map((map.discourseUnits || []).map(unit => [unit.id, unit]));
const routeContextFor = scene => {
  const discourse = scene.sourceUnitRefs.map(ref => discourseById.get(ref)).filter(Boolean);
  const claims = [...new Set(discourse.flatMap(unit => unit.numericClaimRefs || []))].map(ref => numericById.get(ref)).filter(Boolean);
  const periods = [...new Set([
    ...claims.map(claim => claim.period).filter(period => period && period !== "未提供"),
    ...discourse.flatMap(unit => unit.text.match(/Y\d+|20\d{2}年?|H[12]|Q[1-4]|上半年|下半年|第[一二三四\d]+季度|当前|目前|本轮/gi) || [])
  ])];
  return {
    relationTypes: scene.relationTypes,
    decisionIntent: `${scene.managementQuestion} ${scene.sceneAnswer}`,
    metrics: [...new Set(claims.map(claim => claim.subject).filter(Boolean))],
    categories: [...new Set(discourse.map(unit => unit.subject).filter(subject => subject && subject !== "待确认"))],
    periods,
    values: claims.map(claim => claim.value),
    units: [...new Set(claims.map(claim => claim.unit).filter(unit => unit && unit !== "未提供"))],
    containsNegative: claims.some(claim => claim.value < 0),
    crossesZero: claims.some(claim => claim.value < 0) && claims.some(claim => claim.value >= 0)
  };
};
const briefStatus = task.status === "needs-confirmation" || map.status === "needs-confirmation" || plan.status === "needs-confirmation"
  ? "needs-confirmation"
  : plan.status === "repair-required" ? "repair-required" : "planned";
const brief = {
  schemaVersion: "0.9.3",
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
    canvasMode: "fixed-desktop-print",
    densityMode
  },
  hardBoundaries: ["不得新增原文没有的事实、数字、实体和正式结论", "mustShow 不得依赖交互才能看见", "PDF 必须展开必要详情"],
  blockingIssues: [...new Set([...(plan.blockingIssues || []), ...(map.unknowns || []).map((item) => `待确认主语：${item.text}`), ...(map.conflicts || []).map((item) => `来源冲突：${item.subject}`), ...(map.semanticGraph?.edges || []).filter((edge) => edge.needsReview || edge.confidence < 0.75).map((edge) => `低置信度关系待确认：${edge.id} ${edge.relationType}`)])]
};
for (const asset of normalization.manifest.assets.filter((item) => item.status === "needs-asset-review")) brief.blockingIssues.push(`素材 ${asset.sourcePath} 需要确认：${asset.warnings.join("；")}`);
if (!scenes.length) brief.blockingIssues.push("标准化素材中没有可编译的文本；不得生成空报告");
const sceneReviewThreshold = Number(options.sceneReviewThreshold ?? 8);
if (scenes.length > sceneReviewThreshold && options.scenePlanConfirmed !== true) brief.blockingIssues.push(`候选 Scene 为 ${scenes.length} 个，超过 ${sceneReviewThreshold} 个；先确认管理问题与 Scene 目录，再进行视觉制作`);
if (brief.blockingIssues.length && brief.status === "planned") brief.status = "needs-confirmation";

const sceneByUnit = new Map();
for (const scene of scenes) for (const unitRef of scene.sourceUnitRefs) sceneByUnit.set(unitRef, scene);
const ledger = {
  schemaVersion: "0.9.3",
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
write("source-lock.json", { ...sourceLock, schemaVersion: "0.9.3", assetManifestRef: "asset-manifest.json", sourceSetHash: normalization.manifest.sourceSetHash });
write("content-map.json", map);
write("creative-brief.json", brief);
write("source-ledger.json", ledger);
writeReportModel(output);
write("management-clusters.json", { schemaVersion: "0.9.3", clusters: plan.managementClusters, decisions: plan.clusteringDecisions });
write("expression-routes.json", { schemaVersion: "0.13.0", scenes: Object.fromEntries(scenes.map((scene) => [scene.id, selectRoutes(routeContextFor(scene))])) });
const oldOrder = priorState?.currentSceneOrder || [];
const currentOrder = scenes.map((scene) => scene.id);
const structuralChange = Boolean(priorState && JSON.stringify(oldOrder) !== JSON.stringify(currentOrder));
const priorUnitHashes = new Map((priorMap?.sourceUnits || []).map((unit) => [unit.id, unit.textHash]));
const currentUnitHashes = new Map(map.sourceUnits.map((unit) => [unit.id, unit.textHash]));
const changedUnits = new Set([...new Set([...priorUnitHashes.keys(), ...currentUnitHashes.keys()])].filter((id) => priorUnitHashes.get(id) !== currentUnitHashes.get(id)));
const contentChange = Boolean(priorState && changedUnits.size);
let affectedSceneIds = scenes.filter((scene) => scene.sourceUnitRefs.some((ref) => changedUnits.has(ref))).map((scene) => scene.id);
if (contentChange && !affectedSceneIds.length) affectedSceneIds = currentOrder;
const projectState = createProjectState({ prior: priorState, sourceSetHash: normalization.manifest.sourceSetHash, sceneOrder: currentOrder, clusters: plan.managementClusters, artDirectionHash: sourceLock.rawDigest, requestedProfile: options.qaProfile || (priorState ? "revision" : "review"), structuralChange, contentChange, affectedSceneIds, openIssues: brief.blockingIssues });
projectState.rawDigest = sourceLock.rawDigest;
projectState.affectedSceneIds = structuralChange || !priorState ? currentOrder : affectedSceneIds;
write("project-state.json", projectState);
fs.writeFileSync(path.join(output, "session-brief.md"), sessionBrief(projectState));
write("build-manifest.json", { schemaVersion: "0.9.4", sourceSetHash: normalization.manifest.sourceSetHash, structureHash: projectState.structureHash, currentSceneOrder: currentOrder, affectedSceneIds: projectState.affectedSceneIds, executionBudget: { sceneReviewThreshold, scenePlanConfirmed: options.scenePlanConfirmed === true, defaultReviewOutputs: ["html"], publishOutputs: ["html", "pdf"] }, assets: normalization.manifest.assets.map((asset) => ({ assetId: asset.assetId, sourceHash: asset.sourceHash, contentHash: asset.contentHash, cacheHit: asset.cacheHit })), outputs: { html: "pending", previewPdf: "not-requested", formalPdf: "pending" }, generatedAt: new Date().toISOString() });
const sceneProject = syncSceneProject(output);
console.log(JSON.stringify({ status: brief.status, structureState: projectState.structureState, qaProfile: projectState.qaProfile, scenes: scenes.length, sourceUnits: sourceLock.unitCount, assets: normalization.manifest.assets.length, cacheHits: normalization.manifest.metrics.cacheHits, createdSceneFiles: sceneProject.created.length, unaccounted: unaccounted.length, output }, null, 2));
process.exit(brief.status === "repair-required" ? 1 : 0);
