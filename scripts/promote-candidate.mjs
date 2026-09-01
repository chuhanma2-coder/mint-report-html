import fs from 'node:fs';
import path from 'node:path';
// Roll back a partial file promotion. Build metadata is placed last by the caller.
export function promoteCandidate(candidate, project, files) {
  const prior = new Map(), replaced = [];
  for (const file of files) {
    if (path.basename(file) !== file) throw new Error('Promotion only accepts root artifact names');
    if (!fs.statSync(path.join(candidate, file)).isFile()) throw new Error(`Not a candidate file: ${file}`);
    const target = path.join(project, file);
    if (fs.existsSync(target) && !fs.statSync(target).isFile()) throw new Error(`Not an artifact file: ${file}`);
    prior.set(file, fs.existsSync(target) ? fs.readFileSync(target) : null);
  }
  try {
    for (const file of files) {
      const target = path.join(project, file), temp = target + '.promoting';
      fs.copyFileSync(path.join(candidate, file), temp); fs.renameSync(temp, target); replaced.push(file);
    }
  } catch (error) {
    for (const file of replaced.reverse()) {
      const target = path.join(project, file), bytes = prior.get(file);
      if (bytes === null) fs.unlinkSync(target); else fs.writeFileSync(target, bytes);
    }
    throw error;
  }
}
