#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const skillRoot = process.env.CODEX_HOME
  ? path.join(process.env.CODEX_HOME, "skills")
  : path.join(os.homedir(), ".codex", "skills");

const entries = fs.existsSync(skillRoot)
  ? fs.readdirSync(skillRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name)
  : [];
const html = entries.filter(name => name === "mint-report-html");
const deck = entries.filter(name => name === "mint-report-deck");
const backups = entries.filter(name => /^mint-report-(?:html|deck).*(?:backup|archive|old)/i.test(name));
const issues = [];
if (html.length !== 1) issues.push(`Expected exactly one active mint-report-html, found ${html.length}`);
if (deck.length) issues.push("mint-report-deck is active; HTML-only users should move it outside the active skills directory");
if (backups.length) issues.push(`Historical Mint skills are still active: ${backups.join(", ")}`);

const report = {
  passed: issues.length === 0,
  platform: process.platform,
  skillRoot,
  active: { html, deck, backups },
  issues,
  archivePolicy: "Move inactive skills to any user-chosen directory outside skillRoot; no external drive is required."
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
