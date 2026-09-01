#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { compileSemanticGraph } from "./compile-semantic-graph.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const markers = JSON.parse(fs.readFileSync(path.join(root, "references/chinese-discourse-markers.json"), "utf8"));
const statusRegistry = JSON.parse(fs.readFileSync(path.join(root, "references/chinese-status-registry.json"), "utf8"));
const abbreviations = JSON.parse(fs.readFileSync(path.join(root, "references/entity-abbreviations.json"), "utf8"));
const arr = (value) => Array.isArray(value) ? value : [];
const includesAny = (text, values) => arr(values).some((value) => text.includes(value));
const startsAny = (text, values) => arr(values).some((value) => text.trim().startsWith(value));
const clean = (text) => String(text || "").replace(/^[-*+]\s+/, "").replace(/^(?:\(?\d+[）).、]|[一二三四五六七八九十]+、)\s*/, "").trim();
const sourceId = (name) => String(name || "input").replace(/[^\p{L}\p{N}_.-]+/gu, "-");
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export function splitSource(rawText, sourceName) {
  const lines = String(rawText || "").replace(/\r\n?/g, "\n").split("\n");
  const units = [];
  let section = "全文", sectionId = "S1", sectionIndex = 1, listIndex = 0, paragraph = 1;
  let assetId = null, assetSourcePath = null;
  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) { paragraph += 1; listIndex = 0; return; }
    const assetMarker = line.match(/^<!--\s*MINT_ASSET\s+id="([^"]+)"\s+path="([^"]+)"\s*-->$/);
    if (assetMarker) {
      assetId = assetMarker[1];
      assetSourcePath = assetMarker[2];
      section = `来源：${assetSourcePath}`;
      sectionId = `S${++sectionIndex}`;
      listIndex = 0;
      return;
    }
    // Chinese numbered sentences ending in normal prose punctuation are list
    // items, not headings. Treating them as headings silently lost the source.
    const heading = line.match(/^#{1,6}\s*(.+?)$/) || (!/[。！？；]$/.test(line) && line.match(/^[一二三四五六七八九十]+、(.+?)[：:]?$/));
    if (heading) {
      section = heading[1].trim();
      sectionId = `S${++sectionIndex}`;
      listIndex = 0;
      return;
    }
    const isBullet = /^[-*+]\s+/.test(line) || /^(?:\(?\d+[）).、]|[一二三四五六七八九十]+、)/.test(line);
    const normalized = clean(line);
    const segments = normalized
      .split(/(?<=[。！？；])\s*/u)
      .flatMap((item) => item.split(/，(?=(?:再|然后|随后|最后))/u))
      .map((item) => item.trim()).filter(Boolean);
    const group = isBullet && !startsAny(normalized, markers.sequence) ? `${sectionId}:LIST:${listIndex || 1}` : null;
    if (isBullet) listIndex = listIndex || 1;
    for (const [segmentIndex, segment] of segments.entries()) units.push({ text: segment, section, sectionId, paragraph, line: lineIndex + 1, segment: segmentIndex + 1, listGroup: group, assetId, assetSourcePath });
    if (!isBullet) listIndex = 0;
  });
  const source = sourceId(sourceName);
  return units.map((unit) => {
    const sourceKey = unit.assetId || source;
    const locator = `${sourceKey}#L${unit.line}:S${unit.segment}:P${unit.paragraph}:${unit.sectionId}`;
    const textHash = digest(unit.text);
    // Identity follows the source location, not the mutable text. Text changes are
    // tracked by textHash so annotations and Scene element IDs survive revisions.
    return { ...unit, id: `SU-${digest(locator).slice(0, 16)}`, textHash, sourceRef: `${unit.assetId ? "ASSET" : "SOURCE"}:${locator}` };
  });
}

export function buildSourceLock({ rawText, sourceName = "input", sourceUnits = splitSource(rawText, sourceName) }) {
  return {
    schemaVersion: "0.8",
    sourceId: sourceId(sourceName),
    rawDigest: digest(String(rawText || "").replace(/\r\n?/g, "\n")),
    unitCount: sourceUnits.length,
    unitIds: sourceUnits.map((unit) => unit.id),
    unitDigests: Object.fromEntries(sourceUnits.map((unit) => [unit.id, unit.textHash || digest(unit.text)])),
    immutable: true
  };
}

function inferStatus(text) {
  const matches = [];
  for (const [status, words] of Object.entries(statusRegistry)) if (includesAny(text, words)) matches.push(status);
  const priority = ["prohibited", "approved", "accepted", "launched", "operating", "completed", "applied", "planned", "unknown", "current"];
  return priority.find((status) => matches.includes(status)) || "current";
}

function inferModality(text, status) {
  if (status === "prohibited") return "confirmed";
  if (status === "planned") return /建议|探索|预计|拟/.test(text) ? "proposal" : "plan";
  if (status === "unknown") return "unknown";
  return "confirmed";
}

function explicitSubject(text) {
  const normalized = text.replace(/^[（(]?\d+[）).、]?\s*/, "");
  const match = normalized.match(/^(.{1,24}?)(?:已|会|将|需|应|拟|计划|预计|负责|支持|开放|覆盖|保留|形成|完成|抓取|识别|输出|调用|占|为|从|不再|不是)/);
  if (!match) return null;
  const subject = match[1].replace(/^(目前|当前|本轮|现阶段|下一阶段|过去|原来|此前)/, "").trim();
  return subject && !/^(这|它|其|该|上述|首先|其次|然后|随后|最后|因此|所以|同时|另外|此外)$/.test(subject) ? subject : null;
}

function inferRole(text, status, numericRefs) {
  if (status === "prohibited" || /边界|不开放|不得|不能/.test(text)) return "boundary";
  if (/(V1|V2|相比|而是|从.+扩展到)/i.test(text)) return "contrast";
  if (startsAny(text, markers.cause)) return "cause";
  if (startsAny(text, markers.effect) || /造成|导致|转化为/.test(text)) return "effect";
  if (status === "planned") return "action";
  if (numericRefs.length || ["completed", "approved", "accepted", "launched", "operating"].includes(status) || /原文|链接|证据|数据/.test(text)) return "evidence";
  if (includesAny(text, markers.actionVerbs)) return "action";
  return "claim";
}

function relationHint(previous, current) {
  if (!previous || previous.sectionId !== current.sectionId) return null;
  const text = current.text;
  if (/(V2|现在|目前|当前)/i.test(text) && /(V1|过去|原来|此前)/i.test(previous.text)) return "before-after";
  if (startsAny(text, markers.dependency)) return "dependency";
  if (startsAny(text, markers.sequence)) return "sequence";
  // Explicit progression may follow a repeated subject, not just start the sentence.
  // Require matching subjects and increasing markers; arbitrary embedded words are not steps.
  const ordinal = value => value.match(/^([^，。；：:]{1,24}?)(首先|其次|然后|随后|最后)(?=[\u3400-\u9fff])/);
  const before = ordinal(previous.text), after = ordinal(text);
  const order = { 首先: 0, 其次: 1, 然后: 2, 随后: 2, 最后: 3 };
  if (before && after && before[1] === after[1] && order[after[2]] > order[before[2]]) return "sequence";
  if (startsAny(text, markers.effect) || /造成|导致|从而/.test(text)) return "causal";
  if (startsAny(text, markers.contrast)) return "comparison";
  if (/^(?:前台|中台|后台|原始层|明细层|汇总层|战略层|执行层)[：:]/.test(text) && /^(?:前台|中台|后台|原始层|明细层|汇总层|战略层|执行层)[：:]/.test(previous.text)) return "hierarchy";
  if (/^(?:输入|处理|输出)[：:]/.test(text) && /^(?:输入|处理|输出)[：:]/.test(previous.text)) return "flow";
  if (/^(?:\d{4}年|第[一二三四五六七八九十]+阶段|初期|中期|后期)/.test(text) && /^(?:\d{4}年|第[一二三四五六七八九十]+阶段|初期|中期|后期)/.test(previous.text)) return "temporal";
  if (current.listGroup && previous.listGroup === current.listGroup) return "parallel";
  if (startsAny(text, markers.parallel)) return "parallel";
  return null;
}

function numericClaimsFor(unit, indexStart) {
  const claims = [];
  const pattern = /(?:^|[^A-Za-z])((?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?))\s*(%|个百分点|美元|万元|亿元|元|个页面|个区块|个|份|页|次|个月|月|年|天|小时|条|项)?/g;
  let match;
  while ((match = pattern.exec(unit.text))) {
    const before = unit.text.slice(Math.max(0, match.index - 1), match.index + match[0].indexOf(match[1]));
    if (/V$/i.test(before) || /^\d+[）).、]/.test(unit.text.slice(match.index))) continue;
    const value = Number(match[1].replaceAll(",", ""));
    const unitName = match[2] || "未提供";
    const context = unit.text;
    const role = /上限|不超过|不得超过/.test(context) ? "threshold" : /占|比例|%/.test(match[0]) ? "ratio" : /投入|成本|金额/.test(context) ? "actual" : "category-value";
    claims.push({
      id: `N${indexStart + claims.length}`,
      raw: `${match[1]}${match[2] || ""}`,
      value,
      unit: unitName,
      subject: explicitSubject(context) || unit.section,
      period: /当前|目前|本轮/.test(context) ? "当前" : "未提供",
      role,
      materiality: /占|投入|成本|上限|达到|完成|覆盖/.test(context) ? "primary" : "supporting",
      displayRequirement: /占|投入|成本|上限|达到|完成|覆盖/.test(context) ? "primary-visual" : "callout",
      sourceRef: unit.sourceRef,
      needsReview: unitName === "未提供"
    });
  }
  return claims;
}

function extractEntities(units) {
  const names = new Map();
  for (const unit of units) {
    const latin = unit.text.match(/\b[A-Z][A-Za-z0-9.+/-]*(?:\s+[A-Z][A-Za-z0-9.+/-]*)*\b/g) || [];
    const chinese = unit.text.match(/[\u4e00-\u9fffA-Za-z0-9]+(?:系统|知识库|团队|银行|公司|平台)/g) || [];
    for (const name of [...latin, ...chinese]) {
      const canonicalName = name.trim();
      if (!canonicalName || /^(V1|V2)$/i.test(canonicalName)) continue;
      if (!names.has(canonicalName)) names.set(canonicalName, unit.sourceRef);
    }
  }
  return [...names.entries()].map(([canonicalName, sourceRef], index) => ({
    id: `E${index + 1}`,
    canonicalName,
    aliases: [],
    firstUseLabel: abbreviations[canonicalName] ? `${canonicalName}（${abbreviations[canonicalName]}）` : canonicalName,
    sourceRef
  }));
}

export function compileChineseSource({ rawText, sourceName = "input", taskCard = null, communicationJob = {}, schemaVersion = "0.8" }) {
  const rawUnits = splitSource(rawText, sourceName);
  const sourceLock = buildSourceLock({ rawText, sourceName, sourceUnits: rawUnits });
  const unknowns = [], conflicts = [], discourseUnits = [], numericClaims = [];
  let previous = null, lastExplicitBySection = new Map();
  for (const raw of rawUnits) {
    const claims = numericClaimsFor(raw, numericClaims.length + 1);
    numericClaims.push(...claims);
    const explicit = explicitSubject(raw.text);
    const priorSubject = lastExplicitBySection.get(raw.sectionId) || null;
    const contextual = !explicit && !priorSubject && raw.section !== "全文" ? raw.section : null;
    const inherited = !explicit && priorSubject ? priorSubject : null;
    const subject = explicit || contextual || inherited || "待确认";
    const subjectResolution = explicit || contextual ? "explicit" : inherited ? "inherited" : "unknown";
    if (explicit || contextual) lastExplicitBySection.set(raw.sectionId, explicit || contextual);
    if (subjectResolution === "unknown") unknowns.push({ id: `U${unknowns.length + 1}`, field: "subject", text: raw.text, sourceRef: raw.sourceRef });
    const status = inferStatus(raw.text);
    const role = inferRole(raw.text, status, claims.map((claim) => claim.id));
    const unit = {
      ...raw,
      subject,
      subjectResolution,
      ...(subjectResolution === "inherited" ? { inheritedFrom: previous?.id || raw.sectionId } : {}),
      ...(subjectResolution === "unknown" ? { unknownRef: unknowns.at(-1).id } : {}),
      predicate: raw.text.replace(explicit || "", "").replace(/^[：:，,\s]+/, "") || raw.text,
      polarity: /不开放|不得|不能|尚未|未提供|未完成|未确认|未明确|未获得|未经|没有|不足|不再|无/.test(raw.text) ? "negative" : "affirmative",
      modality: inferModality(raw.text, status),
      status,
      role,
      relationToPrevious: "starts",
      numericClaimRefs: claims.map((claim) => claim.id)
    };
    unit.semanticRelationToPrevious = relationHint(previous, unit) || undefined;
    if (unit.semanticRelationToPrevious === "parallel") unit.relationToPrevious = "elaborates";
    if (unit.semanticRelationToPrevious === "sequence") unit.relationToPrevious = "sequences";
    if (unit.semanticRelationToPrevious === "causal") unit.relationToPrevious = "results-in";
    if (["comparison", "before-after"].includes(unit.semanticRelationToPrevious)) unit.relationToPrevious = "contrasts";
    discourseUnits.push(unit);
    previous = unit;
  }

  const statusBySubject = new Map();
  for (const unit of discourseUnits.filter((item) => item.subjectResolution !== "unknown")) {
    const prior = statusBySubject.get(unit.subject);
    if (prior && prior.status !== unit.status && new Set([prior.status, unit.status]).has("approved") && new Set([prior.status, unit.status]).has("planned")) {
      conflicts.push({ id: `C${conflicts.length + 1}`, subject: unit.subject, values: [prior.status, unit.status], sourceRefs: [prior.sourceRef, unit.sourceRef] });
    }
    statusBySubject.set(unit.subject, { status: unit.status, sourceRef: unit.sourceRef });
  }

  const contentAtoms = discourseUnits.map((unit, index) => {
    const kind = unit.role === "evidence" ? (unit.numericClaimRefs.length ? "numeric" : "evidence") : unit.role === "action" ? "action" : unit.role === "boundary" ? "boundary" : ["cause", "effect"].includes(unit.role) ? "judgment" : unit.role === "contrast" ? "relationship" : "fact";
    const assertionStatus = kind === "judgment" ? (unit.modality === "proposal" || unit.modality === "plan" ? "proposal" : unit.modality === "unknown" ? "hypothesis" : "formal") : undefined;
    return {
      id: `A${index + 1}`,
      kind,
      text: unit.text,
      originalText: unit.text,
      materiality: unit.section === "全文" && unit.subjectResolution === "unknown" ? "supporting" : "primary",
      displayRequirement: unit.numericClaimRefs.length ? "primary-visual" : ["judgment", "action", "boundary"].includes(kind) ? "callout" : "annotation",
      coverageStatus: "planned",
      discourseRefs: [unit.id],
      sourceUnitRefs: [unit.id],
      sourceRef: unit.sourceRef,
      editBoundary: taskCard?.fidelityMode === "faithful-reflow" ? "protected" : "editable",
      ...(unit.assetId ? { assetRef: unit.assetId } : {})
      ,...(assertionStatus ? { assertionStatus } : {})
    };
  });
  const entities = extractEntities(discourseUnits);
  const map = {
    schemaVersion,
    taskCardRef: "task-card.json",
    status: unknowns.length || conflicts.length || taskCard?.status === "needs-confirmation" ? "needs-confirmation" : "planned",
    communicationJob: {
      audience: communicationJob.audience || "待确认",
      purpose: communicationJob.purpose || "整理并说明原始材料",
      desiredOutcome: communicationJob.desiredOutcome || "待确认",
      managementTakeaway: communicationJob.managementTakeaway || "待页面规划后确定"
    },
    sourceSnapshot: { lockRef: "source-lock.json", rawDigest: sourceLock.rawDigest, unitCount: sourceLock.unitCount, unitIdsDigest: digest(sourceLock.unitIds.join("\n")) },
    sourceUnits: rawUnits.map(({ id, text, textHash, section, sectionId, paragraph, line, sourceRef, assetId, assetSourcePath }) => ({ id, text, textHash, section, sectionId, paragraph, line, sourceRef, assetId, assetSourcePath, immutable: true })),
    discourseUnits,
    contentAtoms,
    numericClaims,
    numbers: numericClaims.map((claim) => ({ id: claim.id, value: claim.value, unit: claim.unit, period: claim.period, subject: claim.subject, sourceRef: claim.sourceRef })),
    entities,
    relationships: [],
    facts: contentAtoms.filter((atom) => atom.kind === "fact" || atom.kind === "evidence").map((atom) => ({ id: `F-${atom.id}`, text: atom.text, sourceRef: atom.sourceRef })),
    actions: contentAtoms.filter((atom) => atom.kind === "action").map((atom) => ({ id: `ACT-${atom.id}`, action: atom.text, owner: "待确认", time: "待确认", expectedResult: "待确认", sourceRef: atom.sourceRef })),
    priorities: [],
    unknowns,
    conflicts,
    transformationLog: [],
    sourceLedger: rawUnits.map((unit) => ({
      sourceUnitRef: unit.id,
      atomRefs: contentAtoms.filter((atom) => atom.sourceUnitRefs.includes(unit.id)).map((atom) => atom.id),
      disposition: "needs-confirmation",
      placements: { html: "unplanned", pptx: "unplanned", pdf: "unplanned" },
      approvalRef: null,
      rationale: "等待页面规划确定正式去向"
    })),
    riskLevel: taskCard?.riskLevel || "ordinary",
    pageBudget: { requested: taskCard?.pageContract?.requested ?? null, minimum: 1, planned: taskCard?.pageContract?.requested ?? 1, constraint: taskCard?.pageContract?.constraint || "minimum-needed", overflowPolicy: taskCard?.pageContract?.overflowPolicy || "recompose" }
  };
  map.semanticGraph = compileSemanticGraph(map);
  const atomByDiscourse = new Map(map.contentAtoms.flatMap((atom) => atom.discourseRefs.map((ref) => [ref, atom])));
  map.claimGraph = map.semanticGraph.edges.filter((edge) => ["causal", "evidence", "dependency"].includes(edge.relationType)).map((edge) => ({
    id: `CG-${edge.id}`,
    relation: edge.relationType,
    from: [atomByDiscourse.get(edge.source.replace(/^DU:/, ""))?.id].filter(Boolean),
    to: [atomByDiscourse.get(edge.target.replace(/^DU:/, ""))?.id].filter(Boolean),
    sourceRefs: edge.evidenceRefs
  })).filter((edge) => edge.from.length && edge.to.length);
  map.relationships = map.semanticGraph.edges.map((edge) => ({ id: edge.id, type: edge.relationType, from: [edge.source], to: [edge.target], statement: `${edge.source} ${edge.relationType} ${edge.target}`, sourceRef: edge.evidenceRefs[0], confidence: edge.confidence }));
  if (map.semanticGraph.edges.some((edge) => edge.needsReview || edge.confidence < 0.75)) map.status = "needs-confirmation";
  return map;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = path.resolve(process.argv[2] || "");
  const outputFile = path.resolve(process.argv[3] || "content-map.json");
  const taskFile = process.argv[4] ? path.resolve(process.argv[4]) : null;
  if (!fs.existsSync(inputFile)) {
    console.error("Usage: node compile-chinese-source.mjs source.md content-map.json [task-card.json]");
    process.exit(2);
  }
  const taskCard = taskFile && fs.existsSync(taskFile) ? JSON.parse(fs.readFileSync(taskFile, "utf8")) : null;
  const rawText = fs.readFileSync(inputFile, "utf8");
  const map = compileChineseSource({ rawText, sourceName: path.basename(inputFile), taskCard });
  fs.writeFileSync(outputFile, `${JSON.stringify(map, null, 2)}\n`);
  const sourceLock = buildSourceLock({ rawText, sourceName: path.basename(inputFile), sourceUnits: map.sourceUnits });
  fs.writeFileSync(path.join(path.dirname(outputFile), "source-lock.json"), `${JSON.stringify(sourceLock, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, status: map.status, discourseUnits: map.discourseUnits.length, atoms: map.contentAtoms.length, numericClaims: map.numericClaims.length, edges: map.semanticGraph.edges.length, unknowns: map.unknowns.length, conflicts: map.conflicts.length, output: outputFile }, null, 2));
}
