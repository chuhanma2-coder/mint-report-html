// Optional runtime. Authored edges are connectivity, never inferred causality.
(() => {
  const controllers = new Map();
  const model = () => JSON.parse(document.querySelector('#mint-creative-data').textContent);
  const field = path => path.split('.').reduce((v, k) => v?.[k], model());
  const button = (text, action) => { const n = document.createElement('button'); n.type = 'button'; n.textContent = text; n.addEventListener('click', action); return n; };
  for (const scene of Object.values(model().sceneById)) for (const spec of scene.interactiveModules || []) {
    const sceneRoot = [...document.querySelectorAll('section[data-scene-id]')].find(n => n.dataset.sceneId === scene.id);
    const root = [...sceneRoot.querySelectorAll('[data-module-id]')].find(n => n.dataset.moduleId === spec.id);
    if (!root) throw new Error(`Missing interaction root: ${scene.id}/${spec.id}`);
    const nodes = new Map([...root.querySelectorAll('[data-node-id]')].map(n => [n.dataset.nodeId, n]));
    const edges = new Map([...root.querySelectorAll('[data-edge-id]')].map(n => [n.dataset.edgeId, n]));
    function routeGeometry() {
      const svg = root.querySelector('svg[data-auto-route]');
      if (!svg) return; // Custom authored routes remain a first-class path.
      const frame = svg.getBoundingClientRect(); if (!frame.width || !frame.height) return;
      svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
      const rect = id => { const b = nodes.get(id).getBoundingClientRect(); return { x:b.left-frame.left,y:b.top-frame.top,w:b.width,h:b.height,cx:b.left-frame.left+b.width/2,cy:b.top-frame.top+b.height/2 }; };
      const routes = spec.edges.map(e => {
        const a=rect(e.from), b=rect(e.to), horizontal=Math.abs(b.cx-a.cx)>Math.abs(b.cy-a.cy);
        return {e,a,b,from:horizontal?(b.cx>=a.cx?'right':'left'):(b.cy>=a.cy?'bottom':'top'),to:horizontal?(b.cx>=a.cx?'left':'right'):(b.cy>=a.cy?'top':'bottom')};
      });
      const groups = new Map();
      for (const r of routes) for (const [end,id,side] of [['from',r.e.from,r.from],['to',r.e.to,r.to]]) {
        const key=`${id}/${side}`; if(!groups.has(key))groups.set(key,[]); groups.get(key).push({r,end});
      }
      for (const group of groups.values()) group.forEach(({r,end},i)=>{
        const b=end==='from'?r.a:r.b,side=r[end],t=(i+1)/(group.length+1);
        r[end+'Point']={x:b.x+(side==='left'?0:side==='right'?b.w:t*b.w),y:b.y+(side==='top'?0:side==='bottom'?b.h:t*b.h)};
      });
      for (const r of routes) {
        const n=edges.get(r.e.id),a=r.fromPoint,b=r.toPoint;
        if(!n)continue;
        const horizontal=['left','right'].includes(r.from),mid=horizontal?(a.x+b.x)/2:(a.y+b.y)/2;
        n.setAttribute('d',horizontal?`M${a.x} ${a.y} L${mid} ${a.y} L${mid} ${b.y} L${b.x} ${b.y}`:`M${a.x} ${a.y} L${a.x} ${mid} L${b.x} ${mid} L${b.x} ${b.y}`);
        n.dataset.fromSide=r.from; n.dataset.toSide=r.to;
      }
    }
    let view = { nodeIds: [], edgeIds: [], guideIndex: -1, message: '' };
    const controls = root.querySelector('[data-interaction-controls]');
    if (!controls) throw new Error(`Missing controls: ${spec.id}`);
    controls.setAttribute('data-ui-control', ''); controls.classList.add('mint-interaction-controls');
    const start = document.createElement('select'), end = document.createElement('select'), status = document.createElement('span');
    start.setAttribute('aria-label', '起点或聚焦对象'); end.setAttribute('aria-label', '路径终点'); status.setAttribute('role', 'status');
    status.dataset.interactionStatus = '';
    function refreshLabels() {
      for (const select of [start, end]) {
        const selected = select.value;
        select.replaceChildren(...spec.nodes.map(n => { const o = document.createElement('option'); o.value = n.id; o.textContent = field(n.fieldPath); return o; }));
        if (spec.nodes.some(n => n.id === selected)) select.value = selected;
      }
    }
    function show(nodeIds = [], edgeIds = [], message = '', guideIndex = -1) {
      view = { nodeIds, edgeIds, message, guideIndex };
      for (const [id, node] of nodes) node.classList.toggle('mint-node-focused', nodeIds.includes(id));
      for (const [id, edge] of edges) edge.classList.toggle('mint-edge-focused', edgeIds.includes(id));
      status.textContent = message; return structuredClone(view);
    }
    const assertNode = id => { if (!nodes.has(id)) throw new Error(`Unknown node: ${id}`); };
    function focus(id) { assertNode(id); start.value = id; return show([id], [], '已聚焦所选对象'); }
    function reach(id, direction) {
      assertNode(id);
      const seen = new Set([id]), found = new Set(), queue = [id];
      while (queue.length) {
        const current = queue.shift();
        for (const e of spec.edges.filter(e => e.directed)) {
          const from = direction === 'upstream' ? e.to : e.from, to = direction === 'upstream' ? e.from : e.to;
          if (from !== current) continue;
          found.add(e.id); if (!seen.has(to)) { seen.add(to); queue.push(to); }
        }
      }
      return show([...seen], [...found], '仅展示已声明的方向连接，不代表因果影响');
    }
    function route(from, to) {
      assertNode(from); assertNode(to);
      const queue = [{ node: from, nodeIds: [from], edgeIds: [] }], seen = new Set([from]);
      while (queue.length) {
        const item = queue.shift();
        if (item.node === to) return show(item.nodeIds, item.edgeIds, '已显示一条已声明的最短路径');
        for (const e of spec.edges) {
          const next = e.from === item.node ? e.to : !e.directed && e.to === item.node ? e.from : null;
          if (!next || seen.has(next)) continue;
          seen.add(next); queue.push({ node: next, nodeIds: [...item.nodeIds, next], edgeIds: [...item.edgeIds, e.id] });
        }
      }
      return show([from, to], [], '无已声明路径');
    }
    function guide(index = view.guideIndex + 1) {
      const views = spec.guidedViews || [];
      if (!views.length) return show();
      const i = Math.min(views.length - 1, Math.max(0, index));
      // A guide changes attention, not graph topology; never connects consecutive stops.
      return show(views[i].nodeIds, [], `讲解 ${i + 1} / ${views.length}`, i);
    }
    refreshLabels();
    controls.replaceChildren(start, button('聚焦', () => focus(start.value)), button('上游', () => reach(start.value, 'upstream')), button('下游', () => reach(start.value, 'downstream')), end, button('查看路径', () => route(start.value, end.value)));
    if (spec.guidedViews?.length) controls.append(button('下一讲解点', () => guide()));
    controls.append(button('恢复全貌', () => show()), status);
    const resize = new ResizeObserver(routeGeometry); resize.observe(root); nodes.forEach(n=>resize.observe(n));
    document.fonts.ready.then(routeGeometry); addEventListener('resize',routeGeometry);
    for (const [id, node] of nodes) {
      node.tabIndex = 0;
      node.addEventListener('click', e => { if (!document.body.classList.contains('editing') && !e.target.closest('button,input,select')) focus(id); });
      node.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && !document.body.classList.contains('editing')) { e.preventDefault(); focus(id); } });
    }
    controllers.set(`${scene.id}/${spec.id}`, { focus, reach, route, guide, routeGeometry, reset: () => show(), snapshot: () => ({ ...structuredClone(view), start: start.value, end: end.value }), restore: state => { start.value = state.start; end.value = state.end; show(state.nodeIds, state.edgeIds, state.message, state.guideIndex); }, refreshLabels });
    show();
  }
  addEventListener('mint-field-change', () => controllers.forEach(c => c.refreshLabels()));
  window.mintInteractions = {
    get: key => controllers.get(key),
    snapshot: () => Object.fromEntries([...controllers].map(([key, c]) => [key, c.snapshot()])),
    reset: () => controllers.forEach(c => c.reset()),
    restore: states => Object.entries(states || {}).forEach(([key, state]) => controllers.get(key)?.restore(state))
  };
})();
