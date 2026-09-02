import fs from "node:fs";
import path from "node:path";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));

export function createReportModel(projectDir) {
  const brief = read(path.join(projectDir, "creative-brief.json"));
  const map = read(path.join(projectDir, "content-map.json"));
  const base = {
    schemaVersion: "0.11.0",
    sceneById: Object.fromEntries(brief.scenes.map(scene => [scene.id, scene])),
    atoms: Object.fromEntries(map.contentAtoms.map(atom => [atom.id, atom.text])),
    tables: {},
    charts: {},
    media: {},
    diagrams: {},
    userEdits: []
  };
  const modelFile = path.join(projectDir, "report-model.json");
  if (!fs.existsSync(modelFile)) return base;
  const saved = read(modelFile);
  const sceneById = Object.fromEntries(Object.entries(base.sceneById).map(([id, current]) => {
    const previous = saved.sceneById?.[id] || {};
    return [id, {
      ...previous,
      ...current,
      // These are user-facing fields. Keep an in-browser edit while refreshing
      // source references, interaction contracts and other structural fields
      // from the current creative brief.
      displayTitle: previous.displayTitle ?? current.displayTitle,
      sceneAnswer: previous.sceneAnswer ?? current.sceneAnswer
    }];
  }));
  return {
    ...base,
    ...saved,
    schemaVersion: "0.11.0",
    sceneById,
    atoms: { ...base.atoms, ...(saved.atoms || {}) },
    tables: saved.tables || {},
    charts: saved.charts || {},
    media: saved.media || {},
    diagrams: saved.diagrams || {},
    userEdits: Array.isArray(saved.userEdits) ? saved.userEdits : []
  };
}

export function writeReportModel(projectDir, model = createReportModel(projectDir)) {
  fs.writeFileSync(path.join(projectDir, "report-model.json"), `${JSON.stringify(model, null, 2)}\n`);
  return model;
}
