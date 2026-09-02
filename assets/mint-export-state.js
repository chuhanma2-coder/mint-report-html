// Export has one owner; navigation and editing remain in the shared runtime.
(() => {
  let printSnapshot;
  for (const button of document.querySelectorAll('[data-export-pdf]')) {
    let printOnly = false;
    button.addEventListener('click', async () => {
      if (printOnly) { window.print(); return; }
      if (location.protocol === 'file:') { window.print(); return; }
      const snapshot = window.mintFields.prepareExport();
      button.disabled = true;
      try {
        await window.mintFields.flush();
        const submittedHash = document.querySelector('meta[name="mint-content-hash"]')?.content;
        const response = await fetch('/api/export-pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html: '<!doctype html>' + document.documentElement.outerHTML, filename: button.dataset.filename || 'mint-report.pdf' }) });
        if (!response.ok) throw new Error('PDF service unavailable');
        const returnedHash = response.headers.get('X-Mint-Content-Hash');
        if (returnedHash !== submittedHash) throw new Error('PDF content hash mismatch');
        const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
        link.href = url; link.download = button.dataset.filename || 'mint-report.pdf'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (document.querySelector('meta[name="mint-content-hash"]')?.content === returnedHash) {
          document.querySelector('meta[name="mint-pdf-state"]')?.setAttribute('content','available');
          let meta = document.querySelector('meta[name="mint-pdf-content-hash"]');
          if (!meta) { meta=document.createElement('meta');meta.name='mint-pdf-content-hash';document.head.append(meta); }
          meta.content=returnedHash;
        }
      } catch {
        printOnly = true; button.textContent = '打印 / 导出 PDF';
        button.title = '本地PDF服务未启动；点击打开打印窗口，再选择存储为PDF。';
        window.print();
      } finally { button.disabled = false; window.mintFields.restoreExport(snapshot); }
    });
  }
  // Snapshot before exiting editing, so afterprint restores the reader's state.
  addEventListener('beforeprint', () => { printSnapshot ||= window.mintFields.prepareExport(); }, { capture: true });
  addEventListener('afterprint', () => { window.mintFields.restoreExport(printSnapshot); printSnapshot = null; });
})();
