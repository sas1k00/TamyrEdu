/*
 * Tamyr Engine — адаптивная диагностика по графу пререквизитов.
 *
 * Идея: начинаем с целевых (сложных) тем. Тема «освоена», когда верных ответов на 2 больше, чем неверных,
 * «пробел» — когда неверных на 2 больше (до 6 вопросов на тему; если банк кончился — решает большинство).
 *   • Освоил тему  → все её пререквизиты считаются освоенными (вывод, без вопросов).
 *   • Пробел в теме → спускаемся к её непроверенным пререквизитам (поиск в глубину).
 *   • Неверный ответ с меткой ошибки (misconception) указывает на «домашнюю» тему
 *     ошибки — её проверяем в первую очередь.
 * Корневой пробел — тема-пробел, у которой нет пробелов среди пререквизитов.
 */
(function () {
  const T = window.Tamyr;

  const S = { UNKNOWN: 'unknown', MASTERED: 'mastered', INFERRED: 'inferred', GAP: 'gap', RISK: 'risk' };
  T.STATUS = S;

  function byId(list) { const m = {}; list.forEach(x => { m[x.id] = x; }); return m; }
  const TOPIC = byId(T.TOPICS);
  const QUESTION = byId(T.QUESTIONS);
  T.TOPIC = TOPIC;
  T.QUESTION = QUESTION;

  const questionsByTopic = {};
  T.QUESTIONS.forEach(q => { (questionsByTopic[q.topic] = questionsByTopic[q.topic] || []).push(q); });
  T.questionsByTopic = questionsByTopic;

  // Все пререквизиты темы (транзитивно).
  function ancestors(id, acc) {
    acc = acc || new Set();
    TOPIC[id].prereq.forEach(p => { if (!acc.has(p)) { acc.add(p); ancestors(p, acc); } });
    return acc;
  }
  // Все темы, которые (транзитивно) опираются на данную.
  function descendants(id) {
    const out = new Set();
    let grew = true;
    while (grew) {
      grew = false;
      T.TOPICS.forEach(t => {
        if (!out.has(t.id) && t.prereq.some(p => p === id || out.has(p))) { out.add(t.id); grew = true; }
      });
    }
    return out;
  }
  T.ancestors = ancestors;
  T.descendants = descendants;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  T.rng = mulberry32;

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  T.shuffle = shuffle;

  class Diagnostic {
    constructor(startTopics, opts) {
      opts = opts || {};
      this.rand = opts.rand || Math.random;
      this.maxPerTopic = 6; // в спорных случаях задаём до 6 вопросов (весь банк темы)
      this.state = {};
      T.TOPICS.forEach(t => { this.state[t.id] = { status: S.UNKNOWN, answers: [], tested: false }; });
      this.stack = startTopics.slice().reverse();
      this.log = [];       // полная история: {qid, topic, correct, mis}
      this.current = null; // {topic, question, options}
      this.reasons = {};   // почему тема попала в проверку
      this.need = {};      // тема → какой перевес неверных нужен для пробела (по умолчанию 2; у перепроверяемых корней — 3)
      startTopics.forEach(id => { this.reasons[id] = { kind: 'goal' }; });
    }

    _decided(id) { const s = this.state[id].status; return s === S.MASTERED || s === S.GAP; }

    _nextTopic() {
      while (this.stack.length) {
        const id = this.stack[this.stack.length - 1];
        if (this._decided(id)) { this.stack.pop(); continue; }
        return id;
      }
      return this._verifyRoots();
    }

    /* Перед итогом корни с узким перевесом (2 неверных) перепроверяем до перевеса 3: две случайные ошибки
       знающего ученика иначе становятся ложным корнем. На симуляции 1000 учеников это +1,5–5 п.п. точных
       диагнозов ценой ~1,3 вопроса (tests.html, «Симуляция»). Каждый корень перепроверяется не больше одного раза. */
    _verifyRoots() {
      const gaps = T.TOPICS.filter(t => this.state[t.id].status === S.GAP).map(t => t.id);
      const gapSet = new Set(gaps);
      const weak = gaps.filter(g => {
        if (this.need[g] || [...ancestors(g)].some(a => gapSet.has(a))) return false; // уже перепроверен или не корень
        const st = this.state[g], c = st.answers.filter(a => a.correct).length;
        return st.answers.length - c < 3 && st.answers.length < Math.min(this.maxPerTopic, questionsByTopic[g].length);
      });
      if (!weak.length) return null;
      weak.forEach(g => { this.need[g] = 3; this.state[g].status = S.UNKNOWN; this.stack.push(g); this.reasons[g] = { kind: 'verify' }; });
      return this.stack[this.stack.length - 1];
    }

    next() {
      if (this.current) return this.current;
      const id = this._nextTopic();
      if (!id) return null;
      const st = this.state[id];
      const asked = new Set(st.answers.map(a => a.qid));
      const pool = questionsByTopic[id].filter(q => !asked.has(q.id));
      const q = pool[Math.floor(this.rand() * pool.length)];
      const options = shuffle(q.options, this.rand);
      this.current = { topic: id, question: q, options, reason: this.reasons[id] };
      return this.current;
    }

    /* optionIndex — индекс в перемешанном current.options, или null для «Не знаю». */
    answer(optionIndex) {
      const cur = this.current;
      if (!cur) throw new Error('Нет активного вопроса');
      const opt = optionIndex === null ? null : cur.options[optionIndex];
      const rec = { qid: cur.question.id, topic: cur.topic, correct: !!(opt && opt.ok), mis: opt && opt.mis ? opt.mis : null, skipped: opt === null };
      const st = this.state[cur.topic];
      st.answers.push(rec);
      st.tested = true;
      this.log.push(rec);
      this.current = null;
      this._evaluate(cur.topic);
      return rec;
    }

    _evaluate(id) {
      const st = this.state[id];
      const c = st.answers.filter(a => a.correct).length;
      const w = st.answers.length - c;
      const outOfQuestions = st.answers.length >= Math.min(this.maxPerTopic, questionsByTopic[id].length);
      // Решение принимается, когда одна сторона ведёт с перевесом в 2 ответа: ВВ → освоено, НН → пробел,
      // при 1:1 спрашиваем дальше (В Н В В → освоено). Так одна удачная догадка не решает судьбу темы.
      // «Чистое» освоение (все ответы верны) распространяется на пререквизиты;
      // освоение с ошибкой засчитывается только самой теме — угадывание не должно «закрывать» основы.
      if (c - w >= 2 || (outOfQuestions && c > w)) return this._markMastered(id, w === 0);
      if (w - c >= (this.need[id] || 2) || outOfQuestions) return this._markGap(id);
    }

    _markMastered(id, propagate) {
      this.state[id].status = S.MASTERED;
      if (!propagate) return;
      ancestors(id).forEach(a => {
        if (this.state[a].status === S.UNKNOWN) this.state[a].status = S.INFERRED;
      });
    }

    _markGap(id) {
      this.state[id].status = S.GAP;
      const toCheck = [];
      // 1) непроверенные пререквизиты — включая «выведенные»: вывод мог опираться на удачную догадку,
      //    а корень пробела должен быть подтверждён ответами, а не предположением
      TOPIC[id].prereq.forEach(p => {
        if (!this.state[p].tested) {
          this.state[p].status = S.UNKNOWN;
          toCheck.push(p);
          this.reasons[p] = this.reasons[p] || { kind: 'prereq', from: id };
        }
      });
      // 2) «домашние» темы замеченных ошибок — проверяем в первую очередь, даже если тема была выведена
      const homes = [];
      this.state[id].answers.forEach(a => {
        if (!a.mis) return;
        const home = T.MISCONCEPTIONS[a.mis].home;
        if (home !== id && !this.state[home].tested && !homes.includes(home) && ancestors(id).has(home)) {
          homes.push(home);
          this.reasons[home] = { kind: 'mis', from: id, mis: a.mis };
        }
      });
      homes.forEach(h => { if (this.state[h].status === S.INFERRED) this.state[h].status = S.UNKNOWN; });
      const push = homes.concat(toCheck.filter(p => !homes.includes(p)));
      // кладём на вершину стека: первый элемент списка проверяется первым
      push.slice().reverse().forEach(p => {
        const i = this.stack.indexOf(p);
        if (i !== -1) this.stack.splice(i, 1);
        this.stack.push(p);
      });
    }

    result() {
      const status = {};
      T.TOPICS.forEach(t => { status[t.id] = this.state[t.id].status; });
      const gaps = T.TOPICS.filter(t => status[t.id] === S.GAP).map(t => t.id);
      const gapSet = new Set(gaps);
      const rootGaps = gaps.filter(id => !TOPIC[id].prereq.some(p => gapSet.has(p)) &&
        ![...ancestors(id)].some(a => gapSet.has(a)));
      // непроверенные темы, стоящие на пробелах, — «в зоне риска»
      gaps.forEach(g => descendants(g).forEach(d => { if (status[d] === S.UNKNOWN) status[d] = S.RISK; }));
      // цепочки: пробел в сложной теме → какие корни её держат
      const traces = gaps.filter(g => !rootGaps.includes(g)).map(g => ({
        topic: g, roots: rootGaps.filter(r => ancestors(g).has(r))
      })).filter(t => t.roots.length);
      const misCount = {};
      this.log.forEach(a => { if (a.mis) { misCount[a.mis] = misCount[a.mis] || { id: a.mis, count: 0, topics: new Set() }; misCount[a.mis].count++; misCount[a.mis].topics.add(a.topic); } });
      const misconceptions = Object.values(misCount).sort((a, b) => b.count - a.count).map(m => ({ id: m.id, count: m.count, topics: [...m.topics] }));
      const plan = T.TOPICS.filter(t => status[t.id] === S.GAP || status[t.id] === S.RISK)
        .sort((a, b) => a.level - b.level).map(t => t.id);
      return {
        status, gaps, rootGaps, traces, misconceptions, plan,
        asked: this.log.length,
        correct: this.log.filter(a => a.correct).length,
        fullTestSize: T.TOPICS.reduce((s, t) => s + Math.min(this.maxPerTopic, questionsByTopic[t.id].length), 0)
      };
    }
  }
  T.Diagnostic = Diagnostic;

  /* Очередь заданий для практики: сначала те, которых ученик ещё не видел (usedIds — заданные в диагностике). */
  T.practiceQueue = function (topicId, usedIds, rand) {
    const used = new Set(usedIds || []);
    const pool = shuffle(questionsByTopic[topicId], rand || Math.random);
    return pool.filter(q => !used.has(q.id)).concat(pool.filter(q => used.has(q.id)));
  };

  /* Симулированный ученик: знает все темы, кроме trueGaps и всего, что от них зависит. */
  T.simulateStudent = function (trueRoots, rand, p) {
    p = Object.assign({ known: 0.92, unknown: 0.2, misRate: 0.7 }, p || {});
    const weak = new Set();
    trueRoots.forEach(r => { weak.add(r); descendants(r).forEach(d => weak.add(d)); });
    return {
      weak,
      pick(cur) {
        const knows = !weak.has(cur.topic);
        const pc = knows ? p.known : p.unknown;
        if (rand() < pc) return cur.options.findIndex(o => o.ok);
        const wrong = cur.options.map((o, i) => ({ o, i })).filter(x => !x.o.ok);
        // Ученик с настоящим пробелом чаще выбирает «типичную» ошибку из своей темы
        const typical = wrong.filter(x => x.o.mis && weak.has(T.MISCONCEPTIONS[x.o.mis].home));
        if (!knows && typical.length && rand() < p.misRate) return typical[Math.floor(rand() * typical.length)].i;
        return wrong[Math.floor(rand() * wrong.length)].i;
      }
    };
  };

  T.runSimulated = function (goalStart, trueRoots, seed, p) {
    const rand = mulberry32(seed);
    const d = new Diagnostic(goalStart, { rand });
    const s = T.simulateStudent(trueRoots, rand, p);
    let cur;
    while ((cur = d.next())) d.answer(s.pick(cur));
    return d.result();
  };
})();
