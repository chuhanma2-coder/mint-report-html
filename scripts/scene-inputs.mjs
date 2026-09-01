import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getField } from './interaction-contract.mjs';
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function sceneInput(project, scene, model) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(scene.id)) throw new Error('Unsafe Scene ID');
  const html = fs.readFileSync(path.join(project, 'src/scenes', scene.id + '.html'), 'utf8');
  const css = fs.readFileSync(path.join(project, 'src/scenes', scene.id + '.css'), 'utf8');
  const refs = [...html.matchAll(/data-field-path=["']([^"']+)["']/g)].map(m => m[1]);
  return { html, css, hash: sha(JSON.stringify({ html, css, scene, fields: refs.map(ref => [ref, getField(model, ref)]), atoms: scene.atomRefs.map(id => model.atoms[id]) })) };
}
export function implementationHash(skill) {
  // Tool changes invalidate prior QA, but source edits do not invalidate asset normalization.
  return sha(['assets', 'scripts'].flatMap(dir => fs.readdirSync(path.join(skill, dir)).filter(name => /\.(?:mjs|js|css)$/.test(name)).sort().map(name => fs.readFileSync(path.join(skill, dir, name)))).join('\n'));
}
