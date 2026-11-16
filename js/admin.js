/*
 * Админ-панель (#admin): все классы, все ученики и статистика пилота по всему проекту.
 * Только для аккаунта с флагом admin (supabase/pilot.sql → set_admin). Данные отдаёт база функциями
 * admin_overview и pilot_stats; права проверяет она же, а не этот файл.
 */
(function () {
  const T = window.Tamyr;
  const A = T.account;
  const t = T.t;
  const esc = s => T.esc(s);

  const adm = { data: null, stats: {}, sel: 'all', busy: false, error: null, missing: false, loadedAt: 0 };
  const rerender = () => { if (location.hash.split('/')[0] === '#admin') T.viewAdmin(document.getElementById('app')); };
  const DAY = 86400000;

  async function loadStats(key) {
    if (key === 'none' || adm.stats[key]) return;
    try { adm.stats[key] = await A.pilot.stats(key === 'all' ? null : key); }
    catch (e) { adm.stats[key] = { error: true }; }
  }

  async function load() {
    if (adm.busy) return;
    adm.busy = true; adm.error = null; adm.missing = false; adm.stats = {};
    try {
      adm.data = await A.pilot.overview();
      await loadStats(adm.sel);
    } catch (e) {
      if (e.status === 404) adm.missing = true;
      else adm.error = t('Не удалось загрузить данные. Проверь интернет и обнови страницу.');
    }
    adm.busy = false; adm.loadedAt = Date.now();
    rerender();
  }

  /* Строка ученика: сводка прогресса (как на панели учителя) + журнал ответов. */
  function studentRow(s, className) {
    const c = s.state && T.learner.summarize(s.state);
    const sum = c ? T.store.expand(c) : null;
    const total = T.TOPICS.length;
    const known = sum ? T.TOPICS.filter(x => ['mastered', 'inferred'].includes(sum.status[x.id])).length : 0;
    const last = s.last_at ? Date.parse(s.last_at) : null;
    const idle = last && Date.now() - last > 3 * DAY;
    return `<tr>
      <td><b>${esc(s.name || t('Без имени'))}</b>${className ? `<br><span class="muted small">${esc(className)}</span>` : ''}</td>
      <td>${sum && sum.asked ? t('да, {n} вопр.', { n: sum.asked }) : `<span class="muted">${t('нет')}</span>`}</td>
      <td>${sum && sum.rootGaps.length ? sum.rootGaps.map(id => esc(T.TOPIC[id] ? T.TOPIC[id].title : id)).join(', ') : sum && sum.asked ? `<span class="muted">${t('нет')}</span>` : '—'}</td>
      <td>${sum ? `${known} / ${total}` : '—'}</td>
      <td>${s.answers7} / ${s.answers}</td>
      <td>${s.correct_pct === null || s.correct_pct === undefined ? '—' : s.correct_pct + '%'}</td>
      <td>${last ? esc(T.fmtDate(last)) : '—'}${idle ? ` <span class="chip small warn">${t('{n} дн.', { n: Math.floor((Date.now() - last) / DAY) })}</span>` : ''}</td>
    </tr>`;
  }

  T.viewAdmin = function (app) {
    if (!adm.busy && Date.now() - adm.loadedAt > 60000) load();
    const d = adm.data;
    const head = `<section class="result-head">
        <div>
          <p class="eyebrow">${t('Админ-панель')}</p>
          <h1>${t('Все классы и ученики')}</h1>
          <p class="lead">${t('Видно только админам. Учителя видят лишь свои классы, ученики — только себя.')}</p>
        </div>
        ${d ? `<div class="stats">
          <div><b>${d.students.length}</b><span>${t('учеников')}</span></div>
          <div><b>${d.classes.length}</b><span>${t('классов')}</span></div>
          <div><b>${d.students.filter(s => s.answers7 > 0).length}</b><span>${t('занимались за 7 дней')}</span></div>
        </div>` : ''}
      </section>`;

    if (!d) {
      app.innerHTML = head + `<section class="card">
        ${adm.missing ? `<p class="bad-msg">${t('В базе ещё нет админ-панели: выполните supabase/pilot.sql в Supabase.')}</p>`
          : adm.error ? `<p class="bad-msg" role="alert">${esc(adm.error)}</p><button class="btn small" id="adm-reload">${t('Обновить')}</button>`
          : `<p class="muted">${t('Загружаем…')}</p>`}
      </section>`;
      const r = app.querySelector('#adm-reload');
      if (r) r.addEventListener('click', () => { adm.loadedAt = 0; load(); });
      return;
    }

    const nameOf = {};
    d.classes.forEach(c => { nameOf[c.id] = c.name; });
    const loose = d.students.filter(s => !s.classes.length);
    const shown = adm.sel === 'all' ? d.students : adm.sel === 'none' ? loose : d.students.filter(s => s.classes.includes(adm.sel));
    const selClass = d.classes.find(c => c.id === adm.sel);
    const stats = adm.stats[adm.sel];
    const tab = (key, label, n) => `<button class="cls-tab${adm.sel === key ? ' on' : ''}" data-adm="${esc(key)}" aria-pressed="${adm.sel === key}">${label} <span>${n}</span></button>`;

    app.innerHTML = head + `
      <section class="card classes">
        <div class="cls-head"><h2>${t('Классы')}</h2><button class="btn small" id="adm-reload">${t('Обновить')}</button></div>
        ${adm.error ? `<p class="bad-msg small" role="alert">${esc(adm.error)}</p>` : ''}
        <div class="cls-tabs">
          ${tab('all', esc(t('Все ученики')), d.students.length)}
          ${d.classes.map(c => tab(c.id, `${esc(c.name)} <span class="muted">· ${esc(c.teacher)}</span>`, c.students)).join('')}
          ${loose.length ? tab('none', esc(t('Без класса')), loose.length) : ''}
        </div>
        ${!d.classes.length ? `<p class="muted small">${t('Классов пока нет: их создают учителя на своей странице.')}</p>` : ''}
      </section>
      <section class="card">
        <h2>${selClass ? t('Ученики класса «{name}»', { name: esc(selClass.name) }) : adm.sel === 'none' ? t('Ученики без класса') : t('Все ученики')}</h2>
        <p class="muted small">${t('Диагностика — прошёл ли ученик её и сколько было вопросов. Освоено — темы, которые ученик знает или которые засчитаны по более сложным. Ответы — за 7 дней / всего, только у вошедших в аккаунт.')}</p>
        ${shown.length ? `<div class="heat-wrap"><table class="simtable adm-table">
          <thead><tr><th>${t('Ученик')}</th><th>${t('Диагностика')}</th><th>${t('Корневые пробелы')}</th><th>${t('Освоено')}</th><th>${t('Ответов')}</th><th>${t('Верно')}</th><th>${t('Последний раз')}</th></tr></thead>
          <tbody>${shown.map(s => studentRow(s, adm.sel === 'all' ? s.classes.map(id => nameOf[id]).filter(Boolean).join(', ') : '')).join('')}</tbody>
        </table></div>` : `<p class="muted">${t('Здесь пока нет учеников.')}</p>`}
      </section>
      ${adm.sel === 'none' ? '' : `<section class="card">
        <h2>${selClass ? t('Статистика пилота: класс «{name}»', { name: esc(selClass.name) }) : t('Статистика пилота: весь проект')}</h2>
        ${!stats ? `<p class="muted">${t('Загружаем…')}</p>` : stats.error ? `<p class="bad-msg small">${t('Не удалось загрузить статистику.')}</p>` : T.pilotHtml(stats, !selClass)}
      </section>`}`;

    app.querySelector('#adm-reload').addEventListener('click', () => { adm.loadedAt = 0; load(); });
    app.querySelectorAll('[data-adm]').forEach(b => b.addEventListener('click', async () => {
      adm.sel = b.dataset.adm;
      rerender();
      await loadStats(adm.sel);
      rerender();
    }));
  };
})();
