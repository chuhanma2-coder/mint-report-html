// Canonical field binding and reversible export state, shared by custom scenes.
(() => {
  const q = s => [...document.querySelectorAll(s)];
  const data = document.querySelector('#mint-creative-data');
  let revision = 0, pending = Promise.resolve();
  const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, '0')).join('');
  const resolve = (model, path) => {
    let parent = model; const parts = path.split('.');
    for (const part of parts.slice(0, -1)) {
      if (['__proto__', 'constructor', 'prototype'].includes(part) || !Object.hasOwn(parent || {}, part)) throw new Error(`Unknown field ${path}`);
      parent = parent[part];
    }
    const key = parts.at(-1);
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(parent || {}, key) || typeof parent[key] !== 'string') throw new Error(`Not a text field ${path}`);
    return [parent, key];
  };
  function sync(node) {
    if (!data || node.dataset.editPolicy !== 'editable') return pending;
    const model = JSON.parse(data.textContent), [parent, key] = resolve(model, node.dataset.fieldPath);
    const value = node.innerText.trim();
    if (parent[key] === value) return pending;
    parent[key] = value; data.textContent = JSON.stringify(model);
    // Mirrors share a field, but never share element IDs. Do not replace the active node/caret.
    for (const other of q('[data-field-path]')) if (other !== node && other.dataset.fieldPath === node.dataset.fieldPath) other.textContent = value;
    document.querySelector('meta[name="mint-pdf-state"]')?.setAttribute('content', 'stale-after-html-edit');
    q('[data-export-pdf]').forEach(b => b.textContent = '重新生成当前编辑版本 PDF');
    dispatchEvent(new CustomEvent('mint-field-change', { detail: { fieldPath: node.dataset.fieldPath } }));
    const own = ++revision, serialized = data.textContent;
    pending = digest(serialized).then(hash => { if (own === revision) document.querySelector('meta[name="mint-content-hash"]')?.setAttribute('content', hash); });
    return pending;
  }
  q('[data-edit-policy="editable"]').forEach(n => n.addEventListener('input', () => { sync(n); }));
  function prepareExport() {
    if (document.activeElement?.matches('[data-edit-policy="editable"]')) sync(document.activeElement);
    const snapshot = {
      editing: document.body.classList.contains('editing'), exporting: document.body.classList.contains('exporting'),
      graph: window.mintInteractions?.snapshot(),
      details: q('.mint-details,details').map(n => ({ node: n, hidden: n.hidden, open: n.open })),
      modals: q('.mint-modal').map(n => ({ node: n, hidden: n.hidden }))
    };
    window.mintCreative?.setEditing(false);
    window.mintInteractions?.reset();
    document.body.classList.add('exporting');
    snapshot.details.forEach(({node}) => { node.hidden = false; if (node.tagName === 'DETAILS') node.open = true; });
    snapshot.modals.forEach(({node}) => node.hidden = true);
    return snapshot;
  }
  function restoreExport(snapshot) {
    if (!snapshot) return;
    document.body.classList.toggle('exporting', snapshot.exporting);
    snapshot.details.forEach(({node, hidden, open}) => { node.hidden = hidden; if (node.tagName === 'DETAILS') node.open = open; });
    snapshot.modals.forEach(({node, hidden}) => node.hidden = hidden);
    window.mintInteractions?.restore(snapshot.graph);
    window.mintCreative?.setEditing(snapshot.editing);
  }
  window.mintFields = { sync, flush: () => pending, prepareExport, restoreExport };
})();
