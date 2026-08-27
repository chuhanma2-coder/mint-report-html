#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MATURITY = new Set(["complete-page", "structured-brief", "rough-notes", "theme-only", "mixed-sources"]);
const FIDELITY = new Set(["external-link-only", "verbatim-embed", "faithful-reflow", "editorial-synthesis"]);
const READ_MODES = new Set(["dual-use", "presentation", "reading"]);
const OUTPUT_MODES = new Set(["creative-html", "formal-multiformat"]);
const highRiskPattern = /监管|法规|法律|牌照|资本|股权|持股|信贷|授信|利率|费率|定价|处罚|客户政策|隐私|合规/i;

function inferMaturity(input) {
  if (MATURITY.has(input.inputMaturity)) return input.inputMaturity;
  const files = Array.isArray(input.files) ? input.files : [];
  const text = String(input.rawText || "").trim();
  if (files.length > 1 || (files.length && text)) return "mixed-sources";
  if (input.sourceKind === "html" || input.completePage === true || /<section\b|<article\b|class=["'][^"']*slide/.test(text)) return "complete-page";
  if (text.length <= 36 && !/[。；\n]/.test(text)) return "theme-only";
  const structuralSignals = (text.match(/(^|\n)\s*(?:[一二三四五六七八九十]+、|\(?\d+[）).、]|[-*]\s+)/g) || []).length;
  return structuralSignals >= 3 || text.length >= 500 ? "structured-brief" : "rough-notes";
}

export function classifyTask(input = {}) {
  const inputMaturity = inferMaturity(input);
  const fidelityMode = FIDELITY.has(input.fidelityMode)
    ? input.fidelityMode
    : inputMaturity === "complete-page" ? "faithful-reflow" : "editorial-synthesis";
  const readingMode = READ_MODES.has(input.readingMode) ? input.readingMode : "dual-use";
  const requested = Number.isInteger(input.requestedPages) && input.requestedPages > 0 ? input.requestedPages : null;
  const constraint = ["exact", "maximum", "flexible", "minimum-needed"].includes(input.pageConstraint)
    ? input.pageConstraint
    : requested ? "exact" : "minimum-needed";
  const riskLevel = highRiskPattern.test(`${input.rawText || ""}\n${(input.files || []).join("\n")}`) ? "confirm-first" : "ordinary";
  const explicitOutputs = Array.isArray(input.outputs) ? input.outputs : [];
  const formalSignal = input.strictAudit === true
    || input.crossOutputParity === true
    || explicitOutputs.includes("pptx")
    || requested !== null
    || ["exact", "maximum"].includes(input.pageConstraint);
  const outputMode = OUTPUT_MODES.has(input.outputMode)
    ? input.outputMode
    : formalSignal ? "formal-multiformat" : "creative-html";
  const protectedAtomRefs = Array.isArray(input.protectedAtomRefs) ? [...new Set(input.protectedAtomRefs)] : [];
  return {
    schemaVersion: "0.7",
    status: riskLevel === "confirm-first" && input.confirmed !== true ? "needs-confirmation" : "planned",
    inputMaturity,
    fidelityMode,
    readingMode,
    pageContract: {
      constraint,
      requested,
      overflowPolicy: ["exact", "maximum"].includes(constraint) ? "block" : "recompose"
    },
    outputMode,
    outputs: explicitOutputs.length
      ? [...new Set(explicitOutputs)]
      : outputMode === "creative-html" ? ["html", "pdf", "structure"] : ["html", "pdf", "pptx", "structure"],
    protectedAtomRefs,
    forbiddenChanges: ["不得新增原文没有的事实、数字、实体和正式结论", ...(input.forbiddenChanges || [])],
    riskLevel
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputFile = path.resolve(process.argv[2] || "");
  const outputFile = path.resolve(process.argv[3] || "task-card.json");
  if (!fs.existsSync(inputFile)) {
    console.error("Usage: node classify-task.mjs input.json task-card.json");
    process.exit(2);
  }
  const result = classifyTask(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
