#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const arr = (value) => Array.isArray(value) ? value : [];
const units = (value) => [...String(value || "")].reduce((sum, char) => sum + (/^[\x00-\xff]$/.test(char) ? 0.55 : 1), 0);
const compact = (value) => String(value || "").replace(/[\s，。；：、,.!?！？“”‘’"']/g, "");
const priority = ["causal", "before-after", "sequence", "temporal", "flow", "hierarchy", "comparison", "parallel", "none"];

function breakTitle(text) {
  const source = String(text || "未命名页面").replace(/[。；]$/, "");
  if (units(source) <= 22) return [source];
  if (units(source) > 56) {
    const firstClause = source.split(/[，；。]/).map((part) => part.trim()).find((part) => units(part) >= 6 && units(part) <= 36);
    if (firstClause) return [firstClause];
  }
  const boundaries = [...source.matchAll(/[，；：、]/g)].map((match) => match.index + 1).filter((index) => index >= 8 && index <= 24);
  const cut = boundaries.sort((a, b) => Math.abs(a - 18) - Math.abs(b - 18))[0] || Math.min(22, source.length);
  const lines = [source.slice(0, cut), source.slice(cut)].filter(Boolean);
  if (lines.length > 2 || lines.some((line) => units(line) > 28)) {
    const firstClause = source.split(/[，；。]/).map((part) => part.trim()).find((part) => units(part) >= 6 && units(part) <= 36);
    return firstClause ? [firstClause] : [source];
  }
  return lines;
}

function classifyGroup(group, graph) {
  const ids = new Set(group.units.map((unit) => `DU:${unit.id}`));
  const relations = arr(graph.edges).filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => edge.relationType);
  const primaryRelation = priority.find((name) => relations.includes(name)) || (group.units.length > 1 ? "parallel" : "none");
  const text = group.units.map((unit) => unit.text).join(" ");
  const leadText = group.units[0]?.text || "";
  const hasNumbers = group.units.some((unit) => unit.numericClaimRefs?.length);
  const riskSignal = /风险(?!能力)|问题|成本|处罚|冲突|不足|过宽/.test(text);
  const pageRole = ["hierarchy","composition","flow"].includes(primaryRelation) ? "mechanism"
    : ["sequence","temporal"].includes(primaryRelation) ? "action"
    : primaryRelation === "causal" && riskSignal ? "risk"
    : /下一阶段|下一步|建议|计划|封装|提交|推动/.test(text) ? "action"
    : primaryRelation === "before-after" || primaryRelation === "comparison" ? "contrast"
    : hasNumbers ? "evidence"
    : /风险(?!能力)|问题|处罚|冲突|不足|过宽/.test(leadText) ? "risk" : "claim";
  return { primaryRelation, pageRole };
}

function groupSource(map) {
  const sourceById = new Map(arr(map.sourceUnits).map((item) => [item.id, item]));
  const groups = new Map();
  for (const unit of arr(map.discourseUnits)) {
    const source = sourceById.get(unit.id) || unit;
    const key = `${unit.sectionId || source.sectionId || "S1"}:${source.paragraph || 1}`;
    if (!groups.has(key)) groups.set(key, { key, sectionId: unit.sectionId || source.sectionId || "S1", section: unit.section || source.section || "材料", units: [] });
    groups.get(key).units.push(unit);
  }
  return [...groups.values()].filter((group) => group.units.length);
}

function partition(groups, count) {
  if (count <= 1) return [{ key: "MERGED:1", sectionId: groups[0]?.sectionId || "S1", section: groups[0]?.section || "材料", units: groups.flatMap((group) => group.units) }];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * groups.length / count), end = Math.floor((index + 1) * groups.length / count);
    const slice = groups.slice(start, Math.max(start + 1, end));
    return { key: `MERGED:${index + 1}`, sectionId: slice[0]?.sectionId || "S1", section: slice[0]?.section || "材料", units: slice.flatMap((group) => group.units) };
  });
}

function managementQuestion(role) {
  return ({ risk: "当前最需要管理层关注什么风险？", action: "下一步要推动什么？", contrast: "相比原方案发生了什么变化？", evidence: "哪些事实和数字说明当前进展？", claim: "这一部分最重要的结论是什么？" })[role] || "这一页需要回答什么？";
}

export function planDeck(task, map) {
  const started = performance.now();
  const blockingIssues = [], capacityConflicts = [];
  let groups = groupSource(map);
  const maxUnits = task.readingMode === "reading" ? 760 : task.readingMode === "presentation" ? 360 : 520;
  const requested = task.pageContract?.requested;
  if (task.pageContract?.constraint === "exact" && requested) groups = partition(groups, requested);
  else {
    groups = groups.flatMap((group) => {
      if (units(group.units.map((unit) => unit.text).join("")) <= maxUnits) return [group];
      const midpoint = Math.ceil(group.units.length / 2);
      return [
        { ...group, key: `${group.key}:A`, units: group.units.slice(0, midpoint) },
        { ...group, key: `${group.key}:B`, units: group.units.slice(midpoint) }
      ].filter((item) => item.units.length);
    });
  }
  for (const group of groups) {
    const size = units(group.units.map((unit) => unit.text).join(""));
    if (size > maxUnits) {
      const conflict = { pageGroup: group.key, requiredUnits: Math.round(size), capacityUnits: maxUnits, sourceUnitRefs: group.units.map((unit) => unit.id), allowedResolutions: ["增加页数", "切换阅读模式", "将非核心细节放入HTML详情或PPTX备注"], requiresUserApproval: true };
      capacityConflicts.push(conflict);
      blockingIssues.push(`页面 ${group.key} 内容容量 ${Math.round(size)} 超过 ${maxUnits}；不得自动删除、缩小信息全集或绕过合同`);
    }
  }

  const atomByDiscourse = new Map();
  for (const atom of arr(map.contentAtoms)) for (const ref of arr(atom.discourseRefs)) atomByDiscourse.set(ref, atom);
  const pageContracts = groups.map((group, index) => {
    const { primaryRelation, pageRole } = classifyGroup(group, map.semanticGraph || {});
    const atoms = group.units.map((unit) => atomByDiscourse.get(unit.id)).filter(Boolean);
    const atomRefs = [...new Set(atoms.map((atom) => atom.id))];
    const numericRefs = [...new Set(group.units.flatMap((unit) => arr(unit.numericClaimRefs)))];
    const answerAtom = pageRole === "risk" ? atoms.find((atom) => atom.kind === "judgment") : null;
    const answer = answerAtom?.text || atoms[0]?.text || group.units[0]?.text || group.section;
    const relationEdges = arr(map.semanticGraph?.edges).filter((edge) => {
      const ids = new Set(group.units.map((unit) => `DU:${unit.id}`));
      return ids.has(edge.source) && ids.has(edge.target);
    });
    const relationGraphRefs = relationEdges.map((edge) => edge.id);
    const primaryRelationEdge = relationEdges.find((edge) => edge.relationType === primaryRelation) || null;
    const evidenceAtoms = atoms.filter((atom) => ["numeric", "evidence", "fact"].includes(atom.kind));
    const dataShape = ["sequence", "flow", "dependency"].includes(primaryRelation) ? "ordered-actions"
      : primaryRelation === "temporal" ? "milestones"
      : primaryRelation === "parallel" ? "independent-items"
      : ["before-after", "comparison"].includes(primaryRelation) ? "paired-objects"
      : ["causal", "problem-cause-solution"].includes(primaryRelation) ? "causal-claims"
      : ["hierarchy", "composition"].includes(primaryRelation) ? "hierarchy"
      : numericRefs.length ? "numeric" : "text";
    const visualNodeCount = pageRole === "risk" ? 3
      : primaryRelation === "before-after" ? 2
      : dataShape === "numeric" ? Math.max(1, numericRefs.length)
      : group.units.length;
    const titleLines = breakTitle(answer);
    return {
      id: `P${index + 1}`,
      sectionId: group.sectionId,
      sectionTitle: group.section,
      actionTitle: titleLines.join(""),
      titleLines,
      pageQuestion: managementQuestion(pageRole),
      pageAnswer: answer,
      pageRole,
      proofObject: {
        kind: numericRefs.length ? "numeric-evidence" : primaryRelation === "evidence" ? "source-backed-claim" : "semantic-relationship",
        primaryAtomRef: atomRefs[0],
        atomRefs,
        evidenceRefs: numericRefs.length ? numericRefs : [evidenceAtoms[0]?.id || atomRefs[0]].filter(Boolean),
        description: `以${primaryRelation}关系承接本页原始信息`,
        dataShape
      },
      visualNodeCount,
      atomRefs,
      relationGraphRefs,
      primaryRelationRef: primaryRelationEdge?.id || null,
      primaryRelation,
      readingAxis: ["sequence", "flow", "before-after", "temporal"].includes(primaryRelation) ? "left-to-right" : "top-to-bottom",
      contentOrder: ["title", "page-answer", "proof-object", ...(pageRole === "action" ? ["action"] : [])],
      focalAnchor: "proof-object",
      densityProfile: units(group.units.map((unit) => unit.text).join("")) > maxUnits * 0.72 ? "compact" : group.units.length <= 2 ? "focused" : "balanced",
      transitionFromPrevious: index === 0 ? null : { fromPageId: `P${index}`, bridge: `从${groups[index - 1].section}进入${group.section}` },
      pageNecessity: { type: index === 0 ? "opening" : "independent-decision", reason: `承接独立原文段落 ${group.key}`, removalTest: { losesPrimaryEvidence: true, breaksDecisionChain: pageRole === "action", exceedsCapacityElsewhere: false } }
    };
  });

  const sectionMap = new Map();
  for (const page of pageContracts) {
    if (!sectionMap.has(page.sectionId)) sectionMap.set(page.sectionId, { id: page.sectionId, title: page.sectionTitle, introFamily: "mint-section-intro-v07", pageIds: [] });
    sectionMap.get(page.sectionId).pageIds.push(page.id);
  }
  const duplicationMap = [];
  for (let i = 0; i < pageContracts.length; i += 1) for (let j = i + 1; j < pageContracts.length; j += 1) {
    const overlap = pageContracts[i].atomRefs.filter((ref) => pageContracts[j].atomRefs.includes(ref));
    const sameAnswer = compact(pageContracts[i].pageAnswer) === compact(pageContracts[j].pageAnswer);
    if (overlap.length || sameAnswer) duplicationMap.push({ pages: [pageContracts[i].id, pageContracts[j].id], atomRefs: overlap, sameAnswer, status: "must-restructure" });
  }
  if (duplicationMap.length) blockingIssues.push("跨页存在重复主要信息");
  if (pageContracts.some((page) => !page.atomRefs.length)) blockingIssues.push("存在空内容页");
  const elapsedMs = Number((performance.now() - started).toFixed(2));
  return {
    schemaVersion: map.schemaVersion === "0.8" ? "0.8" : "0.7",
    status: capacityConflicts.length ? "needs-confirmation" : blockingIssues.length ? "repair-required" : map.status === "needs-confirmation" || task.status === "needs-confirmation" ? "needs-confirmation" : "planned",
    communicationJob: map.communicationJob,
    narrativeSpine: pageContracts.map((page) => page.pageRole),
    pageBudget: { requested: requested ?? null, minimum: 1, planned: pageContracts.length, constraint: task.pageContract?.constraint || "minimum-needed", overflowPolicy: task.pageContract?.overflowPolicy || "recompose", reason: pageContracts.length > 1 ? "不同页面分别回答独立管理问题，并由页面必要性合同约束" : "单页即可承接当前命题" },
    sectionIntroFamily: "mint-section-intro-v07",
    sections: [...sectionMap.values()],
    pageContracts,
    duplicationMap,
    capacityConflicts,
    blockingIssues,
    metrics: { sourceGroups: groupSource(map).length, pages: pageContracts.length, elapsedMs }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const taskFile = path.resolve(process.argv[2] || ""), mapFile = path.resolve(process.argv[3] || ""), outputFile = path.resolve(process.argv[4] || "deck-plan.json"), mapOutput = process.argv[5] ? path.resolve(process.argv[5]) : null;
  if (![taskFile, mapFile].every((file) => fs.existsSync(file))) {
    console.error("Usage: node plan-deck.mjs task-card.json content-map.json deck-plan.json [content-map.planned.json]");
    process.exit(2);
  }
  const task = JSON.parse(fs.readFileSync(taskFile, "utf8")), map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const plan = planDeck(task, map);
  fs.writeFileSync(outputFile, `${JSON.stringify(plan, null, 2)}\n`);
  if (mapOutput) {
    const ghostDeck = plan.pageContracts.map((page) => ({ pageId: page.id, actionTitle: page.actionTitle, pageRole: page.pageRole, managementQuestion: page.pageQuestion, answer: page.pageAnswer, atomRefs: page.atomRefs, evidenceRefs: page.proofObject.evidenceRefs, relationshipRefs: page.relationGraphRefs, transitionFromPrevious: page.transitionFromPrevious || { fromPageId: null, bridge: "开篇直接回答管理问题" }, pageNecessity: page.pageNecessity }));
    const narrativeCommitment = { audienceShift: map.communicationJob?.desiredOutcome || "形成清晰判断", coreThesis: plan.pageContracts[0]?.pageAnswer || "待确认", decision: map.communicationJob?.desiredOutcome || "待确认", mustShowAtomRefs: arr(map.contentAtoms).filter((atom) => atom.materiality === "primary").map((atom) => atom.id), mustNotInfer: ["原文未提供的事实、数字、实体和结论"], narrativeSpine: plan.narrativeSpine, deEmphasizeAtomRefs: [], pageBudgetPriority: plan.pageBudget.constraint };
    fs.writeFileSync(mapOutput, `${JSON.stringify({ ...map, status: plan.status, pageBudget: plan.pageBudget, narrativeCommitment, ghostDeck }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ passed: plan.status !== "repair-required", status: plan.status, pages: plan.pageContracts.length, elapsedMs: plan.metrics.elapsedMs, output: outputFile }, null, 2));
  process.exit(plan.status === "repair-required" ? 1 : 0);
}
