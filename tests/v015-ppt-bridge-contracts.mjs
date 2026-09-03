import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = JSON.parse(fs.readFileSync(path.join(root, "core-api.json"), "utf8"));
const exporter = fs.readFileSync(path.join(root, "scripts/export-editable-pptx.mjs"), "utf8");
const collaboration = fs.readFileSync(path.join(root, "scripts/collaboration-package.mjs"), "utf8");
assert.equal(api.schemaVersion, "1");
assert.equal(api.interfaces.themeEnvironment, "MINT_PPT_THEME_FILE");
assert.equal(api.interfaces.packSectionSync, "scripts/collaboration-package.mjs pack-section-sync");
assert.match(exporter, /process\.env\.MINT_PPT_THEME_FILE/);
assert.match(exporter, /object\.pptObjectName/);
assert.match(collaboration, /pack-section-sync/);
console.log(JSON.stringify({ passed: true, tests: 6 }));
