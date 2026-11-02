/*
 * Ответ вводом. В практике задача с числовым ответом может прийти без вариантов: ученик пишет число сам.
 * Зачем: при 4 вариантах угадывание даёт около 25%, а вписанный ответ не угадать — данные для моделей чище.
 * И вписанный ответ показывает ошибки, которых нет среди вариантов: если число не совпало ни с верным ответом,
 * ни с известной ловушкой, это кандидат в новую ошибку мышления (supabase/analysis.sql, запрос 9).
 * Диагностика и пробный ЕНТ остаются с вариантами, как на настоящем ЕНТ.
 */
(function () {
  const T = window.Tamyr;

  /* Доля задач с числовым ответом, которые в практике приходят без вариантов. Формат выбирается случайно для каждой
     задачи — так у одного и того же ученика по одной и той же теме есть ответы в обоих форматах и их можно сравнить. */
  const RATE = 0.5;

  // единица в конце ответа: «12 см», «30 см²», «70°» — писать её не обязательно
  const UNIT = /\s*(см²|см³|см2|см3|см|cm²|cm³|cm2|cm3|cm|°|градус(?:а|ов)?|град)\.?\s*$/i;

  /* Число из того, что написал ученик или что стоит в варианте: «−4», «-4», «3/4», «0,5», «0.5», «x = 3», «12 см», «≈2,67».
     Возвращает { v: значение, approx: был ли «≈» } или null, если это не число. */
  function parse(s) {
    if (typeof s !== 'string') return null;
    let x = s.trim().replace(/[−‒–—‐‑]/g, '-').replace(/ | | /g, ' ');
    x = x.replace(/^[a-zа-я]\s*=\s*/i, ''); // «x = 3», «y=2», «d = 4»
    x = x.replace(UNIT, '');
    let approx = false;
    if (x[0] === '≈') { approx = true; x = x.slice(1); }
    x = x.replace(/\s+/g, ''); // «9 801», «1 / 2»
    const m = /^([+-]?)(\d+(?:[.,]\d+)?|[.,]\d+)(?:\/(\d+))?$/.exec(x);
    if (!m) return null;
    const n = Number(m[2].replace(',', '.')), d = m[3] ? Number(m[3]) : 1;
    if (!d || !isFinite(n)) return null;
    return { v: (m[1] === '-' ? -n : n) / d, approx };
  }

  const same = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  // «≈2,67» в варианте — округлённое число: ученик мог округлить иначе (2,7 или 2,667)
  const fits = (typed, o) => (o.approx ? Math.abs(typed - o.v) < 0.05 + 1e-9 : same(typed, o.v));

  /* Все неверные ответы, которые мы знаем: у сгенерированной задачи — все ловушки генератора (в варианты попадают
     только три), у задачи банка — неверные варианты. */
  const traps = q => (q.traps || q.options.filter(o => !o.ok));

  /* Можно ли дать задачу без вариантов: верный ответ — точное число, и все известные ответы — тоже числа
     (иначе ученик, который думает «корней нет» или «не определено», не смог бы это вписать). */
  function can(q) {
    if (!q || !Array.isArray(q.options) || q.type && q.type !== 'single') return false;
    const ok = q.options.find(o => o.ok);
    const p = ok && parse(ok.t);
    if (!p || p.approx) return false;
    return q.options.concat(traps(q)).every(o => parse(o.t));
  }

  /* Проверка вписанного ответа. null — это не число (ничего не засчитываем, просим исправить).
     Иначе { ok, trap }: trap — известный неверный ответ, с которым совпало число (с меткой ошибки, если она есть),
     или null, если такого ответа мы не знаем. */
  function check(q, input) {
    const p = parse(input);
    if (!p) return null;
    const ok = q.options.find(o => o.ok);
    if (same(p.v, parse(ok.t).v)) return { ok: true, trap: null };
    const known = traps(q).map(o => ({ o, p: parse(o.t) })).filter(x => x.p && fits(p.v, x.p));
    // если число совпало с несколькими ловушками, берём ту, у которой есть метка ошибки
    const hit = known.find(x => x.o.mis) || known[0];
    return { ok: false, trap: hit ? hit.o : null };
  }

  /* Нужна ли подсказка про единицы: «12 см» — можно вписать просто 12. */
  const hasUnit = q => { const ok = q.options.find(o => o.ok); return !!(ok && UNIT.test(ok.t)); };

  T.typed = { RATE, parse, can, check, hasUnit };
})();
