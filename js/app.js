/*
 * Интерфейс: лендинг → диагностика → «Сегодня» (план) → урок → практика с подсказками → повторения.
 * Все строки проходят через функцию t: русский текст служит ключом, казахский перевод лежит в js/kk.js.
 */
(function () {
  const T = window.Tamyr;
  const L = T.learner;
  const t = T.t, plural = T.plural;
  const app = document.getElementById('app');

  const A = T.account;
  const ui = { name: '', goal: 'full', diag: null, lesson: null, session: null, banner: null, confirmReset: false,
    auth: { mode: 'in', email: '', error: null, note: null, busy: false } };
  T.appState = ui;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = id => T.TOPIC[id].title;
  const known = id => Object.prototype.hasOwnProperty.call(T.TOPIC, id);
  const fmtDate = T.fmtDate;
  /* Математика в тексте: «1/2», «√3/2», «x²/2» — дробью в столбик, «(1/2)^x» — степенью. Единицы вроде «км/ч» не трогаем.
     Косая черта остаётся в разметке (скрыта), поэтому копирование и экранный диктор получают «1/2». */
  const ATOM = '(?:√?(?:[0-9]+(?:[.,][0-9]+)?|π|[a-zA-Z])[²³⁰¹⁴-⁹ⁿ⁺⁻]*)+';
  const FRAC = new RegExp('(^|[^0-9a-zA-Zа-яёәғқңөұүһіА-ЯЁӘҒҚҢӨҰҮҺІ)\\]²³⁰¹⁴-⁹ⁿ⁺⁻.,/])(' + ATOM + ')/(' + ATOM + ')(?![0-9a-zA-Z/])', 'g');
  const math = s => esc(s)
    .replace(FRAC, (m, pre, a, b) => `${pre}<span class="frac"><span>${a}</span><i>/</i><span>${b}</span></span>`)
    .replace(/\^(\(?[−-]?[0-9a-zA-Z]+\)?)/g, '<sup>$1</sup>');
  T.math = math;
  const questions = n => `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}`;

  const statusLabel = st => ({
    unknown: t('Не проверялось'), gap: t('Пробел'), learning: t('Изучаю'), inferred: t('Засчитано'),
    mastered: t('Освоено'), solid: t('Закреплено'), risk: t('Под угрозой')
  }[st]);

  /* keys — какие статусы показать (панель учителя видит только статусы из кода ученика). */
  function legendHtml(keys) {
    return '<ul class="legend">' + T.LEGEND.filter(([k]) => !keys || keys.includes(k)).map(([k, v]) => `<li><span class="sw sw-${k}"></span>${v}</li>`).join('') + '</ul>';
  }
  T.esc = esc;
  T.legendHtml = legendHtml;

  /* Что можно сделать с темой прямо сейчас. */
  function actionFor(id) {
    const st = L.topic(id).st;
    if (st === 'gap') return { href: '#lesson/' + id, label: t('Урок') };
    if (st === 'learning') return { href: '#practice/' + id, label: t('Практика') };
    return { href: '#check/' + id, label: st === 'inferred' ? t('Подтвердить') : st === 'unknown' ? t('Проверить') : t('Повторить') };
  }

  /* Название и объяснение задачи плана: модель ученика отдаёт только причину. */
  function taskText(task) {
    switch (task.reason) {
      case 'due': return [t('Повторение'), t('Пора повторить, пока не забылось')];
      case 'flagged': return [t('Проверка'), t('Ошибка в практике указала на эту тему')];
      case 'base': return [t('Проверка основы'), t('На ней стоит «{topic}» — убедимся, что корень не глубже', { topic: title(task.base) })];
      case 'practice': return [t('Практика'), t('Нужно {n} верных подряд без подсказок', { n: L.NEED })];
      case 'lesson': return [t('Урок'), t('Корневой пробел — с него начинаем')];
      case 'confirm': return [t('Подтвердить'), t('Засчитана без вопросов — проверим двумя задачами')];
      default: return [t('Новая тема'), t('Основа готова — проверим, знаешь ли ты её уже')];
    }
  }

  /* ---------- Лендинг ---------- */
  function viewLanding() {
    app.innerHTML = `
      <section class="hero">
        <div class="hero-text">
        <p class="eyebrow">${t('Подготовка к ЕНТ · математика')}</p>
        <h1>${t('Не «повтори всё».<br>А с чего начать именно тебе.')}</h1>
        <p class="lead">${t('Tamyr находит тему, из-за которой сыплются остальные, объясняет её по шагам и возвращается к ней, пока она не закрепится. Каждый день — короткий план, собранный под твои ошибки.')}</p>
        <div class="cta">
          <a class="btn primary" href="#start">${t('Найти мой корень')}</a>
          <a class="btn" href="#demo">${t('Посмотреть на примере')}</a>
          ${teacherOk() ? `<a class="btn ghost" href="#teacher">${t('Панель учителя')}</a>` : ''}
        </div>
        <ul class="facts"><li><b>${T.TOPICS.length}</b> ${t('тем ЕНТ на одной карте')}</li><li><b>RU · KZ</b> ${t('два языка')}</li><li><b>${t('Бесплатно')}</b> ${t('и работает без интернета')}</li></ul>
        </div>
        ${heroArt()}
      </section>
      <section class="how">
        <div class="step"><span>1</span><h3>${t('Диагноз')}</h3><p>${t('Начинаем со сложной темы и спускаемся вниз только там, где ты ошибаешься. Неверный ответ показывает, какая именно ошибка мышления за ним стоит.')}</p></div>
        <div class="step"><span>2</span><h3>${t('Урок и практика')}</h3><p>${t('Правило, разбор примера по шагам и задачи с подсказками. После ошибки — объяснение именно твоей ошибки, а не просто «неверно».')}</p></div>
        <div class="step"><span>3</span><h3>${t('Закрепление')}</h3><p>${t('Освоенная тема возвращается через день, потом через три, потом через девять. Знание остаётся до экзамена, а не до вечера.')}</p></div>
      </section>
      <p class="muted small">${t('Прототип. Внутри {n} тем — по каждой из 18 тем спецификации ЕНТ по математике есть хотя бы одна, но только на базовом уровне и без чертежей.', { n: T.TOPICS.length })}</p>`;
  }

  /* Иллюстрация на лендинге: пробел в корне (Дроби) тянет вверх ошибки в темах, которые на нём стоят. */
  function heroArt() {
    const N = [['parab', 330, 34, 'unknown'], ['word', 110, 118, 'risk'], ['quad', 330, 118, 'risk'], ['pct', 70, 206, 'gap'],
      ['prop', 210, 206, 'gap'], ['lin', 350, 206, 'gap'], ['frac', 210, 292, 'root'], ['arith', 210, 372, 'ok']];
    const at = {}; N.forEach(([id, x, y]) => { at[id] = [x, y]; });
    const E = [['arith', 'frac', 'ok'], ['frac', 'pct', 'bad'], ['frac', 'prop', 'bad'], ['frac', 'lin', 'bad'], ['pct', 'word', 'bad'],
      ['prop', 'word', 'bad'], ['lin', 'word', 'bad'], ['lin', 'quad', 'bad'], ['quad', 'parab', '']];
    const edge = ([a, b, k], i) => {
      const [x1, y1] = at[a], [x2, y2] = at[b], ya = y1 - 20, yb = y2 + 20, my = (ya + yb) / 2;
      return `<path class="h-edge ${k}" style="--d:${i * 0.12}s" d="M${x1},${ya} C${x1},${my} ${x2},${my} ${x2},${yb}"/>`;
    };
    return `<svg class="hero-art" viewBox="0 0 440 400" role="img" aria-label="${t('Пробел в дробях тянет за собой ошибки в темах выше')}">
      ${E.map(edge).join('')}
      <circle class="h-pulse" cx="210" cy="292" r="34"/>
      ${N.map(([id, x, y, k], i) => `<g transform="translate(${x - 62},${y - 20})"><g class="h-node ${k}" style="--d:${0.3 + (7 - i) * 0.08}s"><rect width="124" height="40" rx="11"/><text x="62" y="26">${esc(T.TOPIC[id].short)}</text></g></g>`).join('')}
      <g transform="translate(286,318)"><g class="h-tag"><rect width="128" height="28" rx="14"/><text x="64" y="19">${t('корень пробела')}</text></g></g>
    </svg>`;
  }

  /* ---------- Старт ---------- */
  // какие цели диагностики предлагать и в каком порядке (остальные остаются доступны движку и тестам)
  const START_GOALS = ['full', 'all', 'alg2', 'calc', 'geom', 'quad'];
  function viewStart() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>${t('С чего начнём?')}</h1>
        <p class="muted">${t('Диагностика — от нескольких вопросов до нескольких десятков: чем больше пробелов, тем глубже спускаемся. Её можно остановить в любой момент — план построится по тому, что уже известно. Не знаешь ответ — жми «Не знаю»: угадывание портит карту.')}</p>
        ${L.exists() ? `<p class="note">${t('Новая диагностика заменит текущий прогресс.')}</p>` : ''}
        <form id="start-form">
          <label class="field"><span>${t('Имя')}</span><input id="name" required maxlength="40" autocomplete="given-name" value="${esc(ui.name || (L.exists() ? L.get().name : A.user() ? A.user().name : ''))}" placeholder="${t('Например, Айгерим')}"></label>
          <fieldset class="goals"><legend>${t('Что проверяем?')}</legend>
            ${START_GOALS.map(id => T.GOALS.find(g => g.id === id)).filter(Boolean).map(g => `<label class="goal"><input type="radio" name="goal" value="${g.id}" ${g.id === ui.goal ? 'checked' : ''}><span><b>${g.title}</b><small>${g.desc}</small></span></label>`).join('')}
            <label class="goal"><input type="radio" name="goal" value="none" ${ui.goal === 'none' ? 'checked' : ''}><span><b>${t('Без диагностики')}</b><small>${t('Начать с основ: каждая тема проверяется двумя задачами по ходу')}</small></span></label>
          </fieldset>
          <button class="btn primary" type="submit">${t('Начать')}</button>
        </form>
      </section>`;
    app.querySelector('#start-form').addEventListener('submit', e => {
      e.preventDefault();
      ui.name = app.querySelector('#name').value.trim() || t('Ученик');
      ui.goal = app.querySelector('input[name=goal]:checked').value;
      if (ui.goal === 'none') {
        L.startBlank(ui.name);
        ui.banner = t('Начинаем с основ. Каждую тему сначала проверим двумя задачами: знаешь — идём выше, нет — разберём.');
        location.hash = '#home';
        return;
      }
      ui.diag = new T.Diagnostic(T.GOALS.find(g => g.id === ui.goal).start);
      location.hash = '#quiz';
    });
  }

  /* ---------- Диагностика ---------- */
  function reasonText(r) {
    if (!r) return '';
    if (r.kind === 'goal') return t('Целевая тема');
    if (r.kind === 'prereq') return t('Проверяем основу темы «{topic}»', { topic: title(r.from) });
    if (r.kind === 'mis') return t('Твой ответ в теме «{topic}» похож на ошибку из этой темы', { topic: title(r.from) });
    return '';
  }

  function viewQuiz() {
    const d = ui.diag;
    if (!d) { location.hash = '#start'; return; }
    const cur = d.next();
    if (!cur) return finishDiagnostic();
    const status = {};
    T.TOPICS.forEach(tp => { status[tp.id] = d.state[tp.id].status; });
    app.innerHTML = `
      <section class="quiz">
        <div class="qcard card">
          <div class="qmeta"><span class="chip">${esc(title(cur.topic))}</span><span class="muted">${t('Вопрос {n}', { n: d.log.length + 1 })}</span></div>
          <p class="why">${esc(reasonText(cur.reason))}</p>
          <h2 class="qtext">${math(cur.question.text)}</h2>
          <div class="options">
            ${cur.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="key">${'АБВГ'[i]}</span><span>${math(o.t)}</span></button>`).join('')}
          </div>
          <div class="row">
            <button class="btn ghost" data-i="skip">${t('Не знаю')}</button>
            ${d.log.length >= 6 ? `<button class="btn ghost" id="stop">${t('Хватит, показать план')}</button>` : ''}
          </div>
        </div>
        <aside class="card side">
          <h3>${t('Карта заполняется')}</h3>
          <div id="mini-graph"></div>
        </aside>
      </section>`;
    T.renderGraph(app.querySelector('#mini-graph'), status, { current: cur.topic });
    const shown = Date.now();
    app.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
      const opt = b.dataset.i === 'skip' ? null : cur.options[Number(b.dataset.i)];
      logAnswer('diag', cur.topic, cur.question, opt, 0, shown);
      d.answer(b.dataset.i === 'skip' ? null : Number(b.dataset.i));
      viewQuiz();
    }));
    const stop = app.querySelector('#stop');
    if (stop) stop.addEventListener('click', finishDiagnostic);
  }

  /* Один ответ — в журнал (только у вошедших). choice — номер варианта в банке, а не на экране: так ответы сравнимы между учениками. */
  function logAnswer(mode, topic, q, opt, hints, shown) {
    A.logAnswer({ mode, topic, question: q.gen ? 'gen:' + topic : q.id, choice: opt ? q.options.indexOf(opt) : null,
      correct: !!(opt && opt.ok), mis: opt && opt.mis ? opt.mis : null, hints, ms: Math.min(3600000, Date.now() - shown) });
  }

  function finishDiagnostic() {
    const res = ui.diag.result();
    L.fromDiagnostic(ui.name, res);
    ui.diag = null;
    const q = questions(res.asked);
    ui.banner = res.rootGaps.length
      ? t('Диагностика готова: {q}. {rw} — <b>{roots}</b>. Начинаем снизу: пока корень не закрыт, темы выше будут сыпаться.',
        { q, rw: res.rootGaps.length === 1 ? 'Корень' : 'Корни', roots: res.rootGaps.map(id => esc(title(id))).join(', ') })
      : t('Диагностика готова: {q}, пробелов не найдено. Дальше подтверждаем темы, засчитанные без вопросов, и идём выше.', { q });
    location.hash = '#home';
  }

  /* ---------- Сегодня ---------- */
  function statsHtml() {
    const c = L.counts(), s = L.streakDays();
    return `<div class="stats">
      <div class="ring-stat"><svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15.9"/><circle class="ring-fg" cx="18" cy="18" r="15.9" pathLength="100" style="stroke-dasharray:${L.readiness()} 100"/></svg><span><b>${L.readiness()}%</b><span>${t('готовность по карте тем')}</span></span></div>
      <div><b>${c.done}<small>/${T.TOPICS.length}</small></b><span>${t('тем освоено')}</span></div>
      <div><b>${s}</b><span>${t('{d} подряд', { d: plural(s, 'день', 'дня', 'дней') })}</span></div>
    </div>`;
  }

  function viewHome() {
    const tasks = L.today(), roots = L.roots(), open = L.openTopics(), status = L.statusMap();
    const total = tasks.reduce((n, x) => n + x.min, 0);
    const risk = T.TOPICS.filter(tp => status[tp.id] === 'risk').length;
    const themes = n => plural(n, 'тема', 'темы', 'тем');
    let lead;
    if (tasks[0] && tasks[0].base) {
      lead = t('Пробел найден в теме <b>{gap}</b>, но сначала проверим её основу — <b>{base}</b>: корень может быть глубже.',
        { gap: esc(title(tasks[0].base)), base: esc(title(tasks[0].topic)) });
    } else if (roots.length) {
      const dep = T.descendants(roots[0]).size;
      lead = t('Начинаем с корня: <b>{topic}</b>.', { topic: esc(title(roots[0])) })
        + (dep ? t(' На нём {hold} ещё {n} {themes}.', { hold: plural(dep, 'держится', 'держатся', 'держится'), n: dep, themes: themes(dep) }) : '');
    } else if (tasks.length) lead = t('Пробелов в работе нет — проверяем следующую тему и идём выше.');
    else lead = t('На сегодня всё сделано.');
    const nextDue = L.nextDue();
    // для каждого корня — какие темы в работе на нём стоят
    const traces = roots.map(r => ({ root: r, above: open.filter(id => id !== r && T.ancestors(id).has(r)) })).filter(x => x.above.length);
    const PATH_MAX = 6, more = open.length - PATH_MAX;

    app.innerHTML = `
      <section class="result-head">
        <div>
          <p class="eyebrow">${t('Сегодня · {date}', { date: fmtDate(L.now()) })}</p>
          <h1>${t('Привет, {name}', { name: esc(L.get().name) })}</h1>
          <p class="lead">${lead}</p>
        </div>
        ${statsHtml()}
      </section>
      ${ui.banner ? `<p class="banner">${ui.banner}</p>` : ''}
      <section class="grid2">
        <div class="col">
        <div class="card">
          <h2>${t('План на сегодня')} ${tasks.length ? `<span class="muted small">≈ ${total} ${t('мин')}</span>` : ''}</h2>
          ${tasks.length ? `<ol class="tasks">${tasks.map((task, i) => {
            const [label, why] = taskText(task);
            return `
            <li>
              <div><span class="chip small k-${task.kind}">${label}</span> <b>${esc(title(task.topic))}</b><span class="fix">${esc(why)} · ${task.min} ${t('мин')}</span></div>
              <a class="btn small ${i === 0 ? 'primary' : ''}" href="#${task.kind}/${task.topic}">${i === 0 ? t('Начать') : t('Открыть')}</a>
            </li>`;
          }).join('')}</ol>`
          : `<p class="muted">${t('Все темы на сегодня закрыты.')} ${nextDue ? t('Следующее повторение — {date}.', { date: fmtDate(nextDue) }) : ''}</p><a class="btn small" href="#map">${t('Открыть карту')}</a>`}
        </div>
          <div class="card map-card"><h2>${t('Карта знаний')}</h2><div id="home-graph"></div><a class="btn small" href="#map">${t('Открыть карту')}</a></div>
        </div>
        <div class="col">
          ${open.length ? `<div class="card"><h2>${t('Твой путь: снизу вверх')}</h2><ol class="plan">${open.slice(0, PATH_MAX).map(id => {
            const a = actionFor(id), lock = L.locked(id);
            return `<li class="${L.topic(id).st}"><span>${esc(title(id))} <small class="muted">${statusLabel(L.topic(id).st).toLowerCase()}</small></span>${lock ? `<span class="lock" title="${t('после предыдущих')}" aria-label="${t('после предыдущих')}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></span>` : `<a class="btn small" href="${a.href}">${a.label}</a>`}</li>`;
          }).join('')}</ol>
            ${more > 0 ? `<p class="muted small">${t('И ещё {n} {themes} выше — они откроются по мере продвижения.', { n: more, themes: themes(more) })}</p>` : ''}
            ${risk ? `<p class="muted small">${t('{n} {themes} над пробелами ещё не {checked} — дойдём до них, когда основа будет готова.', { n: risk, themes: themes(risk), checked: plural(risk, 'проверялась', 'проверялись', 'проверялись') })}</p>` : ''}</div>` : ''}
          ${traces.length ? `<div class="card"><h2>${t('Откуда растут ошибки')}</h2><ul class="traces">${traces.map(x => `<li><span class="root">${esc(title(x.root))}</span><span class="arrow">${t('держит:')}</span><span>${x.above.map(id => esc(T.TOPIC[id].short)).join(', ')}</span></li>`).join('')}</ul></div>` : ''}
        </div>
      </section>`;
    ui.banner = null;
    T.renderGraph(app.querySelector('#home-graph'), status, { rootGaps: roots });
  }

  /* ---------- Урок ---------- */
  function viewLesson(id, fresh) {
    if (fresh || !ui.lesson || ui.lesson.topic !== id) ui.lesson = { topic: id, shown: 1 };
    const tp = T.TOPIC[id], les = T.LESSONS[id], shown = ui.lesson.shown, done = shown >= les.steps.length;
    const above = [...T.descendants(id)].map(title);
    const mine = Object.keys(L.get().mis).filter(k => T.MISCONCEPTIONS[k].home === id).map(k => T.MISCONCEPTIONS[k]);
    const traps = mine.length ? mine : Object.values(T.MISCONCEPTIONS).filter(m => m.home === id).slice(0, 3);
    const why = above.length ? t('Зачем: на этой теме {hold} {list}{more}.', {
      hold: plural(above.length, 'держится', 'держатся', 'держатся'), list: esc(above.slice(0, 4).join(', ')),
      more: above.length > 4 ? t(' и ещё {n}', { n: above.length - 4 }) : ''
    }) : '';
    app.innerHTML = `
      <section class="card narrow lesson">
        <p class="eyebrow">${t('Урок · шаг {a} из {b}', { a: Math.min(shown, les.steps.length), b: les.steps.length })}</p>
        <h1>${esc(tp.title)}</h1>
        ${why ? `<p class="muted">${why}</p>` : ''}
        <div class="rule"><h3>${t('Правило')}</h3><p>${math(tp.rule)}</p></div>
        <div class="worked">
          <h3>${t('Разбор по шагам')}</h3>
          <p class="task">${math(les.task)}</p>
          <ol class="steps">${les.steps.slice(0, shown).map(([say, m]) => `<li><span class="say">${math(say)}</span><span class="m">${math(m)}</span></li>`).join('')}</ol>
          ${done ? `<p class="takeaway">${math(les.takeaway)}</p>` : `<p class="muted small">${t('Сначала подумай, что сделаешь дальше, — потом открой шаг.')}</p><button class="btn" id="more">${t('Следующий шаг')}</button>`}
        </div>
        ${done ? `
          <div class="traps"><h3>${mine.length ? t('Твои ошибки в этой теме') : t('Частые ловушки')}</h3><ul>${traps.map(m => `<li><b>${esc(m.title)}.</b> ${math(m.fix)}</li>`).join('')}</ul></div>
          <button class="btn primary" id="go">${t('Теперь ты: практика')}</button>` : ''}
        <a class="btn ghost" href="#home">${t('На главную')}</a>
      </section>`;
    const more = app.querySelector('#more');
    if (more) more.addEventListener('click', () => { ui.lesson.shown++; viewLesson(id); });
    const go = app.querySelector('#go');
    if (go) go.addEventListener('click', () => { L.completeLesson(id); location.hash = '#practice/' + id; });
  }

  /* ---------- Практика и проверка ---------- */
  function newQuestion(s) {
    s.q = T.nextQuestion(s.topic, L.topic(s.topic).seen);
    s.opts = T.shuffle(s.q.options, Math.random);
    s.hints = 0; s.answered = null; s.flagged = null; s.ai = null; s.shown = Date.now();
  }

  function viewSession(mode, id) {
    if (!ui.session || ui.session.mode !== mode || ui.session.topic !== id || ui.session.done) {
      ui.session = { mode, topic: id, n: 0, right: 0, wrongRow: 0, mastered: false, done: false };
      newQuestion(ui.session);
    }
    renderSession();
  }

  function pips(n) {
    return `<span class="pips" title="${t('Верных подряд без подсказок')}">${Array.from({ length: L.NEED }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function renderSession() {
    const s = ui.session, tp = T.TOPIC[s.topic], sol = T.solutionOf(s.q), a = s.answered;
    const practice = s.mode === 'practice';
    const progress = practice ? pips(s.mastered ? L.NEED : L.topic(s.topic).streak)
      : `<span class="muted">${t('Вопрос {a} из {b}', { a: Math.min(s.n + (a ? 0 : 1), L.CHECK_SIZE), b: L.CHECK_SIZE })}</span>`;
    const hints = [];
    if (s.hints >= 1) hints.push(`<p><b>${t('Правило.')}</b> ${math(tp.rule)}</p>`);
    if (s.hints >= 2 && sol.length) hints.push(`<p><b>${t('Первый шаг.')}</b> ${math(sol[0])}</p>`);
    if (s.hints >= 3 && sol.length > 1) hints.push(`<p><b>${t('Дальше.')}</b></p><ol class="steps">${sol.slice(1).map(x => `<li><span class="m">${math(x)}</span></li>`).join('')}</ol>`);
    const hintLabel = [t('Подсказка'), t('Ещё подсказка'), t('Показать решение'), t('Подсказки кончились')][s.hints];

    let feedback = '';
    if (a) {
      const m = a.opt && a.opt.mis ? T.MISCONCEPTIONS[a.opt.mis] : null;
      const last = practice ? s.mastered : s.n >= L.CHECK_SIZE;
      const nextLabel = last ? (practice ? t('Завершить тему') : t('Итог')) : (practice ? t('Следующая задача') : t('Следующий вопрос'));
      feedback = `<div class="feedback ${a.ok ? 'good' : 'bad'}">
        ${a.ok ? `<p class="ok-msg">${t('Верно!')}${practice && s.hints >= 2 ? ` <span class="muted small">${t('С подсказкой — в серию не идёт. Следующую попробуй без неё.')}</span>` : ''}</p>`
          : `<p class="bad-msg">${a.opt ? t('Неверно.') : t('Ничего страшного.')} ${t('Правильный ответ: <b>{a}</b>.', { a: math(s.opts.find(o => o.ok).t) })}</p>`}
        ${m ? `<p><b>${t('Похоже на типичную ошибку:')}</b> ${esc(m.title[0].toLowerCase() + m.title.slice(1))}. ${math(m.fix)}</p>` : ''}
        ${s.flagged ? `<p class="note">${t('Эта ошибка родом из темы «{topic}» — она поставлена на проверку сегодня.', { topic: esc(title(s.flagged)) })}</p>` : ''}
        ${a.ok ? '' : aiBox(s)}
        ${sol.length ? `<h3>${t('Разбор')}</h3><ol class="steps">${sol.map(x => `<li><span class="m">${math(x)}</span></li>`).join('')}</ol>` : ''}
        <div class="row">
          <button class="btn primary" id="next">${nextLabel}</button>
          ${practice && s.wrongRow >= 2 ? `<a class="btn" href="#lesson/${s.topic}">${t('Вернуться к уроку')}</a>` : ''}
        </div>
      </div>`;
    }

    app.innerHTML = `
      <section class="card narrow session">
        <div class="qmeta"><span class="chip">${esc(tp.title)}</span>${progress}</div>
        <p class="why">${practice ? t('Практика: {n} верных подряд без подсказок — и тема освоена', { n: L.NEED }) : t('Проверка без подсказок: два вопроса')}</p>
        <h2 class="qtext">${math(s.q.text)}</h2>
        <div class="options">${s.opts.map((o, i) => `<button class="opt ${a && o.ok ? 'is-ok' : ''} ${a && a.idx === i && !o.ok ? 'is-bad' : ''}" data-i="${i}" ${a ? 'disabled' : ''}><span class="key">${'АБВГ'[i]}</span><span>${math(o.t)}</span></button>`).join('')}</div>
        ${a ? '' : `<div class="row">
          ${practice ? `<button class="btn small" id="hint" ${s.hints >= 3 ? 'disabled' : ''}>${hintLabel}</button>` : ''}
          <button class="btn ghost small" id="skip">${t('Не знаю')}</button>
        </div>`}
        ${hints.length && !a ? `<div class="hintbox">${hints.join('')}</div>` : ''}
        ${feedback}
        <a class="btn ghost small" href="#home">${t('На главную')}</a>
      </section>`;

    const answer = idx => {
      const opt = idx === null ? null : s.opts[idx];
      const ok = !!(opt && opt.ok);
      s.answered = { idx, ok, opt };
      logAnswer(s.mode, s.topic, s.q, opt, s.hints, s.shown);
      s.n++;
      if (ok) s.right++;
      s.flagged = L.recordAnswer(s.topic, s.q, ok ? null : opt);
      if (practice) {
        s.mastered = L.practiceAnswer(s.topic, ok, s.hints < 2);
        s.wrongRow = ok ? 0 : s.wrongRow + 1;
      }
      renderSession();
    };
    if (!a) {
      app.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.i))));
      app.querySelector('#skip').addEventListener('click', () => answer(null));
      const hint = app.querySelector('#hint');
      if (hint) hint.addEventListener('click', () => { s.hints++; renderSession(); });
    } else {
      const ask = app.querySelector('#ai-ask');
      if (ask) ask.addEventListener('click', () => explainMistake(s, tp, sol));
      app.querySelector('#next').addEventListener('click', () => {
        if (practice ? s.mastered : s.n >= L.CHECK_SIZE) return finishSession();
        newQuestion(s);
        renderSession();
      });
    }
  }

  /* «Объясни мою ошибку»: ИИ (Claude) объясняет именно выбранный неверный ответ. Только для вошедших — на сервере лимит в день. */
  function aiBox(s) {
    if (!A.enabled || !T.CONFIG.ai) return '';
    if (!A.user()) return `<p class="muted small">${t('<a href="#account">Войди</a>, и ИИ объяснит именно твою ошибку.')}</p>`;
    const ai = s.ai;
    if (ai && ai.text) {
      return `<div class="ai-box"><p class="ai-head"><span class="ai-spark" aria-hidden="true">✦</span> ${t('Объяснение Tamyr AI')}</p>
        ${ai.text.split(/\n+/).map(p => `<p>${math(p)}</p>`).join('')}
        <p class="muted tiny">${t('Объяснение написал ИИ — он может ошибаться. Правильный ответ и разбор ниже проверены.')}</p></div>`;
    }
    if (ai === 'loading') return `<div class="ai-box loading" role="status"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span> ${t('Tamyr AI разбирает твой ответ…')}</div>`;
    const err = ai && ai.error ? `<p class="bad-msg small" role="alert">${esc(ai.error)}</p>` : '';
    if (ai && ai.limit) return err;
    return `${err}<button class="btn ai-btn" id="ai-ask"><span class="ai-spark" aria-hidden="true">✦</span> ${ai && ai.error ? t('Попробовать ещё раз') : t('Объясни мою ошибку')}</button>`;
  }

  async function explainMistake(s, tp, sol) {
    const a = s.answered, m = a.opt && a.opt.mis ? T.MISCONCEPTIONS[a.opt.mis] : null, q = s.q;
    s.ai = 'loading'; renderSession();
    let result;
    try {
      result = { text: await A.explain({
        lang: T.lang, topic: tp.title, rule: tp.rule, question: q.text, options: s.opts.map(o => o.t),
        correct: s.opts.find(o => o.ok).t, chosen: a.opt ? a.opt.t : null,
        mistake: m ? { title: m.title, fix: m.fix } : null, solution: sol
      }) };
    } catch (e) {
      result = e.status === 429 ? { limit: true, error: t('На сегодня объяснения ИИ закончились — завтра будут новые. Разбор ниже всегда доступен.') }
        : e.kind === 'network' ? { error: t('Нет связи с сервером. Проверь интернет и попробуй ещё раз.') }
        : e.kind === 'auth' ? { error: t('Нужно войти заново, чтобы получить объяснение.') }
        : { error: t('Не получилось получить объяснение. Попробуй ещё раз чуть позже.') };
    }
    if (ui.session !== s || s.q !== q) return; // ученик уже ушёл к другой задаче
    s.ai = result;
    renderSession();
  }

  function finishSession() {
    const s = ui.session, id = s.topic;
    s.done = true;
    let head, text;
    if (s.mode === 'practice') {
      head = t('Тема освоена ✓');
      const x = L.topic(id); // когда повторять, решила модель забывания: после ошибок — завтра, без ошибок — позже
      text = t('{n} задачи подряд без подсказок. Повторим тему {when} — так она останется в памяти до экзамена.', { n: L.NEED, when: x.ivl <= 1 ? t('завтра') : fmtDate(x.due) });
    } else {
      const pass = L.checkResult(id, s.right), x = L.topic(id);
      head = pass ? (x.st === 'solid' ? t('Закреплено ✓') : t('Подтверждено ✓')) : t('Тема вернулась в работу');
      text = pass ? t('Оба ответа верны. Следующее повторение через {n} {days} — {date}.', { n: x.ivl, days: plural(x.ivl, 'день', 'дня', 'дней'), date: fmtDate(x.due) })
        : t('Верно {a} из {b}. Это нормально: лучше узнать сейчас, чем на экзамене. Тема добавлена в план.', { a: s.right, b: L.CHECK_SIZE });
    }
    const next = L.today()[0];
    const win = s.mode === 'practice' || L.topic(id).st === 'mastered' || L.topic(id).st === 'solid';
    const above = T.TOPICS.filter(x => x.prereq.includes(id)).map(x => esc(x.short));
    app.innerHTML = `
      <section class="card narrow center finish ${win ? 'win' : ''}">
        ${win ? `<div class="medal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>` : ''}
        <p class="eyebrow">${esc(title(id))}</p>
        <h1>${head}</h1>
        <p class="lead">${text}</p>
        ${win && above.length ? `<p class="unlocks"><span class="muted small">${t('Эта тема — опора для:')}</span> ${above.map(x => `<span class="chip">${x}</span>`).join(' ')}</p>` : ''}
        ${next ? `<a class="btn primary" href="#${next.kind}/${next.topic}">${t('Дальше: {label} · {topic}', { label: taskText(next)[0].toLowerCase(), topic: esc(title(next.topic)) })}</a>` : `<p>${t('На сегодня план выполнен.')}</p>`}
        <a class="btn ghost" href="#home">${t('На главную')}</a>
      </section>`;
    if (win) confetti();
  }

  /* Короткий салют при освоении темы. Без анимаций, если человек их отключил в системе. */
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    const colors = ['var(--accent)', 'var(--ok)', 'var(--risk)', 'var(--learn)', 'var(--gap)'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${50 + (Math.random() - 0.5) * 30}%;background:${colors[i % colors.length]};--x:${(Math.random() - 0.5) * 760}px;--y:${-260 - Math.random() * 300}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 0.15}s`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  /* ---------- Карта ---------- */
  function viewMap() {
    // До диагностики карта всё равно открывается — все темы серые, рядом кнопки, чтобы её раскрасить.
    if (!L.exists()) {
      app.innerHTML = `
        <section class="card">
          <h1>${t('Карта знаний')}</h1>
          <p class="muted">${t('Это карта всех тем ЕНТ: основа внизу, сложные темы наверху. Пройди диагностику — и карта раскрасится: что ты уже знаешь, где пробел и с чего начать.')}</p>
          <div class="cta map-cta"><a class="btn primary" href="#start">${t('Найти мой корень')}</a><a class="btn" href="#demo">${t('Посмотреть на примере')}</a></div>
          <div id="map-graph"></div>
        </section>`;
      return T.renderGraph(app.querySelector('#map-graph'), {});
    }
    const status = L.statusMap();
    const due = new Set(T.TOPICS.filter(tp => L.isDue(tp.id)).map(tp => tp.id));
    app.innerHTML = `
      <section class="card">
        <h1>${t('Карта знаний')}</h1>
        <p class="muted">${t('Основа внизу, сложные темы наверху. Нажми на тему, чтобы открыть урок, практику или проверку.')}</p>
        <div id="map-graph"></div>
        ${legendHtml()}
      </section>`;
    T.renderGraph(app.querySelector('#map-graph'), status, { rootGaps: L.roots(), due, onClick: id => { location.hash = actionFor(id).href; } });
  }

  /* ---------- Прогресс ---------- */
  /* Код «ученик → учитель» в формате Tamyr: панель учителя знает только статусы диагностики,
     поэтому «изучаю» передаём как пробел, «закреплено» — как освоено. */
  function shareCode() {
    const S = L.get(), map = L.statusMap(), status = {};
    T.TOPICS.forEach(tp => { status[tp.id] = { learning: 'gap', solid: 'mastered' }[map[tp.id]] || map[tp.id]; });
    const misconceptions = Object.entries(S.mis).map(([id, count]) => ({ id, count }));
    return T.store.encode(T.store.compact(S.name, 'full', { status, rootGaps: L.roots(), misconceptions, asked: S.diag ? S.diag.asked : 0 }));
  }

  /* В истории хранится только вид события — текст подставляется на текущем языке. */
  function logText(e) {
    return {
      diag: t('диагностика нашла корневой пробел'), lesson: t('урок пройден'), mastered: t('тема освоена'),
      review: t('проверка пройдена'), solid: t('закреплено'), lapse: t('проверка не пройдена — тема вернулась в работу')
    }[e.kind] || '';
  }

  function viewProgress() {
    const S = L.get();
    const mis = Object.entries(S.mis).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const log = S.log.slice(-12).reverse();
    const mem = L.memory();
    app.innerHTML = `
      <section class="result-head">
        <div><p class="eyebrow">${t('Прогресс')}</p><h1>${esc(S.name)}</h1>
          <p class="lead">${S.diag ? t('Диагностика {date}: {q}, корней найдено: {r}.', { date: fmtDate(S.diag.at), q: questions(S.diag.asked), r: S.diag.roots.length }) : t('Без входной диагностики: темы проверяются по ходу.')}</p></div>
        ${statsHtml()}
      </section>
      ${A.enabled && !A.user() ? `<p class="banner">${t('Прогресс хранится только на этом устройстве. <a href="#account">Создай аккаунт</a>, чтобы не потерять его.')}</p>` : ''}
      <section class="grid2">
        <div class="card">
          <h2>${t('Твои типичные ошибки')}</h2>
          ${mis.length ? `<ul class="mis">${mis.map(([id, n]) => { const m = T.MISCONCEPTIONS[id]; return `<li><b>${esc(m.title)}</b>${n > 1 ? ` <span class="chip small">×${n}</span>` : ''}<span class="fix">${esc(m.fix)} · ${t('тема «{topic}»', { topic: esc(title(m.home)) })}</span></li>`; }).join('')}</ul>` : `<p class="muted">${t('Пока не замечено ни одной типичной ошибки.')}</p>`}
        </div>
        <div class="col">
          ${mem.length ? `<div class="card"><h2>${t('Память по темам')}</h2>
            <p class="muted small">${t('Насколько вероятно, что ты вспомнишь тему сегодня. Модель забывания (FSRS) ставит повторение на день, когда вероятность падает до 90%.')}</p>
            <ul class="memory">${mem.slice(0, 6).map(x => { const pc = Math.round(100 * x.recall); return `<li><span>${esc(title(x.id))}</span><span class="mbar"><i style="width:${pc}%" class="${pc < 90 ? 'low' : ''}"></i></span><b>${pc}%</b><span class="muted small">${x.due <= L.now() ? t('пора повторить') : t('повтор {date}', { date: fmtDate(x.due) })}</span></li>`; }).join('')}</ul></div>` : ''}
          <div class="card">
            <h2>${t('История')}</h2>
            ${log.length ? `<ul class="log">${log.map(e => `<li class="e-${e.kind}"><span class="muted small">${fmtDate(e.t)}</span><span><b>${esc(title(e.topic))}</b> — ${esc(logText(e))}</span></li>`).join('')}</ul>` : `<p class="muted">${t('Здесь появятся пройденные уроки и освоенные темы.')}</p>`}
          </div>
          <div class="card">
            <h2>${t('Отправить учителю')}</h2>
            <p class="muted small">${t('Код содержит только имя и текущие статусы тем. Учитель вставит его в своей панели и увидит карту класса.')}</p>
            <textarea id="share" readonly rows="3">${esc(shareCode())}</textarea>
            <button class="btn small" id="copy">${t('Скопировать код')}</button>
          </div>
          <div class="card">
            <h2>${t('Управление')}</h2>
            <p class="muted small">${t('Перемотка нужна, чтобы показать интервальные повторения, не дожидаясь завтра. Сейчас в приложении {date}.', { date: fmtDate(L.now()) })}</p>
            <div class="row">
              <button class="btn small" id="adv1">${t('Демо: +1 день')}</button>
              <button class="btn small" id="adv3">${t('+3 дня')}</button>
              <a class="btn small" href="#start">${t('Диагностика заново')}</a>
              <button class="btn small danger" id="reset">${ui.confirmReset ? t('Точно сбросить?') : t('Сбросить прогресс')}</button>
            </div>
          </div>
        </div>
      </section>`;
    app.querySelector('#copy').addEventListener('click', async e => {
      const ta = app.querySelector('#share');
      try { await navigator.clipboard.writeText(ta.value); } catch (err) { ta.select(); document.execCommand('copy'); }
      e.target.textContent = t('Скопировано');
    });
    app.querySelector('#adv1').addEventListener('click', () => { L.advance(1); location.hash = '#home'; });
    app.querySelector('#adv3').addEventListener('click', () => { L.advance(3); location.hash = '#home'; });
    app.querySelector('#reset').addEventListener('click', () => {
      if (!ui.confirmReset) { ui.confirmReset = true; return viewProgress(); }
      ui.confirmReset = false;
      if (A.user()) A.clearRemote().catch(() => {}); // иначе при следующей сверке прогресс вернётся из облака
      L.reset(); location.hash = '#home';
    });
  }

  /* ---------- Демо: ученица с корневым пробелом в дробях ---------- */
  function demo() {
    if (A.user()) return go(L.exists() ? '#home' : '#start'); // демо перезаписало бы прогресс в аккаунте
    const rand = T.rng(11);
    const d = new T.Diagnostic(T.GOALS[0].start, { rand });
    const s = T.simulateStudent(['frac'], rand, { known: 1, unknown: 0, misRate: 1 });
    let cur; while ((cur = d.next())) d.answer(s.pick(cur));
    const res = d.result();
    L.fromDiagnostic(t('Айгерим'), res, true);
    ui.banner = t('Это демо: виртуальная ученица с пробелом в дробях прошла диагностику за {q}. Пройди её план или <a href="#start">начни свою диагностику</a>.', { q: questions(res.asked) });
    history.replaceState(null, '', '#home');
    route();
  }

  /* ---------- Аккаунт ---------- */
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function authError(e) {
    return {
      credentials: t('Неверная почта или пароль.'),
      exists: t('Аккаунт с такой почтой уже есть. Попробуй войти.'),
      weak: t('Пароль слишком простой: нужно не меньше 8 символов.'),
      unconfirmed: t('Почта ещё не подтверждена — открой письмо и перейди по ссылке.'),
      email: t('Проверь адрес почты.'),
      mailrate: t('Сервер отправил слишком много писем за последний час. Попробуй ещё раз позже.'),
      rate: t('Слишком много попыток. Подожди минуту и попробуй снова.'),
      network: t('Нет связи с сервером. Проверь интернет и попробуй ещё раз.')
    }[e && e.kind] || t('Что-то пошло не так. Попробуй ещё раз позже.');
  }

  function syncLine() {
    return {
      syncing: t('Синхронизация…'), ok: t('Прогресс сохранён в облаке'),
      offline: t('Нет связи — сохраним, когда появится интернет'), error: t('Не удалось сохранить в облаке')
    }[A.status().state] || '';
  }

  /* После входа: сверяемся с облаком и ведём туда, где есть что делать. */
  async function afterSignIn() {
    ui.auth = { mode: 'in', email: '', error: null, note: ui.auth.note, busy: false };
    const r = await A.sync();
    if (r === 'ask') return go('#account');
    ui.auth.note = null;
    if (A.isTeacher()) return go('#teacher');
    go(L.exists() ? '#home' : '#start');
  }

  async function signOut() {
    const user = A.user();
    const own = L.exists() && L.owner() === user.id;
    const saved = own ? await A.flush() : true;
    await A.signOut();
    // Прогресс аккаунта с устройства убираем. Если последние изменения не дошли до облака — оставляем, чтобы не потерять.
    if (own && saved) L.forget();
    ui.auth = { mode: 'in', email: '', error: null, note: null, busy: false };
    if (own && !saved) ui.banner = t('Не удалось сохранить последние изменения в облаке, поэтому прогресс оставлен на этом устройстве.');
    go(L.exists() ? '#home' : '#account');
  }

  function viewAccount() {
    if (!A.enabled) return L.exists() ? viewHome() : viewLanding();
    if (!A.user()) return viewAuthForm();
    if (ui.auth.mode === 'newpass') return viewNewPassword();
    const user = A.user(), st = A.status();
    const remote = st.state === 'ask' ? A.pending() : null;
    const done = state => Object.values(state.topics || {}).filter(x => x && (x.st === 'mastered' || x.st === 'solid')).length;
    const summary = state => t('{n} {themes} · изменён {date}', { n: done(state), themes: plural(done(state), 'тема освоена', 'темы освоены', 'тем освоено'), date: fmtDate(state.updated || state.created || Date.now()) });
    const own = L.exists() && L.owner() === user.id;
    app.innerHTML = `
      <section class="card narrow">
        <p class="eyebrow">${t('Аккаунт')}</p>
        <h1>${esc(user.name || user.email)}</h1>
        <p class="muted">${esc(user.email)}</p>
        ${A.isTeacher() ? `<p><span class="chip">${t('Учительский аккаунт')}</span> <a class="btn small" href="#teacher">${t('Панель учителя')}</a></p>` : ''}
        ${ui.auth.note ? `<p class="banner">${esc(ui.auth.note)}</p>` : ''}
        ${remote ? `
          <div class="note">
            <p><b>${t('На этом устройстве уже есть прогресс, и в аккаунте тоже. Какой оставить?')}</b> ${t('Второй вариант будет удалён.')}</p>
            <div class="row">
              <button class="btn small" data-keep="remote">${t('Из аккаунта')} · ${esc(summary(remote.state))}</button>
              <button class="btn small" data-keep="local">${t('С этого устройства')} · ${esc(summary(L.get()))}</button>
            </div>
          </div>` : `<p class="sync s-${st.state}">${esc(syncLine())}</p>`}
        <div class="row">
          ${remote ? '' : `<button class="btn small" id="sync">${t('Синхронизировать сейчас')}</button>`}
          <button class="btn small" id="out">${t('Выйти')}</button>
        </div>
        ${own ? `<p class="muted small">${t('При выходе прогресс остаётся в аккаунте, а с этого устройства убирается.')}</p>` : ''}
        <p class="muted small">${t('Твои ответы на задачи сохраняются без имени и почты — по ним Tamyr учится точнее подбирать повторения.')}
          <button class="link small" id="del-answers">${ui.delAnswers === 'done' ? t('Ответы удалены') : ui.delAnswers === 'ask' ? t('Точно удалить все мои ответы?') : t('Удалить мои ответы')}</button></p>
        <a class="btn ghost" href="#home">${t('На главную')}</a>
      </section>`;
    app.querySelectorAll('[data-keep]').forEach(b => b.addEventListener('click', async () => {
      await A.sync(b.dataset.keep);
      go(L.exists() ? '#home' : '#start');
    }));
    const sync = app.querySelector('#sync');
    if (sync) sync.addEventListener('click', () => A.sync().then(r => { if (r === 'pull') route(); }));
    app.querySelector('#out').addEventListener('click', signOut);
    app.querySelector('#del-answers').addEventListener('click', async () => {
      if (ui.delAnswers === 'done') return;
      if (ui.delAnswers !== 'ask') { ui.delAnswers = 'ask'; return viewAccount(); }
      try { await A.deleteAnswers(); ui.delAnswers = 'done'; } catch (e) { ui.delAnswers = null; ui.auth.note = t('Не получилось удалить ответы. Попробуй ещё раз позже.'); }
      viewAccount();
    });
  }

  function viewAuthForm() {
    const m = ui.auth.mode === 'up' ? 'up' : ui.auth.mode === 'recover' ? 'recover' : 'in';
    const head = { in: t('Вход в аккаунт'), up: t('Новый аккаунт'), recover: t('Сброс пароля') }[m];
    const submit = { in: t('Войти'), up: t('Создать аккаунт'), recover: t('Отправить ссылку') }[m];
    app.innerHTML = `
      <section class="card narrow">
        <h1>${head}</h1>
        <p class="muted">${t('С аккаунтом прогресс сохраняется в облаке: можно продолжить с другого телефона и не потерять его при очистке браузера.')}</p>
        ${ui.auth.note ? `<p class="banner">${esc(ui.auth.note)}</p>` : ''}
        ${ui.auth.error ? `<p class="note" role="alert">${esc(ui.auth.error)}</p>` : ''}
        <form id="auth-form">
          ${m === 'up' ? `<label class="field"><span>${t('Имя')}</span><input id="name" required maxlength="40" autocomplete="given-name" value="${esc(L.exists() ? L.get().name : '')}" placeholder="${t('Например, Айгерим')}"></label>` : ''}
          <label class="field"><span>${t('Электронная почта')}</span><input id="email" type="email" required autocomplete="email" value="${esc(ui.auth.email)}"></label>
          ${m === 'recover' ? '' : `<label class="field"><span>${t('Пароль')}</span><input id="password" type="password" required autocomplete="${m === 'up' ? 'new-password' : 'current-password'}">${m === 'up' ? `<small class="muted">${t('Не короче 8 символов')}</small>` : ''}</label>`}
          ${m === 'up' ? `<label class="consent"><input id="consent" type="checkbox" required><span>${t('Мне есть 18 лет, или мой родитель (законный представитель) согласен, чтобы сайт хранил моё имя, почту и прогресс.')}</span></label>` : ''}
          <button class="btn primary" type="submit" ${ui.auth.busy ? 'disabled' : ''}>${submit}</button>
        </form>
        <div class="row links">
          ${m === 'in' ? `<button class="link" data-mode="up">${t('Нет аккаунта? Создать')}</button><button class="link" data-mode="recover">${t('Забыли пароль?')}</button>`
            : m === 'up' ? `<button class="link" data-mode="in">${t('Уже есть аккаунт? Войти')}</button>`
            : `<button class="link" data-mode="in">${t('Назад ко входу')}</button>`}
        </div>
        ${m === 'up' ? `<p class="muted small">${t('В облаке хранятся только имя, почта и прогресс по темам.')}</p>` : ''}
      </section>`;
    app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      ui.auth.email = app.querySelector('#email').value.trim();
      ui.auth.mode = b.dataset.mode; ui.auth.error = null; ui.auth.note = null;
      viewAccount();
    }));
    app.querySelector('#auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (ui.auth.busy) return;
      const email = app.querySelector('#email').value.trim();
      const password = m === 'recover' ? '' : app.querySelector('#password').value;
      const name = m === 'up' ? (app.querySelector('#name').value.trim() || t('Ученик')) : '';
      ui.auth.email = email; ui.auth.error = null; ui.auth.note = null; ui.auth.busy = true;
      app.querySelector('#auth-form button[type=submit]').disabled = true;
      try {
        if (m === 'recover') {
          await A.recover(email);
          ui.auth.note = t('Если такой аккаунт есть, мы отправили на {email} ссылку для смены пароля.', { email });
          ui.auth.mode = 'in';
        } else if (m === 'up') {
          if (password.length < 8) throw { kind: 'weak' };
          if (await A.signUp(name, email, password) === 'signed-in') return await afterSignIn();
          ui.auth.note = t('Мы отправили письмо на {email}. Открой его и перейди по ссылке, чтобы завершить регистрацию.', { email });
          ui.auth.mode = 'in';
        } else {
          await A.signIn(email, password);
          return await afterSignIn();
        }
      } catch (err) {
        ui.auth.error = authError(err);
      } finally {
        ui.auth.busy = false;
      }
      if (location.hash === '#account') viewAccount();
    });
  }

  /* Переход по ссылке «сменить пароль» из письма: человек уже вошёл, осталось задать новый пароль. */
  function viewNewPassword() {
    app.innerHTML = `
      <section class="card narrow">
        <h1>${t('Новый пароль')}</h1>
        ${ui.auth.error ? `<p class="note" role="alert">${esc(ui.auth.error)}</p>` : ''}
        <form id="pass-form">
          <label class="field"><span>${t('Пароль')}</span><input id="password" type="password" required autocomplete="new-password"><small class="muted">${t('Не короче 8 символов')}</small></label>
          <button class="btn primary" type="submit">${t('Сохранить пароль')}</button>
        </form>
      </section>`;
    app.querySelector('#pass-form').addEventListener('submit', async e => {
      e.preventDefault();
      const password = app.querySelector('#password').value;
      ui.auth.error = null;
      try {
        if (password.length < 8) throw { kind: 'weak' };
        await A.setPassword(password);
        ui.auth.mode = 'in'; ui.auth.note = t('Пароль изменён.');
        return await afterSignIn();
      } catch (err) { ui.auth.error = authError(err); }
      viewAccount();
    });
  }

  /* Панель учителя — только для учительских аккаунтов. Без облака (config.js пуст) аккаунтов нет, и панель открыта, как раньше. */
  const teacherOk = () => !A.enabled || A.isTeacher();

  /* Кнопка аккаунта в шапке, вкладка «Учителю» и подпись в подвале. */
  function chromeAccount() {
    document.querySelector('[data-nav="teacher"]').hidden = !teacherOk();
    const link = document.getElementById('acct');
    const user = A.enabled ? A.user() : null;
    link.hidden = !A.enabled;
    link.textContent = user ? (user.name || user.email.split('@')[0]) : t('Войти');
    link.classList.toggle('in', !!user);
    document.querySelector('.foot').textContent = user ? t('Tamyr · прогресс сохраняется в аккаунте') : t('Tamyr · прогресс хранится на этом устройстве');
  }

  function initAccount() {
    chromeAccount();
    if (!A.enabled) return;
    const calm = () => ['home', 'map', 'progress', 'account', ''].includes((location.hash.replace('#', '') || 'home').split('/')[0]);
    // вошёл, вышел или сменилась роль: обновляем шапку, а с панели учителя уводим, если она больше не положена
    A.onChange = () => { chromeAccount(); if (location.hash.split('/')[0] === '#teacher') route(); };
    A.onStatus = () => { if (location.hash === '#account' && A.user() && !document.querySelector('#pass-form')) viewAccount(); };
    if (A.arrival === 'recovery') ui.auth.mode = 'newpass';
    if (A.arrival === 'confirmed') ui.auth.note = t('Почта подтверждена — ты в аккаунте.');
    if (A.arrival === 'link-error') ui.auth.error = t('Ссылка из письма не сработала или устарела. Запроси новую.');
    // Сверка при запуске, при возвращении сети и когда вкладку снова открыли. Экран перерисовываем, только если человек не посреди задачи.
    const resync = () => { if (A.user()) A.refreshRole().catch(() => {}); if (A.user()) A.sync().then(r => { if (r === 'ask') go('#account'); else if ((r === 'pull' || !L.exists()) && calm()) route(); }); };
    resync();
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - A.status().at > 300000) resync(); });
  }

  /* ---------- Шапка: навигация и переключатель языка ---------- */
  function chrome() {
    const nav = { home: t('Сегодня'), map: t('Карта'), progress: t('Прогресс'), teacher: t('Учителю') };
    document.querySelectorAll('[data-nav]').forEach(a => { a.querySelector('span').textContent = nav[a.dataset.nav]; });
    document.querySelector('.tabs').setAttribute('aria-label', t('Разделы'));
    document.title = t('Tamyr — подготовка к ЕНТ от корня');
    const btn = document.getElementById('lang');
    const other = T.lang === 'kk' ? 'ru' : 'kk';
    btn.textContent = other === 'kk' ? 'Қазақша' : 'Русский';
    btn.addEventListener('click', () => T.setLang(other));
  }

  /* ---------- Роутер ---------- */
  function route() {
    const h = location.hash.replace('#', '') || 'home';
    const [view, arg] = h.split('/');
    const group = { lesson: 'home', practice: 'home', check: 'home', start: 'home', setup: 'home', quiz: 'home' }[view] || view;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === group));
    document.getElementById('acct').classList.toggle('active', view === 'account');
    if (view !== 'progress') ui.confirmReset = false;
    window.scrollTo(0, 0);
    if (view === 'demo') return demo();
    if (view === 'start' || view === 'setup') return viewStart(); // #setup — адрес из хакатонной версии
    if (view === 'quiz') return viewQuiz();
    if (view === 'teacher') {
      if (teacherOk()) return T.viewTeacher(app);
      // ученику панель не показываем вовсе; гостю предлагаем войти — вдруг это учитель
      if (A.user()) { history.replaceState(null, '', '#home'); return route(); }
      ui.auth.note = t('Эта страница — для учителей. Войди учительским аккаунтом.');
      history.replaceState(null, '', '#account');
      return route();
    }
    if (view === 'account') return viewAccount();
    if (view === 'map') return viewMap();
    if (!L.exists()) return viewLanding();
    if (view === 'lesson' && known(arg)) return viewLesson(arg, true);
    if ((view === 'practice' || view === 'check') && known(arg)) return viewSession(view, arg);
    if (view === 'progress') return viewProgress();
    viewHome();
  }
  // Клавиши 1–4 выбирают вариант ответа
  document.addEventListener('keydown', e => {
    const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (idx == null || e.target.matches('input, textarea')) return;
    const btn = app.querySelectorAll('.opt:not([disabled])')[idx];
    if (btn) btn.click();
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', () => { chrome(); initAccount(); route(); });
})();
