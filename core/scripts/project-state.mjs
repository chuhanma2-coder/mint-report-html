#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.10.0-rc.1";
const STATES = new Set(["exploring", "soft-frozen", "frozen"]);
const PROFILES = new Set(["review", "revision", "publish"]);
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const arr = (value) => Array.isArray(value) ? value : [];

export function structureHash(sceneOrder, clusters = []) {
  return digest(JSON.stringify({ sceneOrder, clusters: clusters.map((item) => ({ clusterId: item.clusterId, sourceUnitRefs: arr(item.sourceUnitRefs) })) }));
}

export function createProjectState({ prior = null, sourceSetHash, sceneOrder, clusters = [], artDirectionHash = "", requestedProfile = "review", structuralChange = false, contentChange = false, affectedSceneIds = [], openIssues = [] }) {
  if (!PROFILES.has(requestedProfile)) throw new Error(`invalid qaProfile: ${requestedProfile}`);
  const nextStructureHash = structureHash(sceneOrder, clusters);
  const sourceChanged = Boolean(prior && prior.sourceSetHash && prior.sourceSetHash !== sourceSetHash);
  let structureState = prior?.structureState && STATES.has(prior.structureState) ? prior.structureState : "exploring";
  if (sourceChanged) structureState = "exploring";
  else if (structuralChange && structureState === "frozen") structureState = "soft-frozen";
  else if (!prior && sceneOrder.length) structureState = "exploring";
  const qaProfile = requestedProfile;
  const currentIssues = [...new Set(openIssues)];
  if (qaProfile === "publish" && structureState !== "frozen") currentIssues.push("publish-blocked: structureState must be frozen");
  return {
    schemaVersion: VERSION,
    currentVersion: VERSION,
    structureState,
    qaProfile,
    sourceSetHash,
    structureHash: nextStructureHash,
    artDirectionHash,
    currentSceneOrder: sceneOrder,
    affectedSceneIds: structuralChange ? sceneOrder : contentChange || sourceChanged ? affectedSceneIds : [],
    pdfState: prior ? (structuralChange || sourceChanged || contentChange ? "stale" : prior.pdfState || "stale") : "stale",
    openIssues: currentIssues,
    lastCompletedAction: "creative-plan-prepared",
    pendingActions: qaProfile === "publish" && structureState !== "frozen" ? ["confirm-structure"] : ["author-or-update-affected-scenes"],
    updatedAt: new Date().toISOString()
  };
}

export function transitionProjectState(state, action, payload = {}) {
  const next = structuredClone(state);
  if (action === "soft-freeze") {
    if (!next.currentSceneOrder?.length) throw new Error("cannot soft-freeze without scenes");
    next.structureState = "soft-frozen";
  } else if (action === "freeze") {
    if (arr(next.openIssues).length) throw new Error("cannot freeze while openIssues remain");
    next.structureState = "frozen";
  } else if (action === "structure-change") {
    next.structureState = next.structureState === "frozen" ? "soft-frozen" : "exploring";
    next.affectedSceneIds = payload.affectedSceneIds || next.currentSceneOrder;
    next.pdfState = "stale";
  } else if (action === "content-change") {
    next.affectedSceneIds = payload.affectedSceneIds || [];
    next.pdfState = "stale";
  } else if (action === "set-profile") {
    if (!PROFILES.has(payload.qaProfile)) throw new Error(`invalid qaProfile: ${payload.qaProfile}`);
    if (payload.qaProfile === "publish" && next.structureState !== "frozen") throw new Error("publish requires structureState=frozen");
    next.qaProfile = payload.qaProfile;
  } else if (action === "mark-pdf-current") {
    next.pdfState = "current";
  } else if (action === "resolve-issues") {
    const resolved = new Set(arr(payload.issues));
    next.openIssues = arr(next.openIssues).filter((issue) => !resolved.has(issue));
  } else throw new Error(`unknown project-state action: ${action}`);
  next.lastCompletedAction = action;
  next.updatedAt = new Date().toISOString();
  return next;
}

export function sessionBrief(state) {
  return `# Mint Report session brief\n\n- Version: ${state.currentVersion}\n- Structure: ${state.structureState}\n- QA profile: ${state.qaProfile}\n- PDF: ${state.pdfState}\n- Scene order: ${arr(state.currentSceneOrder).join(", ") || "none"}\n- Affected scenes: ${arr(state.affectedSceneIds).join(", ") || "none"}\n- Open issues: ${arr(state.openIssues).join("; ") || "none"}\n- Last completed: ${state.lastCompletedAction || "none"}\n- Pending: ${arr(state.pendingActions).join("; ") || "none"}\n\nDo not redo normalized assets or unaffected scenes. JSON state is authoritative.\n`;
}

function runCli() {
  const stateFile = path.resolve(process.argv[2] || "project-state.json");
  const action = process.argv[3];
  if (!fs.existsSync(stateFile) || !action) {
    console.error("Usage: node project-state.mjs project-state.json <soft-freeze|freeze|structure-change|content-change|set-profile|mark-pdf-current> [payload.json]");
    process.exit(2);
  }
  const payloadFile = process.argv[4] ? path.resolve(process.argv[4]) : null;
  const payload = payloadFile && fs.existsSync(payloadFile) ? JSON.parse(fs.readFileSync(payloadFile, "utf8")) : {};
  const next = transitionProjectState(JSON.parse(fs.readFileSync(stateFile, "utf8")), action, payload);
  fs.writeFileSync(stateFile, `${JSON.stringify(next, null, 2)}\n`);
  fs.writeFileSync(path.join(path.dirname(stateFile), "session-brief.md"), sessionBrief(next));
  console.log(JSON.stringify({ passed: true, structureState: next.structureState, qaProfile: next.qaProfile, pdfState: next.pdfState }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
