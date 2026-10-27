/*
 * Модель ученика: что освоено, что повторять и что делать сегодня.
 *
 * Статус темы:
 *   unknown  — не проверялась            gap      — пробел (нужен урок)
 *   learning — урок пройден, идёт практика
 *   inferred — засчитана диагностикой без вопросов (ждёт подтверждения)
 *   mastered — освоена (3 верных подряд без подсказок или пройденная проверка)
 *   solid    — закреплена (выдержала повторения с интервалом 9+ дней)
 *
 * Интервальные повторения: после освоения тема возвращается через 1 день, затем интервал утраивается (3 → 9 → 27).
 * Провал повторения возвращает тему в работу. Ошибка «чужой» темы в практике ставит ту тему на проверку сегодня.
 */
(function () {
  const T = window.Tamyr;
  const KEY = T.LEARNER_KEY || 'tamyr.academy.v1'; // tests.html подменяет ключ, чтобы не трогать настоящий прогресс
  const DAY = 86400000;
  const NEED = 3;        // верных подряд для освоения
  const CHECK_SIZE = 2;  // вопросов в проверке/повторении
  const OPEN = new Set(['gap', 'learning']);          // тема в работе
  const OK = new Set(['mastered', 'solid', 'inferred']);

  let mem = null; // запасное хранилище, если localStorage недоступен
  function read() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : mem; } catch (e) { return mem; }
  }
  function write(s) {
    mem = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* приватный режим — живём в памяти */ }
  }

  let owner = null; // id аккаунта, которому принадлежит прогресс на этом устройстве; null — гость

  function blank(name) {
    const topics = {};
    T.TOPICS.forEach(t => { topics[t.id] = { st: 'unknown', streak: 0, seen: [], lesson: false, due: null, ivl: 0, fs: null, miss: 0 }; });
    return { v: 1, name: name || 'Ученик', created: Date.now(), offset: 0, topics, mis: {}, log: [], days: [], diag: null, owner, updated: 0, demo: false };
  }

  /* Чужие/старые данные не должны ломать приложение: добавляем недостающие темы, выбрасываем неизвестные статусы. */
  function sanitize(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !s.topics) return null;
    const base = blank(typeof s.name === 'string' ? s.name.slice(0, 40) : '');
    T.TOPICS.forEach(t => {
      const x = s.topics[t.id];
      if (!x || typeof x !== 'object') return;
      const b = base.topics[t.id];
      if (OPEN.has(x.st) || OK.has(x.st) || x.st === 'unknown') b.st = x.st;
      b.streak = Number.isFinite(x.streak) ? x.streak : 0;
      b.seen = Array.isArray(x.seen) ? x.seen.filter(id => T.QUESTION[id]) : [];
      b.lesson = x.lesson === true;
      b.due = Number.isFinite(x.due) ? x.due : null;
      b.ivl = Number.isFinite(x.ivl) ? x.ivl : 0;
      b.fs = T.fsrs.sanitize(x.fs);
      // прогресс до FSRS: память со стабильностью, равной прежнему интервалу, — иначе закреплённая тема откатилась бы
      if (!b.fs && b.ivl > 0 && Number.isFinite(b.due) && OK.has(b.st)) b.fs = { s: b.ivl, d: 5, last: b.due - b.ivl * DAY };
      b.miss = Number.isFinite(x.miss) ? x.miss : 0;
    });
    base.created = Number.isFinite(s.created) ? s.created : base.created;
    base.offset = Number.isFinite(s.offset) ? s.offset : 0;
    Object.keys(s.mis || {}).forEach(k => { if (T.MISCONCEPTIONS[k] && Number.isFinite(s.mis[k])) base.mis[k] = s.mis[k]; });
    base.log = Array.isArray(s.log) ? s.log.filter(e => e && T.TOPIC[e.topic]).slice(-60) : [];
    base.days = Array.isArray(s.days) ? s.days.filter(d => typeof d === 'string').slice(-400) : [];
    base.diag = s.diag && typeof s.diag === 'object' ? s.diag : null;
    base.owner = typeof s.owner === 'string' && s.owner ? s.owner.slice(0, 64) : null;
    base.updated = Number.isFinite(s.updated) ? s.updated : 0;
    base.demo = s.demo === true;
    return base;
  }

  let S = sanitize(read());
  owner = S ? S.owner : null;
  // updated — настоящее время последнего изменения (без демо-сдвига): по нему сверяются устройство и облако
  const save = () => { S.updated = Date.now(); write(S); if (L.onSave) L.onSave(); };
  const now = () => Date.now() + (S ? S.offset : 0);
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function touchDay() { const k = dayKey(now()); if (S.days[S.days.length - 1] !== k) S.days.push(k); }
  function logEvent(kind, topic) { S.log.push({ t: now(), kind, topic }); if (S.log.length > 60) S.log.shift(); }

  const tp = id => S.topics[id];
  /* Повторение темы с оценкой g (1–4) по модели забывания FSRS: она решает, через сколько дней тема вернётся. */
  function schedule(x, g) {
    x.fs = T.fsrs.review(x.fs, g, now());
    x.ivl = T.fsrs.interval(x.fs);
    x.due = now() + x.ivl * DAY;
  }
  const hasOpenBelow = id => [...T.ancestors(id)].some(a => OPEN.has(tp(a).st));

  const L = {
    NEED, CHECK_SIZE,
    exists: () => !!S,
    get: () => S,
    now,
    reset() { S = null; mem = null; try { localStorage.removeItem(KEY); } catch (e) { /* нет хранилища */ } },
    startBlank(name) { S = blank(name); save(); },

    /* Перенос результата диагностики в модель ученика. demo — прогресс виртуальной ученицы из демо, не настоящий. */
    fromDiagnostic(name, res, demo) {
      S = blank(name);
      S.demo = demo === true;
      T.TOPICS.forEach(t => {
        const st = res.status[t.id], x = tp(t.id);
        if (st === 'mastered') { x.st = 'mastered'; schedule(x, T.fsrs.GOOD); }
        else if (st === 'inferred') x.st = 'inferred';
        else if (st === 'gap') x.st = 'gap';
      });
      res.misconceptions.forEach(m => { S.mis[m.id] = m.count; });
      S.diag = { at: now(), asked: res.asked, roots: res.rootGaps.slice() };
      touchDay();
      res.rootGaps.forEach(id => logEvent('diag', id));
      save();
    },

    topic: tp,
    /* Статусы для карты: непроверенные темы над пробелом показываем «под угрозой». */
    statusMap() {
      const out = {};
      T.TOPICS.forEach(t => { const st = tp(t.id).st; out[t.id] = st === 'unknown' && hasOpenBelow(t.id) ? 'risk' : st; });
      return out;
    },
    /* Корни: темы в работе, под которыми нет других тем в работе. С них и начинаем. */
    roots() {
      return T.TOPICS.filter(t => OPEN.has(tp(t.id).st) && !hasOpenBelow(t.id)).sort((a, b) => a.level - b.level).map(t => t.id);
    },
    openTopics() { return T.TOPICS.filter(t => OPEN.has(tp(t.id).st)).sort((a, b) => a.level - b.level).map(t => t.id); },
    /* Сводка любого сохранённого прогресса — своего или ученика из класса — в формате кода «ученик → учитель».
       Панель учителя знает только статусы диагностики: «изучаю» передаём как пробел, «закреплено» — как освоено. */
    summarize(state) {
      const s = sanitize(state);
      if (!s) return null;
      const st = id => s.topics[id].st;
      const openBelow = id => [...T.ancestors(id)].some(a => OPEN.has(st(a)));
      const status = {};
      T.TOPICS.forEach(t => { const x = st(t.id); status[t.id] = x === 'unknown' && openBelow(t.id) ? 'risk' : ({ learning: 'gap', solid: 'mastered' }[x] || x); });
      const roots = T.TOPICS.filter(t => OPEN.has(st(t.id)) && !openBelow(t.id)).sort((a, b) => a.level - b.level).map(t => t.id);
      const misconceptions = Object.entries(s.mis).map(([id, count]) => ({ id, count }));
      return T.store.compact(s.name, 'full', { status, rootGaps: roots, misconceptions, asked: s.diag ? s.diag.asked : 0 });
    },
    locked: id => hasOpenBelow(id),
    isDue: id => { const x = tp(id); return x.due !== null && x.due <= now() && !OPEN.has(x.st); },

    /* Что делать сегодня: повторения → корень (проверка основы, урок или практика) → следующая непроверенная тема.
       reason — почему задача попала в план; название и объяснение для неё подбирает интерфейс на нужном языке. */
    today() {
      const tasks = [];
      T.TOPICS.filter(t => L.isDue(t.id)).sort((a, b) => a.level - b.level).slice(0, 3).forEach(t => {
        const st = tp(t.id).st;
        // освоенная тема пришла по расписанию; остальные поставила на проверку ошибка в практике
        tasks.push({ kind: 'check', topic: t.id, min: 2, reason: st === 'mastered' || st === 'solid' ? 'due' : 'flagged' });
      });
      L.roots().slice(0, 2).forEach(id => {
        const x = tp(id);
        // Диагностику могли остановить раньше времени: если под «корнем» есть непроверенная основа,
        // сначала убеждаемся, что настоящий корень не глубже.
        const base = x.lesson ? null : T.TOPIC[id].prereq.map(p => T.TOPIC[p])
          .filter(p => tp(p.id).st === 'unknown' || tp(p.id).st === 'inferred').sort((a, b) => a.level - b.level)[0];
        if (base) {
          if (!tasks.some(t => t.topic === base.id)) tasks.push({ kind: 'check', topic: base.id, min: 2, reason: 'base', base: id });
          return;
        }
        tasks.push(x.lesson ? { kind: 'practice', topic: id, min: 5, reason: 'practice' } : { kind: 'lesson', topic: id, min: 6, reason: 'lesson' });
      });
      if (!L.roots().length) {
        // пробелов в работе нет — двигаем границу: подтверждаем выведенное и пробуем новые темы снизу вверх
        const frontier = T.TOPICS.filter(t => {
          const st = tp(t.id).st;
          return (st === 'inferred' || st === 'unknown') && !L.isDue(t.id) && t.prereq.every(p => OK.has(tp(p).st));
        }).sort((a, b) => a.level - b.level)[0];
        if (frontier) tasks.push({ kind: 'check', topic: frontier.id, min: 2, reason: tp(frontier.id).st === 'inferred' ? 'confirm' : 'new' });
      }
      return tasks;
    },

    completeLesson(id) {
      const x = tp(id);
      if (!x.lesson) logEvent('lesson', id);
      x.lesson = true;
      if (!OK.has(x.st)) x.st = 'learning';
      touchDay(); save();
    },

    /* Запоминаем заданный вопрос банка и метку ошибки. Возвращает «домашнюю» тему ошибки, если она поставлена на проверку. */
    recordAnswer(id, q, opt) {
      const x = tp(id);
      if (!q.gen && !x.seen.includes(q.id)) x.seen.push(q.id);
      if (x.seen.length >= T.questionsByTopic[id].length) x.seen = x.seen.slice(-1); // банк пройден — начинаем круг заново
      touchDay();
      let flagged = null;
      if (opt && opt.mis) {
        S.mis[opt.mis] = (S.mis[opt.mis] || 0) + 1;
        const home = T.MISCONCEPTIONS[opt.mis].home;
        if (home !== id && !OPEN.has(tp(home).st)) { tp(home).due = now(); flagged = home; }
      }
      save();
      return flagged;
    },

    /* Ответ в практике. clean — без сильных подсказок. Возвращает true, когда тема освоена. */
    practiceAnswer(id, correct, clean) {
      const x = tp(id);
      if (!correct) { x.streak = 0; x.miss++; }
      else if (clean) x.streak++;
      if (x.streak >= NEED) {
        x.streak = 0;
        // уже освоенную тему дополнительная практика не откатывает к короткому интервалу
        if (x.st !== 'mastered' && x.st !== 'solid') {
          // без ошибок по пути — «хорошо», с ошибками — «с трудом»: такая тема вернётся раньше
          x.st = 'mastered'; schedule(x, x.miss ? T.fsrs.HARD : T.fsrs.GOOD);
          logEvent('mastered', id);
        }
        x.miss = 0;
        save();
        return true;
      }
      save();
      return false;
    },

    /* Итог проверки/повторения. */
    checkResult(id, right) {
      const x = tp(id), pass = right >= CHECK_SIZE;
      if (pass) {
        schedule(x, T.fsrs.GOOD);
        x.st = x.ivl >= 9 ? 'solid' : 'mastered';
        logEvent(x.st === 'solid' ? 'solid' : 'review', id);
      } else {
        x.fs = T.fsrs.review(x.fs, T.fsrs.AGAIN, now()); // забывание тоже учит модель: после освоения тема вернётся раньше
        x.st = x.lesson ? 'learning' : 'gap';
        x.due = null; x.ivl = 0; x.streak = 0; x.miss = 0;
        logEvent('lapse', id);
      }
      touchDay(); save();
      return pass;
    },

    /* Готовность: доля графа, взвешенная по надёжности знания. */
    readiness() {
      const w = { solid: 1, mastered: 1, inferred: 0.7, learning: 0.35 };
      return Math.round(100 * T.TOPICS.reduce((s, t) => s + (w[tp(t.id).st] || 0), 0) / T.TOPICS.length);
    },
    counts() {
      const c = { done: 0, open: 0, inferred: 0, unknown: 0 };
      T.TOPICS.forEach(t => {
        const st = tp(t.id).st;
        if (st === 'mastered' || st === 'solid') c.done++; else if (OPEN.has(st)) c.open++; else c[st]++;
      });
      return c;
    },
    /* Серия: сколько дней подряд (включая сегодня или вчера) была активность. */
    streakDays() {
      const set = new Set(S.days);
      let ts = now(), n = 0;
      if (!set.has(dayKey(ts))) ts -= DAY;
      while (set.has(dayKey(ts))) { n++; ts -= DAY; }
      return n;
    },
    /* Память по темам: вероятность вспомнить сейчас (FSRS) и дата повторения. Сначала то, что забывается сильнее. */
    memory() {
      return T.TOPICS.map(t => ({ id: t.id, x: tp(t.id) }))
        .filter(({ x }) => x.fs && x.due !== null && !OPEN.has(x.st))
        .map(({ id, x }) => ({ id, recall: T.fsrs.retrievability(x.fs, now()), due: x.due }))
        .sort((a, b) => a.recall - b.recall);
    },
    nextDue() {
      const ds = T.TOPICS.map(t => tp(t.id)).filter(x => x.due !== null && !OPEN.has(x.st)).map(x => x.due);
      return ds.length ? Math.min(...ds) : null;
    },
    /* Для демонстрации интервальных повторений: сдвигает «сегодня» вперёд. */
    advance(days) { S.offset += days * DAY; save(); },
    _load(s) { S = sanitize(s); if (S) save(); return !!S; },

    /* --- Аккаунт (js/account.js) --- */
    onSave: null,              // вызывается после каждого сохранения прогресса
    owner: () => owner,
    /* Привязать прогресс к аккаунту. Это не изменение прогресса: время updated не трогаем. */
    setOwner(id) { owner = id || null; if (S) { S.owner = owner; write(S); } },
    /* Прогресс из облака заменяет локальный. false — данные из облака не прошли проверку. */
    adopt(state, id) {
      const s = sanitize(state);
      if (!s) return false;
      owner = id || null; s.owner = owner; S = s; write(S);
      return true;
    },
    /* Выход из аккаунта: прогресс с устройства убираем, новый начнётся как гостевой. */
    forget() { owner = null; L.reset(); }
  };

  T.learner = L;
})();
