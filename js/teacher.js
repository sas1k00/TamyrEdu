/*
 * Панель учителя: корневые пробелы класса, типичные ошибки, мини-группы, тепловая карта.
 * Демо-класс — это симулированные ученики, прогнанные через тот же движок диагностики.
 */
(function () {
  const T = window.Tamyr;
  const esc = s => T.esc(s);
  const title = id => T.TOPIC[id].title;

  const DEMO_NAMES = ['Айгерим С.', 'Нурлан Б.', 'Дана К.', 'Арман Т.', 'Алия М.', 'Ерлан Ж.', 'Мадина О.', 'Тимур А.',
    'Асель Н.', 'Данияр Е.', 'Камила Р.', 'Санжар У.', 'Жанель Д.', 'Алихан С.', 'Томирис Б.', 'Ильяс К.',
    'Амина Ж.', 'Бекзат М.', 'Сабина Т.', 'Азамат Л.', 'Карина В.', 'Нурсултан Г.', 'Аружан П.', 'Ержан И.'];
  // Типичные «корни» и их условная частота — только для генерации демо-класса
  const DEMO_ROOTS = [['frac', 5], ['neg', 3], ['expr', 3], ['pct', 3], ['pow', 2], ['fsu', 2], ['prop', 2], ['root', 1], ['ineq', 1], ['linf', 1]];

  let demoCache = null;
  function demoClass() {
    if (demoCache) return demoCache;
    const rand = T.rng(2026);
    const bag = [];
    DEMO_ROOTS.forEach(([id, w]) => { for (let i = 0; i < w; i++) bag.push(id); });
    demoCache = DEMO_NAMES.map((name, i) => {
      const k = rand() < 0.2 ? 0 : rand() < 0.7 ? 1 : 2;
      const roots = [];
      while (roots.length < k) { const r = bag[Math.floor(rand() * bag.length)]; if (!roots.includes(r)) roots.push(r); }
      const res = T.runSimulated(T.GOALS[0].start, roots, 1000 + i);
      const c = T.store.compact(name, 'full', res);
      c.demo = true;
      return c;
    });
    return demoCache;
  }

  let showDemo = true;

  /* ---------- Классы из облака (supabase/classes.sql) ----------
     Учитель создаёт класс, ученики вступают по коду, их прогресс приходит сюда сам. Кто что видит, решают правила базы. */
  const A = T.account;
  const t = T.t;
  const cls = { list: null, members: [], data: {}, sel: null, busy: false, loadedAt: 0, error: null, confirmDrop: false, kick: null, autoDemoOff: false, open: false };
  const cloud = () => !!A && A.enabled && A.isTeacher();
  const myId = () => (A.user() ? A.user().id : null);
  const rerender = () => { if (location.hash.split('/')[0] === '#teacher') T.viewTeacher(document.getElementById('app')); };

  async function loadClass(id) {
    const ids = cls.members.filter(m => m.class_id === id).map(m => m.user_id);
    const rows = await A.classes.progressOf(ids);
    cls.data[id] = {};
    (rows || []).forEach(r => { cls.data[id][r.user_id] = r; });
  }
  async function loadClasses() {
    if (cls.busy) return;
    cls.busy = true; cls.error = null;
    try {
      const [list, members] = await Promise.all([A.classes.list(), A.classes.members()]);
      cls.list = (list || []).filter(c => c.teacher_id === myId());
      cls.members = members || [];
      if (cls.sel && !cls.list.some(c => c.id === cls.sel)) cls.sel = null;
      if (!cls.sel && cls.list.length) cls.sel = cls.list[cls.list.length - 1].id;
      // есть настоящий класс — демо больше не мешает (включить обратно можно переключателем)
      if (cls.sel && !cls.autoDemoOff) { showDemo = false; cls.autoDemoOff = true; }
      if (cls.sel) await loadClass(cls.sel);
    } catch (e) {
      cls.error = t('Не удалось загрузить классы. Проверь интернет и обнови страницу.');
      if (!cls.list) cls.list = [];
    }
    cls.busy = false; cls.loadedAt = Date.now();
    rerender();
  }

  /* Ученики выбранного класса в формате панели: сводка их прогресса, имя — из аккаунта. */
  function classRows() {
    const data = cls.sel && cls.data[cls.sel];
    if (!data) return [];
    return cls.members.filter(m => m.class_id === cls.sel).map(m => {
      const c = data[m.user_id] && T.learner.summarize(data[m.user_id].state);
      if (c && m.student_name) c.n = m.student_name;
      return c;
    }).filter(Boolean);
  }

  function classesHtml() {
    if (!cloud()) return '';
    if (cls.list === null) return `<section class="card classes"><h2>${t('Мои классы')}</h2><p class="muted">${t('Загружаем классы…')}</p></section>`;
    const sel = cls.list.find(c => c.id === cls.sel);
    const members = sel ? cls.members.filter(m => m.class_id === sel.id) : [];
    const data = (sel && cls.data[sel.id]) || {};
    const link = sel ? location.origin + location.pathname + '#join/' + sel.code : '';
    return `<section class="card classes">
      <div class="cls-head"><h2>${t('Мои классы')}</h2>
        <form id="new-class" class="row"><input id="cname" maxlength="60" required placeholder="${t('Например, 11 «А»')}" aria-label="${t('Название класса')}"><button class="btn small primary" type="submit">${t('Создать класс')}</button></form>
      </div>
      ${cls.error ? `<p class="bad-msg small" role="alert">${esc(cls.error)}</p>` : ''}
      ${cls.list.length ? `<div class="cls-tabs">${cls.list.map(c => `<button class="cls-tab${c.id === cls.sel ? ' on' : ''}" data-cls="${esc(c.id)}" aria-pressed="${c.id === cls.sel}">${esc(c.name)} <span>${cls.members.filter(m => m.class_id === c.id).length}</span></button>`).join('')}</div>`
        : `<p class="muted">${t('Создайте класс — ученики вступят по коду, и их карты тем появятся здесь сами.')}</p>`}
      ${sel ? `<div class="cls-code">
          <div><span class="muted small">${t('Код класса')}</span><b class="code">${esc(sel.code)}</b></div>
          <div class="cls-share"><p class="small muted">${t('Ученик вводит код в своём аккаунте или открывает ссылку:')}</p>
            <div class="row"><code class="small">${esc(link)}</code><button class="btn small" id="copy-link">${t('Скопировать ссылку')}</button></div></div>
        </div>
        <details class="cls-members"${cls.open ? ' open' : ''}><summary>${t('Ученики класса')} (${members.length})</summary>
          ${members.length ? `<ul>${members.map(m => `<li><span>${esc(m.student_name || t('Без имени'))}${data[m.user_id] ? '' : ` <span class="muted small">· ${t('ещё нет прогресса')}</span>`}</span><button class="link small" data-kick="${esc(m.user_id)}">${cls.kick === m.user_id ? t('Точно убрать?') : t('Убрать')}</button></li>`).join('')}</ul>`
            : `<p class="muted small">${t('Пока никто не вступил. Напишите код на доске — это займёт минуту.')}</p>`}
          <button class="btn small danger" id="drop-class">${cls.confirmDrop ? t('Точно удалить класс «{name}»?', { name: esc(sel.name) }) : t('Удалить класс')}</button>
        </details>` : ''}
    </section>`;
  }

  function bindClasses(app) {
    if (!cloud() || !cls.list) return;
    // список учеников остаётся раскрытым между перерисовками — иначе подтверждение «Точно убрать?» пряталось бы
    const det = app.querySelector('.cls-members');
    if (det) det.addEventListener('toggle', () => { cls.open = det.open; });
    const act = async (fn, fail) => { try { await fn(); } catch (e) { cls.error = fail; } await loadClasses(); };
    app.querySelector('#new-class').addEventListener('submit', e => {
      e.preventDefault();
      const name = app.querySelector('#cname').value.trim();
      if (!name) return;
      act(async () => { const c = await A.classes.create(name); cls.sel = c && c.id; }, t('Не удалось создать класс.'));
    });
    app.querySelectorAll('[data-cls]').forEach(b => b.addEventListener('click', async () => {
      cls.sel = b.dataset.cls; cls.confirmDrop = false; cls.kick = null;
      if (!cls.data[cls.sel]) { try { await loadClass(cls.sel); } catch (e) { cls.error = t('Не удалось загрузить классы. Проверь интернет и обнови страницу.'); } }
      rerender();
    }));
    const copy = app.querySelector('#copy-link');
    if (copy) copy.addEventListener('click', async () => {
      const text = app.querySelector('.cls-share code').textContent;
      try { await navigator.clipboard.writeText(text); copy.textContent = t('Скопировано'); } catch (e) { copy.textContent = text; }
    });
    app.querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', () => {
      if (cls.kick !== b.dataset.kick) { cls.kick = b.dataset.kick; return rerender(); }
      cls.kick = null;
      act(() => A.classes.remove(cls.sel, b.dataset.kick), t('Не удалось убрать ученика.'));
    }));
    const drop = app.querySelector('#drop-class');
    if (drop) drop.addEventListener('click', () => {
      if (!cls.confirmDrop) { cls.confirmDrop = true; return rerender(); }
      cls.confirmDrop = false;
      const id = cls.sel; cls.sel = null; delete cls.data[id];
      act(() => A.classes.drop(id), t('Не удалось удалить класс.'));
    });
  }

  /* «Что сделать на этой неделе»: 2–4 конкретных шага для учителя из данных класса.
     Активность (кто давно не занимался, кто не начал) есть только у настоящего класса из облака. */
  function actions(rows, rootsSorted, misSorted) {
    const n = rows.length, out = [];
    const names = list => list.slice(0, 6).map(esc).join(', ') + (list.length > 6 ? ' ' + t('и ещё {n}', { n: list.length - 6 }) : '');
    if (rootsSorted.length && rootsSorted[0][1] >= Math.max(2, Math.ceil(n * 0.2))) {
      const [id, c] = rootsSorted[0];
      out.push({ icon: '🎯', text: t('Разобрать у доски «{topic}»: пробел у {c} из {n} учеников.', { topic: esc(title(id)), c, n }), sub: esc(T.TOPIC[id].rule) });
    }
    if (misSorted.length && misSorted[0][1] >= 2) {
      const m = T.MISCONCEPTIONS[misSorted[0][0]];
      out.push({ icon: '⚠️', text: t('Показать классу типичную ошибку: «{mis}» — у {c} учеников.', { mis: esc(m.title), c: misSorted[0][1] }), sub: esc(m.fix) });
    }
    const sel = cloud() && cls.sel && cls.data[cls.sel];
    if (sel) {
      const members = cls.members.filter(m => m.class_id === cls.sel);
      const nameOf = m => m.student_name || (sel[m.user_id] && sel[m.user_id].state && sel[m.user_id].state.name) || t('Без имени');
      const idle = members.filter(m => sel[m.user_id] && Date.now() - Date.parse(sel[m.user_id].updated_at) > 3 * 86400000).map(nameOf);
      const fresh = members.filter(m => !sel[m.user_id]).map(nameOf);
      if (idle.length) out.push({ icon: '⏰', text: t('Не занимались 3 дня и больше: {names}. Стоит напомнить.', { names: names(idle) }) });
      if (fresh.length) out.push({ icon: '🚀', text: t('Ещё не прошли диагностику: {names}.', { names: names(fresh) }) });
    }
    if (!out.length && n) out.push({ icon: '✅', text: t('Общих пробелов нет — класс в хорошей форме. Дайте задания на повторение.') });
    return out;
  }

  function roster() {
    return (showDemo ? demoClass() : []).concat(classRows(), T.store.imported()).map(c => Object.assign(T.store.expand(c), { demo: !!c.demo }));
  }

  function csv(rows) {
    const head = [T.t('Ученик')].concat(T.TOPICS.map(t => t.title), [T.t('Корневые пробелы'), T.t('Вопросов')]);
    const lines = [head].concat(rows.map(r => [r.name].concat(T.TOPICS.map(t => r.status[t.id]), [r.rootGaps.map(title).join('; '), r.asked])));
    // имена пишут сами ученики: «=…», «+…», «-…», «@…» Excel принял бы за формулу — экранируем апострофом
    const cell = v => { const s = String(v); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
    return '﻿' + lines.map(l => l.map(cell).join(';')).join('\n');
  }

  T.viewTeacher = function (app) {
    // классы обновляем при входе на панель, но не чаще раза в минуту
    if (cloud() && !cls.busy && Date.now() - cls.loadedAt > 60000) loadClasses();
    const rows = roster();
    const n = rows.length;
    const rootCount = {};
    const groups = {};
    rows.forEach(r => r.rootGaps.forEach(g => { rootCount[g] = (rootCount[g] || 0) + 1; (groups[g] = groups[g] || []).push(r.name); }));
    const rootsSorted = Object.entries(rootCount).sort((a, b) => b[1] - a[1]);
    const misCount = {};
    rows.forEach(r => r.misconceptions.forEach(m => { misCount[m.id] = (misCount[m.id] || 0) + 1; }));
    const misSorted = Object.entries(misCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const avgAsked = n ? Math.round(rows.reduce((s, r) => s + r.asked, 0) / n) : 0;
    const clean = rows.filter(r => !r.rootGaps.length).length;
    const maxRoot = rootsSorted.length ? rootsSorted[0][1] : 1;
    const todo = actions(rows, rootsSorted, misSorted);

    app.innerHTML = `
      <section class="result-head">
        <div>
          <p class="eyebrow">${T.t('Панель учителя')}</p>
          <h1>${T.t('Класс: корни, а не оценки')}</h1>
          <p class="lead">${T.t('Вместо «средний балл 62%» — какие именно базовые темы тянут класс вниз и кого с кем объединить на 15-минутный разбор.')}</p>
        </div>
        <div class="stats">
          <div><b>${n}</b><span>${T.t('учеников')}</span></div>
          <div><b>${avgAsked}</b><span>${T.t('вопросов в среднем')}</span></div>
          <div><b>${clean}</b><span>${T.t('без пробелов')}</span></div>
        </div>
      </section>
      ${classesHtml()}
      <section class="card toolbar">
        <label class="switch"><input type="checkbox" id="demo" ${showDemo ? 'checked' : ''}> ${T.t('Демо-класс')} <span class="chip small warn">${T.t('симуляция: {n} виртуальных учеников', { n: DEMO_NAMES.length })}</span></label>
        <details><summary>${T.t('Добавить ученика по коду')}</summary>
          <textarea id="code" rows="3" placeholder="${T.t('Вставьте код TMR1… со страницы «Прогресс» ученика')}"></textarea>
          <div class="row"><button class="btn small primary" id="add">${T.t('Добавить')}</button><button class="btn small ghost" id="clear">${T.t('Удалить добавленных')}</button><span id="msg" class="small"></span></div>
        </details>
        <button class="btn small" id="csv" ${n ? '' : 'disabled'}>${T.t('Скачать CSV')}</button>
      </section>
      ${todo.length ? `<section class="card todo"><h2>${t('Что сделать на этой неделе')}</h2><ul class="todo-list">${todo.map(a => `<li><span class="todo-i" aria-hidden="true">${a.icon}</span><div><p>${a.text}</p>${a.sub ? `<p class="muted small">${a.sub}</p>` : ''}</div></li>`).join('')}</ul></section>` : ''}
      ${n ? `
      <section class="grid2">
        <div class="card">
          <h2>${T.t('Корневые пробелы класса')}</h2>
          <ul class="bars">${rootsSorted.map(([id, c]) => `<li><span class="lbl">${esc(title(id))}</span><span class="bar"><i style="width:${(c / maxRoot) * 100}%"></i></span><span class="val">${c}</span></li>`).join('') || `<li class="muted">${T.t('Пробелов не найдено')}</li>`}</ul>
        </div>
        <div class="card">
          <h2>${T.t('Самые частые ошибки мышления')}</h2>
          <ul class="mis">${misSorted.map(([id, c]) => `<li><b>${esc(T.MISCONCEPTIONS[id].title)}</b> <span class="chip small">${c} ${T.t('уч.')}</span><span class="fix">${esc(T.MISCONCEPTIONS[id].fix)}</span></li>`).join('') || `<li class="muted">${T.t('Нет данных')}</li>`}</ul>
        </div>
      </section>
      <section class="card">
        <h2>${T.t('Мини-группы для разбора')}</h2>
        <div class="groups">${rootsSorted.map(([id]) => `<div class="group"><h3>${esc(title(id))} <span class="muted small">· ${groups[id].length} ${T.t('уч.')}</span></h3><p class="small">${groups[id].map(esc).join(', ')}</p><p class="tiny muted">${esc(T.TOPIC[id].rule)}</p></div>`).join('')}</div>
      </section>
      <section class="card">
        <h2>${T.t('Тепловая карта')}</h2>
        <div class="heat-wrap"><table class="heat">
          <thead><tr><th>${T.t('Ученик')}</th>${T.TOPICS.map(t => `<th title="${esc(t.title)}"><span>${esc(t.short)}</span></th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><td>${esc(r.name)}${r.demo ? '' : ` <span class="chip small">${T.t('реальный')}</span>`}</td>${T.TOPICS.map(t => {
            const st = r.status[t.id]; const root = r.rootGaps.includes(t.id);
            return `<td class="c-${st}${root ? ' c-root' : ''}" title="${esc(t.title)}: ${esc((T.LEGEND.find(l => l[0] === (root ? 'root' : st)) || ['', st])[1])}"></td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
        ${T.legendHtml(['mastered', 'inferred', 'gap', 'root', 'risk', 'unknown'])}
      </section>` : `<section class="card"><p>${cloud() && cls.sel ? T.t('Пока нет данных: ученики появятся здесь, когда вступят в класс и пройдут диагностику.') : T.t('Пока нет учеников. Включите демо-класс или добавьте код ученика.')}</p></section>`}
    `;
    bindClasses(app);

    app.querySelector('#demo').addEventListener('change', e => { showDemo = e.target.checked; T.viewTeacher(app); });
    app.querySelector('#add').addEventListener('click', () => {
      const msg = app.querySelector('#msg');
      try { T.store.addImported(T.store.decode(app.querySelector('#code').value)); T.viewTeacher(app); }
      catch (e) { msg.textContent = T.t('Не удалось прочитать код — скопируйте его целиком.'); msg.className = 'small bad-msg'; }
    });
    app.querySelector('#clear').addEventListener('click', () => { T.store.clearImported(); T.viewTeacher(app); });
    app.querySelector('#csv').addEventListener('click', () => {
      const blob = new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'tamyr-class.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  };
})();
