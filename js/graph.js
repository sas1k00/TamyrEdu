/*
 * Отрисовка графа знаний в SVG. Базовые темы — внизу (корни), сложные — наверху.
 */
(function () {
  const T = window.Tamyr;
  const NW = 164, NH = 50;
  const OPEN = new Set(['gap', 'learning']);

  const LH = 104;                 // шаг между уровнями по вертикали
  const maxLevel = Math.max(...T.TOPICS.map(t => t.level));
  const H = 100 + maxLevel * LH;
  const yOf = l => H - 50 - l * LH;

  /*
   * Раскладка по схеме Сугиямы, упрощённо:
   * 1) ребро через несколько уровней идёт через «пустые» точки на промежуточных уровнях.
   *    Длинные рёбра из одной темы делят эти точки — получается общий ствол, который ветвится у цели;
   * 2) порядок тем на уровне подбирается так, чтобы линии пересекались как можно реже;
   * 3) по горизонтали каждый узел тянется к своим соседям, не налезая на другие.
   * Так линии обходят прямоугольники, а не идут сквозь них.
   */
  function layout() {
    const items = {};
    const levels = [];
    for (let l = 0; l <= maxLevel; l++) levels.push([]);
    const add = (key, level, real) => {
      if (!items[key]) { items[key] = { key, level, real, w: real ? NW : 14, up: new Set(), down: new Set() }; levels[level].push(key); }
      return items[key];
    };
    T.TOPICS.forEach(t => add(t.id, t.level, true));
    const chains = [];
    T.TOPICS.forEach(t => {
      t.prereq.forEach(p => {
        const lo = T.TOPICS.find(o => o.id === p);
        const chain = [p];
        for (let l = lo.level + 1; l < t.level; l++) chain.push(add(p + '@' + l, l, false).key);
        chain.push(t.id);
        for (let i = 1; i < chain.length; i++) { items[chain[i - 1]].up.add(chain[i]); items[chain[i]].down.add(chain[i - 1]); }
        chains.push({ from: p, to: t.id, chain });
      });
    });

    // Порядок на уровнях: барицентры + перестановка соседей, лучший вариант по числу пересечений.
    const idx = {};
    const reindex = l => levels[l].forEach((k, i) => { idx[k] = i; });
    levels.forEach((_, l) => reindex(l));
    const crossings = l => {      // между уровнями l и l+1
      const es = [];
      levels[l].forEach(k => items[k].up.forEach(u => es.push([idx[k], idx[u]])));
      let c = 0;
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
        if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
      }
      return c;
    };
    const total = () => levels.slice(0, -1).reduce((s, _, l) => s + crossings(l), 0);
    const local = l => (l > 0 ? crossings(l - 1) : 0) + (l < maxLevel ? crossings(l) : 0);
    const bary = (k, dir) => {
      const ns = [...items[k][dir]];
      return ns.length ? ns.reduce((s, n) => s + idx[n], 0) / ns.length : idx[k];
    };
    const sortLevel = (l, dir) => {
      const b = {};
      levels[l].forEach(k => { b[k] = bary(k, dir); });
      levels[l].sort((x, y) => b[x] - b[y] || idx[x] - idx[y]);
      reindex(l);
    };
    const transpose = l => {
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i + 1 < levels[l].length; i++) {
          const before = local(l);
          const row = levels[l];
          [row[i], row[i + 1]] = [row[i + 1], row[i]];
          reindex(l);
          if (local(l) < before) improved = true;
          else { [row[i], row[i + 1]] = [row[i + 1], row[i]]; reindex(l); }
        }
      }
    };
    let best = levels.map(r => r.slice()), bestC = total();
    for (let it = 0; it < 24; it++) {
      if (it % 2 === 0) for (let l = 1; l <= maxLevel; l++) sortLevel(l, 'down');
      else for (let l = maxLevel - 1; l >= 0; l--) sortLevel(l, 'up');
      levels.forEach((_, l) => transpose(l));
      const c = total();
      if (c < bestC) { bestC = c; best = levels.map(r => r.slice()); }
    }
    best.forEach((r, l) => { levels[l] = r; reindex(l); });

    // Горизонталь: каждый узел тянется к среднему (медиане) соседей; порядок и отступы сохраняются.
    const x = {};
    const gapBetween = (a, b) => (items[a].real && items[b].real ? 18 : 10);
    levels.forEach(row => {
      let cur = 0;
      row.forEach((k, i) => { if (i) cur += items[row[i - 1]].w / 2 + gapBetween(row[i - 1], k) + items[k].w / 2; x[k] = cur; });
      row.forEach(k => { x[k] -= cur / 2; });
    });
    const target = (k, dirs) => {
      const xs = [];
      dirs.forEach(d => items[k][d].forEach(n => xs.push(x[n])));
      if (!xs.length) return x[k];
      xs.sort((a, b) => a - b);
      const m = xs.length >> 1;
      return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
    };
    // Ближайшие позиции к желаемым при минимальных отступах — изотоническая регрессия (PAVA).
    const place = (row, dirs) => {
      const off = [0];
      for (let i = 1; i < row.length; i++) off[i] = off[i - 1] + items[row[i - 1]].w / 2 + gapBetween(row[i - 1], row[i]) + items[row[i]].w / 2;
      const blocks = [];
      row.forEach((k, i) => {
        const wt = items[k].real ? 1 : 2;   // «пустые» точки весомее: длинные линии остаются прямее
        blocks.push({ sum: (target(k, dirs) - off[i]) * wt, wt, n: 1 });
        while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].wt > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].wt) {
          const b = blocks.pop(), a = blocks[blocks.length - 1];
          a.sum += b.sum; a.wt += b.wt; a.n += b.n;
        }
      });
      let i = 0;
      blocks.forEach(b => { for (let j = 0; j < b.n; j++, i++) x[row[i]] = b.sum / b.wt + off[i]; });
    };
    for (let it = 0; it < 10; it++) {
      for (let l = 1; l <= maxLevel; l++) place(levels[l], ['down']);
      for (let l = maxLevel - 1; l >= 0; l--) place(levels[l], ['up']);
    }
    for (let it = 0; it < 4; it++) levels.forEach(row => place(row, ['down', 'up']));

    const left = Math.min(...Object.keys(x).map(k => x[k] - items[k].w / 2));
    const right = Math.max(...Object.keys(x).map(k => x[k] + items[k].w / 2));
    const W = Math.max(1080, Math.ceil(right - left) + 40);
    const shift = (W - (right - left)) / 2 - left;
    const pos = {};
    Object.keys(x).forEach(k => { pos[k] = { x: x[k] + shift, y: yOf(items[k].level) }; });

    // Точки входа/выхода линий разносятся по краю прямоугольника — в порядке соседей слева направо.
    const port = {};
    Object.values(items).filter(it => it.real).forEach(it => {
      ['up', 'down'].forEach(dir => {
        const ns = [...it[dir]].sort((a, b) => pos[a].x - pos[b].x);
        const step = ns.length > 1 ? Math.min(18, (NW - 40) / (ns.length - 1)) : 0;
        ns.forEach((n, i) => { port[it.key + dir + n] = pos[it.key].x + (i - (ns.length - 1) / 2) * step; });
      });
    });
    const portX = (k, dir, n) => (items[k].real ? port[k + dir + n] : pos[k].x);

    const edges = chains.map(c => {
      const ch = c.chain;
      let d = '';
      for (let i = 1; i < ch.length; i++) {
        const a = ch[i - 1], b = ch[i];
        const x1 = portX(a, 'up', b), y1 = pos[a].y - NH / 2;
        const x2 = portX(b, 'down', a), y2 = pos[b].y + NH / 2;
        const my = (y1 + y2) / 2;
        if (i === 1) d += `M${x1},${y1}`;
        else d += ` L${x1},${y1}`;     // сквозь уровень — по вертикали, в промежутке между темами
        d += ` C${x1},${my} ${x2},${my} ${x2},${y2}`;
      }
      return { from: c.from, to: c.to, d };
    });
    return { pos, edges, W };
  }
  const { pos: POS, edges: EDGES, W } = layout();

  function el(name, attrs, text) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
    if (text != null) e.textContent = text;
    return e;
  }

  /* status: {topicId: статус}; opts: {current, rootGaps, due:Set, onClick} */
  T.renderGraph = function (container, status, opts) {
    opts = opts || {};
    const roots = new Set(opts.rootGaps || []);
    const due = opts.due || new Set();
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph', role: 'img', 'aria-label': T.t('Карта знаний') });

    const edges = el('g', { class: 'edges' });
    const isBad = e => OPEN.has(status[e.to]) && OPEN.has(status[e.from]);
    // Проблемные рёбра рисуются последними, чтобы серые линии их не перекрывали.
    EDGES.slice().sort((a, b) => isBad(a) - isBad(b)).forEach(e => {
      edges.appendChild(el('path', { d: e.d, class: 'edge' + (isBad(e) ? ' edge-bad' : ''), 'data-from': e.from, 'data-to': e.to }));
    });
    svg.appendChild(edges);

    T.TOPICS.forEach(t => {
      const p = POS[t.id];
      const st = status[t.id] || 'unknown';
      let cls = 'node n-' + st;
      if (roots.has(t.id)) cls += ' n-root';
      if (opts.current === t.id) cls += ' n-current';
      const g = el('g', { class: cls, transform: `translate(${p.x - NW / 2},${p.y - NH / 2})`, 'data-id': t.id });
      g.appendChild(el('title', {}, t.title));
      g.appendChild(el('rect', { width: NW, height: NH, rx: 12 }));
      g.appendChild(el('text', { x: NW / 2, y: NH / 2 + 6, 'text-anchor': 'middle' }, t.short));
      if (roots.has(t.id) || due.has(t.id)) {
        const root = roots.has(t.id);
        g.appendChild(el('circle', { cx: NW - 4, cy: 4, r: 11, class: root ? 'root-badge' : 'due-badge' }));
        g.appendChild(el('text', { x: NW - 4, y: 9, 'text-anchor': 'middle', class: root ? 'root-badge-t' : 'due-badge-t' }, root ? '!' : '↻'));
      }
      g.addEventListener('mouseenter', () => focus(t.id));
      g.addEventListener('mouseleave', () => focus(null));
      if (opts.onClick) { g.style.cursor = 'pointer'; g.addEventListener('click', () => opts.onClick(t.id)); }
      svg.appendChild(g);
    });

    // Наведение на тему подсвечивает её связи, остальные линии приглушаются.
    function focus(id) {
      svg.classList.toggle('focus', !!id);
      edges.querySelectorAll('.edge').forEach(p => {
        p.classList.toggle('edge-hl', !!id && (p.dataset.from === id || p.dataset.to === id));
      });
      // Подсвеченные — поверх остальных; после ухода курсора поверх снова проблемные.
      edges.querySelectorAll(id ? '.edge-hl' : '.edge-bad').forEach(p => edges.appendChild(p));
    }

    container.innerHTML = '';
    container.appendChild(svg);
  };

  T.LEGEND = [
    ['solid', T.t('Закреплено')],
    ['mastered', T.t('Освоено')],
    ['inferred', T.t('Засчитано без вопросов')],
    ['learning', T.t('Изучаю')],
    ['gap', T.t('Пробел')],
    ['root', T.t('Корневой пробел')],
    ['risk', T.t('Под угрозой')],
    ['unknown', T.t('Не проверялось')]
  ];
})();
