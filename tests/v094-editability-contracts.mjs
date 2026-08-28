#!/usr/bin/env node
import assert from "node:assert/strict";
import { auditTextFieldContracts, allowedEditReasons } from "../scripts/html-field-contract.mjs";

const attrs = 'data-element-id="title" data-content-id="A1" data-field-path="scenes.MC-1.title" data-edit-policy="editable" data-qa-role="text" data-qa-overlap="forbid"';
let audit = auditTextFieldContracts(`<section><div class="card">没有编辑合同</div><h2 ${attrs}>可编辑标题</h2></section>`);
assert.equal(audit.total, 2);
assert.equal(audit.uncovered.length, 1, "漏标的卡片文字必须进入覆盖率分母");
assert.equal(audit.coverage, 0.5);

audit = auditTextFieldContracts(`<span data-element-id="page" data-content-id="system-page" data-field-path="page.number" data-edit-policy="locked" data-edit-reason="page-number" data-qa-role="text" data-qa-overlap="forbid">01</span>`);
assert.equal(audit.coverage, 1);
assert.equal(audit.intentionalRestricted.length, 1);

audit = auditTextFieldContracts(`<span data-element-id="risk" data-content-id="A2" data-field-path="risk.label" data-edit-policy="locked" data-qa-role="text" data-qa-overlap="forbid">风险提示</span>`);
assert.equal(audit.invalidRestricted.length, 1, "普通文字不能无理由锁定");

assert.deepEqual(allowedEditReasons.sort(), ["computed-value", "decorative-label", "embedded-content", "page-number", "source-identity", "system-control"]);
console.log(JSON.stringify({ passed: true, visibleTextDenominator: true, restrictedReasons: allowedEditReasons.length }, null, 2));
