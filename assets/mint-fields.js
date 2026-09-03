// Canonical typed field binding and reversible export state, shared by custom scenes.
(() => {
  const q = selector => [...document.querySelectorAll(selector)];
  const data = document.querySelector('#mint-creative-data');
  let revision = 0, pending = Promise.resolve(), hashTimer = null, hashDirty = false;
  const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
  const blocked = new Set(['__proto__', 'constructor', 'prototype']);
  function model() { return JSON.parse(data?.textContent || '{}'); }
  function resolve(current, fieldPath) {
    let parent = current; const parts = String(fieldPath || '').split('.').filter(Boolean);
    if (!parts.length) throw new Error('Missing field path');
    for (const part of parts.slice(0, -1)) {
      if (blocked.has(part) || !Object.hasOwn(parent || {}, part)) throw new Error(`Unknown field ${fieldPath}`);
      parent = parent[part];
    }
    const key = parts.at(-1);
    if (blocked.has(key) || !Object.hasOwn(parent || {}, key)) throw new Error(`Unknown field ${fieldPath}`);
    return [parent, key];
  }
  function read(fieldPath) { const current = model(), [parent, key] = resolve(current, fieldPath); return parent[key]; }
  function setPath(current, fieldPath, value) { const [parent,key]=resolve(current,fieldPath);parent[key]=value; }
  function dependencyValue(source,binding={}) {
    const series=(source?.series||[])[Number(binding.series||0)],values=series?.values||[],index=binding.category==null?Number(binding.index||0):(source?.categories||[]).indexOf(binding.category);
    const value=Number(values[index]);if(!Number.isFinite(value))return null;
    const digits=Number.isInteger(binding.digits)?binding.digits:2,scaled=value*Number(binding.multiplier||1),text=scaled.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
    return `${binding.prefix||''}${text}${binding.suffix||''}`;
  }
  function applyDependencies(current,sourcePath) {
    const dependencies=(current.fieldDependencies||[]).filter(item=>item?.sourcePath===sourcePath),pending=new Set(current.pendingDependencyReviews||[]);
    for(const dependency of dependencies){
      const id=dependency.id||`${dependency.sourcePath}->${dependency.targetPath}`;
      if(dependency.mode==='review-required'){pending.add(id);continue}
      if(dependency.mode!=='derived'||!dependency.targetPath||!dependency.template)continue;
      const source=readFrom(current,sourcePath);let text=String(dependency.template),complete=true;
      for(const [name,binding] of Object.entries(dependency.bindings||{})){const value=dependencyValue(source,binding);if(value==null){complete=false;break}text=text.replaceAll(`{{${name}}}`,value)}
      if(!complete)throw new Error(`无法重算派生字段 ${dependency.targetPath}`);
      setPath(current,dependency.targetPath,text);pending.delete(id);
      for(const node of q('[data-field-path]'))if(node.dataset.fieldPath===dependency.targetPath&&!node.dataset.editKind)node.textContent=text;
    }
    current.pendingDependencyReviews=[...pending];
  }
  function readFrom(current,fieldPath){const [parent,key]=resolve(current,fieldPath);return parent[key]}
  function markStale() {
    document.querySelector('meta[name="mint-pdf-state"]')?.setAttribute('content', 'stale-after-html-edit');
    q('[data-export-pdf]').forEach(button => button.textContent = '重新生成当前编辑版本 PDF');
  }
  function updateHash(serialized = data?.textContent || '{}') {
    const own = ++revision; hashDirty = false;
    pending = digest(serialized).then(hash => { if (own === revision) document.querySelector('meta[name="mint-content-hash"]')?.setAttribute('content', hash); });
    return pending;
  }
  function scheduleHash() {
    hashDirty = true; clearTimeout(hashTimer); hashTimer = setTimeout(() => { hashTimer = null; updateHash(); }, 400);
  }
  function commit(current, detail) {
    current.userEdits ||= [];
    const now = new Date().toISOString(), last = current.userEdits.at(-1);
    if (last?.fieldPath === detail.fieldPath && last?.kind === (detail.kind || 'text')) last.editedAt = now;
    else current.userEdits.push({ fieldPath: detail.fieldPath, kind: detail.kind || 'text', source: 'user-html-edit', editedAt: now });
    data.textContent = JSON.stringify(current); markStale();
    dispatchEvent(new CustomEvent('mint-field-change', { detail }));
    scheduleHash(); return Promise.resolve();
  }
  function set(fieldPath, value, { kind = 'text', sourceNode = null } = {}) {
    if (!data) return pending;
    const current = model(), [parent, key] = resolve(current, fieldPath);
    if (JSON.stringify(parent[key]) === JSON.stringify(value)) return pending;
    parent[key] = value;
    applyDependencies(current, fieldPath);
    if (kind === 'text') for (const other of q('[data-field-path]')) if (other !== sourceNode && other.dataset.fieldPath === fieldPath && !other.dataset.editKind) other.textContent = String(value);
    return commit(current, { fieldPath, kind });
  }
  function sync(node) {
    if (!data || node.dataset.editPolicy !== 'editable') return pending;
    const current = model(), [parent, key] = resolve(current, node.dataset.fieldPath), value = node.innerText.trim();
    if (typeof parent[key] !== 'string') throw new Error(`Not a text field ${node.dataset.fieldPath}`);
    if (parent[key] === value) return pending;
    parent[key] = value;
    for (const other of q('[data-field-path]')) if (other !== node && other.dataset.fieldPath === node.dataset.fieldPath) other.textContent = value;
    return commit(current, { fieldPath: node.dataset.fieldPath, kind: 'text' });
  }
  q('[data-edit-policy="editable"]:not([data-edit-kind])').forEach(node => node.addEventListener('input', () => sync(node)));
  function prepareExport() {
    if (document.activeElement?.matches('[data-edit-policy="editable"]')) sync(document.activeElement);
    const snapshot = { editing: document.body.classList.contains('editing'), exporting: document.body.classList.contains('exporting'), graph: window.mintInteractions?.snapshot(), details: q('.mint-details,details').map(node => ({ node, hidden: node.hidden, open: node.open })), modals: q('.mint-modal').map(node => ({ node, hidden: node.hidden })) };
    window.mintCreative?.setEditing(false); window.mintInteractions?.reset(); document.body.classList.add('exporting');
    snapshot.details.forEach(({node}) => { node.hidden = false; if (node.tagName === 'DETAILS') node.open = true; }); snapshot.modals.forEach(({node}) => node.hidden = true);
    return snapshot;
  }
  function restoreExport(snapshot) {
    if (!snapshot) return; document.body.classList.toggle('exporting', snapshot.exporting);
    snapshot.details.forEach(({node, hidden, open}) => { node.hidden = hidden; if (node.tagName === 'DETAILS') node.open = open; }); snapshot.modals.forEach(({node, hidden}) => node.hidden = hidden);
    window.mintInteractions?.restore(snapshot.graph); window.mintCreative?.setEditing(snapshot.editing);
  }
  async function flush() { if (hashTimer) { clearTimeout(hashTimer); hashTimer = null; } if (hashDirty) return updateHash(); return pending; }
  window.mintFields = { model, read, set, sync, flush, prepareExport, restoreExport, markStale };
})();
