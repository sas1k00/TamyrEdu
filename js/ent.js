/*
 * Пробный ЕНТ по математике в формате НЦТ: 40 заданий, 50 баллов.
 *   1–25  один верный ответ из 4 — 1 балл
 *   26–30 пять заданий по одному тексту (контекст) — по 1 баллу
 *   31–35 установление соответствия (2 пункта, 4 варианта) — 2 балла, только если оба соответствия верны
 *   36–40 один или несколько верных ответов из 6 — 2 балла без ошибок, 1 балл при одной ошибке
 * Источник формата — описания ЕНТ-2026 (entlab.kz, bilimqor.kz); баллы задаются в POINTS и SCORE — сверить с testcenter.kz.
 * Время — 80 минут: на ЕНТ 240 минут на 120 заданий, то есть в среднем 2 минуты на задание.
 * Тест хранится на устройстве (задания, ответы, время окончания): ушёл на другой экран или обновил страницу — продолжаешь.
 */
(function () {
  const T = window.Tamyr;
  const K = T.genKit, { num, dec, frac, ri, pick, build, tr, sup, sub, poly, pt, pair, nz } = K;
  const t = (s, v) => T.t(s, v), esc = s => T.esc(s), math = s => T.math(s);

  const DURATION = 80 * 60 * 1000;
  const POINTS = { single: 1, context: 1, match: 2, multi: 2 };
  const SCORE = {
    single: (task, a) => (a !== null && a !== undefined && task.options[a] && task.options[a].ok ? 1 : 0),
    // соответствие: 2 балла, только если оба пункта верны (так в описании формата; если НЦТ даёт по баллу за пункт — поменять здесь)
    match: (task, a) => (Array.isArray(a) && task.items.every((it, i) => a[i] === it.a) ? 2 : 0),
    // несколько ответов: ошибка — лишний выбранный вариант или пропущенный верный
    multi: (task, a) => {
      if (!Array.isArray(a) || !a.length) return 0;
      const errors = task.options.filter((o, i) => !!o.ok !== a.includes(i)).length;
      return errors === 0 ? 2 : errors === 1 ? 1 : 0;
    }
  };
  SCORE.context = SCORE.single;
  const scoreOf = (task, a) => SCORE[task.type](task, a);

  /* ---------- Сборка заданий ---------- */
  const uniq = list => list.filter((x, i) => list.indexOf(x) === i);
  function multi(r, topic, text, right, wrong, sol) {
    right = uniq(right);
    // неверные — случайные из всего списка без повторов: совпавшие при малых числах варианты не оставляют задачу без шестого ответа
    const pool = T.shuffle(uniq(wrong).filter(w => !right.includes(w)), r).slice(0, 6 - right.length);
    const options = T.shuffle(right.map(x => ({ t: x, ok: true })).concat(pool.map(x => ({ t: x }))), r);
    return { type: 'multi', topic, text, options, sol };
  }
  function match(r, topic, text, pairs, extra, sol) {
    const answers = pairs.map(p => p[1]);
    const options = T.shuffle(answers.concat(uniq(extra).filter(x => !answers.includes(x)).slice(0, 4 - answers.length)), r);
    return { type: 'match', topic, text, items: pairs.map(([q, a]) => ({ t: q, a: options.indexOf(a) })), options, sol };
  }
  const pickN = (r, list, n) => T.shuffle(list, r).slice(0, n);
  const rangeInts = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  const TRIG = [['sin 30°', '1/2'], ['cos 60°', '1/2'], ['sin 150°', '1/2'], ['cos 30°', '√3/2'], ['sin 60°', '√3/2'], ['sin 120°', '√3/2'],
    ['sin 45°', '√2/2'], ['cos 45°', '√2/2'], ['sin 135°', '√2/2'], ['tg 45°', '1'], ['sin 90°', '1'], ['cos 0°', '1'],
    ['tg 60°', '√3'], ['tg 30°', '√3/3'], ['cos 90°', '0'], ['sin 0°', '0'], ['cos 120°', '−1/2'], ['cos 180°', '−1']];

  const MULTI = {
    quad(r) {
      let p = nz(r, -6, 6), q = nz(r, -6, 6); if (p === q) q = p === 6 ? -6 : p === -1 ? 2 : p + 1;
      const eq = poly([[1, 2], [-(p + q), 1], [p * q, 0]]) + ' = 0';
      return multi(r, 'quad', tr(`Укажите все корни уравнения ${eq}`, `${eq} теңдеуінің барлық түбірлерін көрсетіңіз`), [num(p), num(q)],
        [num(-p), num(-q), num(p + q), num(p * q), '0', num(p - q), num(q + 1), num(p + 2), num(p + 3), num(q - 2), num(2 * p), num(2 * q), num(p * q + 1)].concat(rangeInts(-9, 9).map(num)),
        [tr(`По теореме Виета: сумма корней ${num(p + q)}, произведение ${num(p * q)}`, `Виет теоремасы бойынша: қосындысы ${num(p + q)}, көбейтіндісі ${num(p * q)}`),
          tr(`Корни: ${num(p)} и ${num(q)}`, `Түбірлері: ${num(p)} және ${num(q)}`)]);
    },
    ineq(r) {
      const FLIP = { '>': '<', '<': '>', '≥': '≤', '≤': '≥' };
      const op = pick(r, ['>', '<', '≥', '≤']), a = r() < 0.5 ? -ri(r, 2, 4) : ri(r, 2, 4), x0 = ri(r, -4, 4), b = ri(r, -6, 6), c = a * x0 + b;
      const res = a < 0 ? FLIP[op] : op, ok = x => ({ '<': x < x0, '>': x > x0, '≤': x <= x0, '≥': x >= x0 }[res]);
      const cand = rangeInts(x0 - 6, x0 + 6), k = ri(r, 1, 3);
      const right = pickN(r, cand.filter(ok), k).map(num), wrong = pickN(r, cand.filter(x => !ok(x)), 6 - k).map(num);
      const ineq = `${poly([[a, 1], [b, 0]])} ${op} ${num(c)}`;
      return multi(r, 'ineq', tr(`Укажите все числа, которые являются решениями неравенства ${ineq}`, `${ineq} теңсіздігінің шешімі болатын барлық сандарды көрсетіңіз`), right, wrong,
        [a < 0 ? tr(`Делим на ${num(a)} и меняем знак: x ${res} ${num(x0)}`, `${num(a)} санына бөліп, таңбаны өзгертеміз: x ${res} ${num(x0)}`)
          : tr(`Решение: x ${res} ${num(x0)}`, `Шешімі: x ${res} ${num(x0)}`), tr(`Подходят: ${right.join('; ')}`, `Сәйкес келетіндері: ${right.join('; ')}`)]);
    },
    trig(r) {
      const v = pick(r, ['1/2', '√3/2', '√2/2', '1']), k = ri(r, 1, 3);
      const right = pickN(r, TRIG.filter(x => x[1] === v), k), wrong = pickN(r, TRIG.filter(x => x[1] !== v), 6 - k);
      return multi(r, 'trig', tr(`Укажите все выражения, значение которых равно ${v}`, `Мәні ${v} санына тең барлық өрнектерді көрсетіңіз`), right.map(x => x[0]), wrong.map(x => x[0]),
        [right.map(x => `${x[0]} = ${x[1]}`).join(';  '), tr(`Остальные: ${wrong.map(x => `${x[0]} = ${x[1]}`).join(';  ')}`, `Қалғандары: ${wrong.map(x => `${x[0]} = ${x[1]}`).join(';  ')}`)]);
    },
    line(r) {
      const k = nz(r, -3, 3), b = ri(r, -5, 5), f = poly([[k, 1], [b, 0]]), xs = pickN(r, rangeInts(-5, 5), 6), n = ri(r, 2, 3);
      const right = xs.slice(0, n).map(x => pt(x, k * x + b)), wrong = xs.slice(n).map(x => pt(x, k * x + b + pick(r, [-3, -2, -1, 1, 2, 3])));
      return multi(r, 'linf', tr(`Укажите все точки, которые лежат на графике функции y = ${f}`, `y = ${f} функциясының графигінде жатқан барлық нүктелерді көрсетіңіз`), right, wrong,
        [tr('Подставляем x точки в формулу и сравниваем с y', 'Нүктенің x-ін формулаға қойып, y-пен салыстырамыз'), tr(`На графике: ${right.join('; ')}`, `Графикте: ${right.join('; ')}`)]);
    },
    deriv(r) {
      const a = ri(r, 1, 4), c1 = ri(r, 1, 9), c2 = ri(r, 1, 9), c3 = nz(r, -5, 5), k = ri(r, 1, 3), g = poly([[2 * a, 1]]);
      const right = pickN(r, [poly([[a, 2]]), poly([[a, 2], [c1, 0]]), poly([[a, 2], [-c2, 0]])], k);
      const wrong = [poly([[2 * a, 2]]), poly([[a, 2], [c3, 1]]), poly([[a, 3]]), poly([[2 * a, 1], [c1, 0]]), poly([[a, 2], [a, 1]]), poly([[a, 3], [c1, 0]]), poly([[2 * a, 2], [c2, 0]])];
      return multi(r, 'deriv', tr(`Укажите все функции, производная которых равна ${g}`, `Туындысы ${g} болатын барлық функцияларды көрсетіңіз`), right, wrong,
        [tr(`(${poly([[a, 2]])})′ = ${g}, а производная константы равна 0`, `(${poly([[a, 2]])})′ = ${g}, ал тұрақтының туындысы 0-ге тең`), tr(`Подходят: ${right.join('; ')}`, `Сәйкес келетіндері: ${right.join('; ')}`)]);
    },
    pow(r) {
      const b = pick(r, [2, 3, 5]), n = pick(r, [6, 8]), j = ri(r, 1, 3), k = ri(r, 1, 3);
      const right = pickN(r, [`${b}${sup(2)} · ${b}${sup(n - 2)}`, `(${b}${sup(2)})${sup(n / 2)}`, `${b}${sup(n + j)} : ${b}${sup(j)}`, `${b}${sup(n - 3)} · ${b}³`], k);
      const wrong = [`${b}${sup(2)} · ${b}${sup(n / 2)}`, `(${b}${sup(2)})${sup(n)}`, `${b}${sup(n + j)} · ${b}${sup(j)}`, `${b}${sup(n - 1)} · ${b}${sup(2)}`, `${b}${sup(n / 2)} + ${b}${sup(n / 2)}`, `${b}${sup(n + 2)} : ${b}`];
      return multi(r, 'pow', tr(`Укажите все выражения, равные ${b}${sup(n)}`, `${b}${sup(n)} өрнегіне тең барлық өрнектерді көрсетіңіз`), right, wrong,
        [tr('При умножении показатели складываются, при делении вычитаются, при возведении в степень перемножаются', 'Көбейткенде көрсеткіштер қосылады, бөлгенде азаяды, дәрежеге шығарғанда көбейтіледі'),
          tr(`Подходят: ${right.join('; ')}`, `Сәйкес келетіндері: ${right.join('; ')}`)]);
    },
    prog(r) {
      const a1 = ri(r, 1, 9), d = ri(r, 3, 6), k = ri(r, 1, 3);
      const right = pickN(r, rangeInts(4, 20), k).map(i => num(a1 + d * i));
      const wrong = rangeInts(4, 20).map(i => num(a1 + d * i + ri(r, 1, d - 1)));
      return multi(r, 'prog', tr(`Арифметическая прогрессия: ${a1}, ${a1 + d}, ${a1 + 2 * d}, … Укажите все числа, которые являются её членами.`,
        `Арифметикалық прогрессия: ${a1}, ${a1 + d}, ${a1 + 2 * d}, … Оның мүшесі болатын барлық сандарды көрсетіңіз.`), right, wrong,
        [tr(`Число x — член прогрессии, если (x − ${a1}) делится на ${d} без остатка`, `(x − ${a1}) саны ${d}-ге қалдықсыз бөлінсе, x — прогрессияның мүшесі`), tr(`Подходят: ${right.join('; ')}`, `Сәйкес келетіндері: ${right.join('; ')}`)]);
    }
  };

  const valueText = () => tr('Установите соответствие между выражением и его значением.', 'Өрнек пен оның мәні арасындағы сәйкестікті анықтаңыз.');
  const MATCH = {
    deriv(r) {
      const a = ri(r, 2, 5), n = ri(r, 2, 4), b = ri(r, 1, 4), c = nz(r, -6, 6);
      const f1 = poly([[a, n]]), d1 = poly([[a * n, n - 1]]), f2 = poly([[b, 2], [c, 1]]), d2 = poly([[2 * b, 1], [c, 0]]);
      return match(r, 'deriv', tr('Установите соответствие между функцией и её производной.', 'Функция мен оның туындысы арасындағы сәйкестікті анықтаңыз.'),
        [[`f(x) = ${f1}`, d1], [`f(x) = ${f2}`, d2]], [poly([[a * n, n]]), poly([[b, 1], [c, 0]]), poly([[2 * b, 1]]), poly([[a, n - 1]])],
        [`(${f1})′ = ${d1}`, `(${f2})′ = ${d2}`]);
    },
    log(r) {
      const i = ri(r, 2, 6); let j = ri(r, 1, 4); if (j === i) j = i - 1;
      const A = 2 ** i, B = 3 ** j;
      return match(r, 'log', valueText(), [[`log₂ ${A}`, num(i)], [`log₃ ${B}`, num(j)]], [num(A / 2), num(B / 3), num(i + j), num(i + 1), num(j + 1), num(i + j + 1), num(Math.max(i, j) + 2), '0'],
        [`2${sup(i)} = ${A}  ⇒  log₂ ${A} = ${i}`, `3${sup(j)} = ${B}  ⇒  log₃ ${B} = ${j}`]);
    },
    trig(r) {
      const [x, y] = pickN(r, TRIG.filter(e => !/1[2-8]0°/.test(e[0])), 6).reduce((acc, e) => (acc.length < 2 && !acc.some(z => z[1] === e[1]) ? acc.concat([e]) : acc), []);
      const other = uniq(TRIG.map(e => e[1])).filter(v => v !== x[1] && v !== y[1]);
      return match(r, 'trig', valueText(), [[x[0], x[1]], [y[0], y[1]]], pickN(r, other, 4), [`${x[0]} = ${x[1]}`, `${y[0]} = ${y[1]}`]);
    },
    quad(r) {
      const p1 = nz(r, 1, 6), q1 = -nz(r, 1, 6); let p2 = nz(r, 1, 6), q2 = nz(r, 1, 6);
      if (p2 === q2) q2 = p2 === 6 ? 5 : p2 + 1;
      const e1 = poly([[1, 2], [-(p1 + q1), 1], [p1 * q1, 0]]) + ' = 0', e2 = poly([[1, 2], [-(p2 + q2), 1], [p2 * q2, 0]]) + ' = 0';
      return match(r, 'quad', tr('Установите соответствие между уравнением и его корнями.', 'Теңдеу мен оның түбірлері арасындағы сәйкестікті анықтаңыз.'),
        [[e1, pair(p1, q1)], [e2, pair(p2, q2)]], [pair(-p2, -q2), pair(p1 + q1, p1 * q1), pair(-p1, -q1), pair(p1 - 1, q1 - 1), pair(p2 + 1, q2 + 1), pair(p2 + q2, p2 * q2)],
        [tr(`По теореме Виета: ${pair(p1, q1)} и ${pair(p2, q2)}`, `Виет теоремасы бойынша: ${pair(p1, q1)} және ${pair(p2, q2)}`)]);
    },
    area(r) {
      const a = ri(r, 3, 9), b = ri(r, 2, 8), c = 2 * ri(r, 2, 6); let h = ri(r, 3, 9);
      if (c * h / 2 === a * b) h += 1;
      const cm = s => `${s} ${tr('см²', 'см²')}`;
      return match(r, 'planmet', tr('Установите соответствие между фигурой и её площадью.', 'Фигура мен оның ауданы арасындағы сәйкестікті анықтаңыз.'),
        [[tr(`Прямоугольник со сторонами ${a} см и ${b} см`, `Қабырғалары ${a} см және ${b} см тіктөртбұрыш`), cm(a * b)],
          [tr(`Треугольник с основанием ${c} см и высотой ${h} см`, `Табаны ${c} см, биіктігі ${h} см үшбұрыш`), cm(c * h / 2)]],
        [cm(c * h), cm(2 * (a + b)), cm(dec(a * b / 2)), cm(c + h), cm(a + b), cm(a * b + c), cm(c * h / 2 + h)],
        [`S = ${a} · ${b} = ${a * b}`, `S = ${c} · ${h} / 2 = ${c * h / 2}`]);
    },
    prog(r) {
      const d = ri(r, 2, 5), n = ri(r, 5, 9), b1 = ri(r, 1, 3), q = pick(r, [2, 3]), m = ri(r, 3, 5), bm = b1 * q ** (m - 1);
      let a1 = ri(r, 1, 9); if (a1 + (n - 1) * d === bm) a1 += 1; // у двух пунктов должны быть разные ответы
      const an = a1 + (n - 1) * d;
      return match(r, 'prog', tr('Установите соответствие между прогрессией и её членом.', 'Прогрессия мен оның мүшесі арасындағы сәйкестікті анықтаңыз.'),
        [[tr(`Арифметическая: a₁ = ${a1}, d = ${d}. Член a${sub(n)}`, `Арифметикалық: a₁ = ${a1}, d = ${d}. a${sub(n)} мүшесі`), num(an)],
          [tr(`Геометрическая: b₁ = ${b1}, q = ${q}. Член b${sub(m)}`, `Геометриялық: b₁ = ${b1}, q = ${q}. b${sub(m)} мүшесі`), num(bm)]],
        [num(a1 + n * d), num(b1 * q ** m), num(an + d), num(b1 * q * m), num(an - d), num(bm * q * q), num(an + 2 * d)],
        [`a${sub(n)} = ${a1} + ${n - 1} · ${d} = ${an}`, `b${sub(m)} = ${b1} · ${q}${sup(m - 1)} = ${bm}`]);
    }
  };

  /* Контекст: один текст и пять заданий по нему. Числа подобраны так, чтобы ответы были целыми. */
  const ruPl = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
  const CONTEXT = {
    shop(r) {
      let P, Q, S, n, m, total, disc;
      for (let i = 0; i < 100; i++) {
        P = pick(r, [120, 160, 200, 240, 280]); Q = P * (100 - pick(r, [20, 25, 40, 50])) / 100; S = pick(r, [10, 20, 25]);
        n = ri(r, 3, 8); m = ri(r, 2, 6); total = n * P + m * Q; disc = total * S / 100;
        if (Number.isInteger(disc) && Number.isInteger(P * (100 - S) / 100)) break;
      }
      const p1 = P * (100 - S) / 100, X = pick(r, [1000, 1500, 2000, 2500, 3000]), cnt = Math.floor(X / p1), cheaper = Math.round((P - Q) / P * 100);
      const passage = tr(`В магазине канцтоваров тетрадь стоит ${money(P)}, а ручка — ${money(Q)}. В выходные на все товары действует скидка ${S}%. В субботу Айжан купила ${n} ${ruPl(n, 'тетрадь', 'тетради', 'тетрадей')} и ${m} ${ruPl(m, 'ручку', 'ручки', 'ручек')}.`,
        `Кеңсе тауарлары дүкенінде дәптер ${money(P)}, қалам ${money(Q)} тұрады. Демалыс күндері барлық тауарға ${S}% жеңілдік беріледі. Сенбі күні Айжан ${n} дәптер және ${m} қалам сатып алды.`);
      return { passage, tasks: [
        build('word', tr('Сколько стоила бы покупка Айжан без скидки?', 'Айжанның сатып алғаны жеңілдіксіз қанша тұрар еді?'), money(total),
          [[money((n + m) * P)], [money((n + m) * Q)], [money(n * P)], [money(total - disc)], [money(total + P)], [money(total - Q)], [money(total + 100)]],
          [`${n} · ${P} + ${m} · ${Q} = ${money(total)}`]),
        build('pct', tr('Сколько тенге составила скидка?', 'Жеңілдік неше теңге болды?'), money(disc),
          [[money(total - disc), 'answer_wrong_qty'], [money(total * S / 10)], [money(disc * 2)], [money(S * 10)], [money(disc + 100)], [money(S)]],
          [`${money(total)} · ${S} / 100 = ${money(disc)}`]),
        build('pct', tr('Сколько Айжан заплатила за покупку?', 'Айжан сатып алуға қанша төледі?'), money(total - disc),
          [[money(disc), 'answer_wrong_qty'], [money(total)], [money(total - S)], [money(total - 2 * disc)], [money(total - disc + 100)]],
          [tr(`${money(total)} − ${money(disc)} = ${money(total - disc)}`, `${money(total)} − ${money(disc)} = ${money(total - disc)}`)]),
        build('word', tr(`Сколько тетрадей можно купить в выходные на ${money(X)}?`, `Демалыс күндері ${money(X)}-ге неше дәптер сатып алуға болады?`), num(cnt),
          [[num(Math.floor(X / P))], [num(cnt + 1)], [num(cnt + 2)], [num(Math.max(0, cnt - 1))], [num(cnt + 3)]],
          [tr(`Тетрадь со скидкой: ${P} · ${100 - S} / 100 = ${money(p1)}`, `Жеңілдікпен дәптер: ${P} · ${100 - S} / 100 = ${money(p1)}`),
            tr(`${X} : ${p1} ≈ ${dec(X / p1)} — значит, ${cnt}`, `${X} : ${p1} ≈ ${dec(X / p1)} — демек, ${cnt}`)]),
        build('pct', tr('На сколько процентов ручка дешевле тетради?', 'Қалам дәптерден неше пайызға арзан?'), `${cheaper}%`,
          [[`${Math.round((P - Q) / Q * 100)}%`, 'prop_additive'], [`${P - Q}%`, 'answer_wrong_qty'], [`${100 - cheaper}%`], [`${cheaper + 5}%`], [`${cheaper + 10}%`], [`${cheaper - 5}%`]],
          [tr(`Разницу делим на цену тетради — то, с чем сравниваем: (${P} − ${Q}) / ${P} · 100% = ${cheaper}%`, `Айырманы дәптердің бағасына — салыстыратын шамаға бөлеміз: (${P} − ${Q}) / ${P} · 100% = ${cheaper}%`)])
      ] };
    },
    trip(r) {
      let v1, t1, v2, t2;
      for (let i = 0; i < 200; i++) {
        v1 = pick(r, [12, 15, 18, 20]); t1 = ri(r, 1, 3); v2 = pick(r, [10, 12, 15, 16, 18, 20, 24]); t2 = ri(r, 1, 2);
        if (v1 !== v2 && (v1 * t1 + v2 * t2) % (t1 + t2) === 0) break;
      }
      const d1 = v1 * t1, d2 = v2 * t2, D = d1 + d2, avg = D / (t1 + t2);
      const h = n => tr(ruPl(n, 'час', 'часа', 'часов'), 'сағ'), kmh = tr('км/ч', 'км/сағ');
      const passage = tr(`Велосипедист ехал из села в город. Первые ${d1} км он проехал за ${t1} ${h(t1)}, а оставшиеся ${d2} км — со скоростью ${v2} км/ч. Остановок не было.`,
        `Велосипедші ауылдан қалаға жүрді. Алғашқы ${d1} км-ді ол ${t1} сағатта жүріп өтті, ал қалған ${d2} км-ді ${v2} км/сағ жылдамдықпен жүрді. Аялдама болған жоқ.`);
      return { passage, tasks: [
        build('word', tr('С какой скоростью велосипедист ехал первую часть пути?', 'Велосипедші жолдың бірінші бөлігін қандай жылдамдықпен жүрді?'), `${v1} ${kmh}`,
          [[`${d1 * t1} ${kmh}`], [`${v2} ${kmh}`], [`${d1 + t1} ${kmh}`], [`${v1 + 2} ${kmh}`], [`${v1 + 5} ${kmh}`]], [`v = s / t = ${d1} / ${t1} = ${v1} ${kmh}`]),
        build('word', tr('Сколько часов заняла вторая часть пути?', 'Жолдың екінші бөлігі неше сағатқа созылды?'), num(t2),
          [[num(d2 * v2)], [frac(v2, d2)], [num(t1)], [num(t2 + 1)], [num(t2 + 2)], [num(t1 + t2)]], [`t = s / v = ${d2} / ${v2} = ${t2}`]),
        build('word', tr('Чему равно расстояние от села до города?', 'Ауылдан қалаға дейінгі қашықтық қанша?'), `${D} ${tr('км', 'км')}`,
          [[`${d1} ${tr('км', 'км')}`], [`${d2} ${tr('км', 'км')}`], [`${D + v2} ${tr('км', 'км')}`], [`${D - t1} ${tr('км', 'км')}`], [`${D + 10} ${tr('км', 'км')}`]], [`${d1} + ${d2} = ${D}`]),
        build('word', tr('Сколько часов велосипедист был в пути?', 'Велосипедші жолда неше сағат болды?'), num(t1 + t2),
          [[num(t1)], [num(t2)], [num(t1 + t2 + 1)], [num(t1 * t2 + 3)], [num(t1 + t2 + 2)]], [`${t1} + ${t2} = ${t1 + t2}`]),
        build('word', tr('Найдите среднюю скорость велосипедиста на всём пути.', 'Велосипедшінің бүкіл жолдағы орташа жылдамдығын табыңыз.'), `${avg} ${kmh}`,
          [[`${dec((v1 + v2) / 2)} ${kmh}`, 'answer_wrong_qty'], [`${v1} ${kmh}`], [`${v2} ${kmh}`], [`${avg + 1} ${kmh}`], [`${avg + 2} ${kmh}`], [`${avg - 2} ${kmh}`]],
          [tr('Средняя скорость — весь путь, делённый на всё время, а не среднее двух скоростей', 'Орташа жылдамдық — бүкіл жолды бүкіл уақытқа бөлу, екі жылдамдықтың орташасы емес'), `${D} / ${t1 + t2} = ${avg} ${kmh}`])
      ] };
    },
    deposit(r) {
      const A = pick(r, [100000, 200000, 400000, 500000]), p = pick(r, [5, 10, 12, 15, 20]);
      const y1 = A * p / 100, A1 = A + y1, A2 = Math.round(A1 * (100 + p) / 100), grow = A2 - A, pct2 = dec(grow / A * 100);
      const passage = tr(`Арман открыл вклад на ${money(A)} под ${p}% годовых. В конце каждого года банк начисляет проценты и прибавляет их к вкладу. Деньги со вклада Арман не снимает и не пополняет его.`,
        `Арман ${money(A)} салымды жылдық ${p}%-бен ашты. Банк әр жылдың соңында пайыз есептеп, оны салымға қосады. Арман салымнан ақша алмайды және оны толықтырмайды.`);
      return { passage, tasks: [
        build('pct', tr('Сколько тенге банк начислит за первый год?', 'Бірінші жылы банк неше теңге пайыз есептейді?'), money(y1),
          [[money(A1), 'answer_wrong_qty'], [money(A * p / 10)], [money(p * 1000)], [money(y1 * 2)], [money(y1 + 1000)]], [`${money(A)} · ${p} / 100 = ${money(y1)}`]),
        build('pct', tr('Сколько денег будет на вкладе через год?', 'Бір жылдан кейін салымда қанша ақша болады?'), money(A1),
          [[money(y1), 'answer_wrong_qty'], [money(A + p)], [money(A + 2 * y1)], [money(A)], [money(A1 + 1000)]], [`${money(A)} + ${money(y1)} = ${money(A1)}`]),
        build('pct', tr('Сколько денег будет на вкладе через 2 года?', 'Екі жылдан кейін салымда қанша ақша болады?'), money(A2),
          [[money(A + 2 * y1)], [money(A1)], [money(2 * A1)], [money(A2 + y1)], [money(A2 + 1000)]],
          [tr(`Во второй год проценты начисляются уже на ${money(A1)}`, `Екінші жылы пайыз ${money(A1)} сомасына есептеледі`), `${money(A1)} · ${100 + p} / 100 = ${money(A2)}`]),
        build('pct', tr('На сколько тенге вырастет вклад за 2 года?', 'Екі жылда салым неше теңгеге өседі?'), money(grow),
          [[money(2 * y1)], [money(A2)], [money(y1)], [money(grow + p * 100)], [money(grow + 1000)]], [`${money(A2)} − ${money(A)} = ${money(grow)}`]),
        build('pct', tr('На сколько процентов вырастет вклад за 2 года?', 'Екі жылда салым неше пайызға өседі?'), `${pct2}%`,
          [[`${2 * p}%`], [`${p}%`], [`${p * p}%`], [`${dec(grow / A * 100 + 1)}%`], [`${dec(grow / A * 100 + 2)}%`]],
          [`${money(grow)} / ${money(A)} · 100% = ${pct2}%`, tr(`Это больше, чем ${2 * p}%: во второй год проценты начисляются и на проценты первого года`, `Бұл ${2 * p}%-дан көп: екінші жылы бірінші жылдың пайызына да пайыз есептеледі`)])
      ] };
    }
  };

  // 25 заданий с одним ответом — по темам спецификации ЕНТ: от действий с числами до векторов в пространстве
  const SINGLE = ['arith', 'root', 'pow', 'trig', 'fsu', 'quad', 'ratq', 'trigeq', 'irr', 'exp', 'log', 'sys', 'nlsys', 'elsys', 'qineq',
    'sysineq', 'prog', 'deriv', 'integ', 'planfig', 'planmet', 'vec', 'solid', 'solmet', 'vec3'];

  function single(r, topic) {
    const gen = T.GENERATORS[topic], bank = T.questionsByTopic[topic];
    const q = gen && r() < 0.6 ? gen(r) : bank[Math.floor(r() * bank.length)];
    return { type: 'single', topic, text: q.text, options: T.shuffle(q.options, r).map(o => Object.assign({}, o)), sol: T.solutionOf(q) };
  }
  const clean = q => ({ text: q.text, options: q.options, sol: q.sol, topic: q.topic });

  T.buildEnt = function (r) {
    const tasks = SINGLE.map(id => single(r, id));
    const ctx = CONTEXT[pick(r, Object.keys(CONTEXT))](r);
    ctx.tasks.forEach(q => tasks.push(Object.assign(clean(q), { type: 'context', passage: ctx.passage, options: T.shuffle(q.options, r) })));
    pickN(r, Object.keys(MATCH), 5).forEach(k => tasks.push(MATCH[k](r)));
    pickN(r, Object.keys(MULTI), 5).forEach(k => tasks.push(MULTI[k](r)));
    return tasks;
  };
  T.entScore = scoreOf;
  T.ENT_POINTS = POINTS;
  T.ENT_MULTI = MULTI; T.ENT_MATCH = MATCH; T.ENT_CONTEXT = CONTEXT;

  /* ---------- Хранение ---------- */
  const KEY = (T.LEARNER_KEY || 'tamyr.academy.v1') + '.ent';
  let run = null;
  function load() {
    if (run) return run;
    try { run = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { run = null; }
    if (run && (!Array.isArray(run.tasks) || run.tasks.length !== 40 || !Array.isArray(run.answers))) run = null;
    return run;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* нет хранилища — тест живёт до перезагрузки */ } }
  function clear() { run = null; try { localStorage.removeItem(KEY); } catch (e) { /* нечего удалять */ } }
  T.entClear = clear;

  const answered = a => a !== null && a !== undefined && (!Array.isArray(a) || a.some(x => x !== null && x !== undefined));
  const typeName = type => ({ single: t('Один верный ответ'), context: t('Задание по тексту'), match: t('Соответствие'), multi: t('Один или несколько ответов') }[type]);
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const LETTERS = 'ABCDEF';

  function result() {
    const pts = run.tasks.map((task, i) => scoreOf(task, run.answers[i]));
    const by = {};
    run.tasks.forEach((task, i) => { const b = by[task.type] = by[task.type] || { got: 0, max: 0 }; b.got += pts[i]; b.max += POINTS[task.type]; });
    const lost = {};
    run.tasks.forEach((task, i) => { if (pts[i] < POINTS[task.type] && T.TOPIC[task.topic]) lost[task.topic] = (lost[task.topic] || 0) + POINTS[task.type] - pts[i]; });
    return { pts, by, score: pts.reduce((a, b) => a + b, 0), max: 50, lost: Object.entries(lost).sort((a, b) => b[1] - a[1]) };
  }

  function finish() {
    if (!run || run.done) return;
    run.done = true; run.finished = Date.now();
    const res = result();
    run.score = res.score;
    save();
    if (T.learner.exists()) T.learner.addEnt({ at: run.finished, score: res.score, max: res.max });
    location.hash = '#ent';
    T.viewEnt(document.getElementById('app'));
  }

  /* ---------- Экраны ---------- */
  let timer = null;
  T.viewEnt = function (app) {
    clearInterval(timer);
    load();
    if (run && !run.done && Date.now() >= run.deadline) return finish();
    if (!run) return intro(app);
    if (run.done) return results(app);
    test(app);
  };

  function intro(app) {
    const last = T.learner.exists() ? T.learner.entHistory().slice(-1)[0] : null;
    app.innerHTML = `
      <section class="card narrow ent-intro">
        <p class="eyebrow">${t('ЕНТ · математика')}</p>
        <h1>${t('Пробный ЕНТ')}</h1>
        <p class="lead">${t('40 заданий в формате НЦТ, как на экзамене по профильной математике. Ответы проверяются в конце.')}</p>
        <table class="ent-format">
          <tr><td>1–25</td><td>${t('Один верный ответ из четырёх')}</td><td>${t('1 балл')}</td></tr>
          <tr><td>26–30</td><td>${t('Пять заданий по одному тексту')}</td><td>${t('1 балл')}</td></tr>
          <tr><td>31–35</td><td>${t('Соответствие: каждому пункту — свой ответ')}</td><td>${t('2 балла')}</td></tr>
          <tr><td>36–40</td><td>${t('Один или несколько верных ответов из шести')}</td><td>${t('до 2 баллов')}</td></tr>
          <tr class="total"><td></td><td>${t('Всего · 80 минут')}</td><td>${t('50 баллов')}</td></tr>
        </table>
        <p class="muted small">${t('Тест можно прервать: он сохранится на этом устройстве, время продолжит идти. Задания — из банка и генераторов Tamyr: результат показывает, какие темы подтянуть, но не обещает балл на ЕНТ.')}</p>
        ${last ? `<p class="note">${t('Последний результат: {score} из {max} · {date}', { score: last.score, max: last.max, date: T.fmtDate(last.at) })}</p>` : ''}
        <div class="row">
          <button class="btn primary" id="ent-new">${t('Начать тест')}</button>
          <a class="btn ghost" href="#home">${t('На главную')}</a>
        </div>
      </section>`;
    app.querySelector('#ent-new').addEventListener('click', () => {
      const r = T.rng(Math.floor(Math.random() * 2147483647));
      run = { v: 1, started: Date.now(), deadline: Date.now() + DURATION, tasks: T.buildEnt(r), answers: Array(40).fill(null), cur: 0, done: false, lang: T.lang };
      save();
      test(app);
    });
  }

  function taskBody(task, a) {
    if (task.type === 'match') {
      return `<ol class="ent-items">${task.items.map((it, i) => `<li><span class="ent-item"><b>${i + 1}.</b> ${math(it.t)}</span>
          <span class="ent-pick" role="group" aria-label="${t('Ответ к пункту {n}', { n: i + 1 })}">${task.options.map((o, j) => `<button class="mopt${Array.isArray(a) && a[i] === j ? ' sel' : ''}" data-item="${i}" data-o="${j}" aria-pressed="${Array.isArray(a) && a[i] === j}">${LETTERS[j]}</button>`).join('')}</span></li>`).join('')}</ol>
        <ul class="ent-opts">${task.options.map((o, j) => `<li><span class="key">${LETTERS[j]}</span><span>${math(o)}</span></li>`).join('')}</ul>`;
    }
    const chosen = i => (task.type === 'multi' ? Array.isArray(a) && a.includes(i) : a === i);
    return `${task.type === 'multi' ? `<p class="muted small">${t('Выберите один или несколько ответов.')}</p>` : ''}
      <div class="options">${task.options.map((o, i) => `<button class="opt${chosen(i) ? ' sel' : ''}" data-i="${i}" aria-pressed="${chosen(i)}"><span class="key">${LETTERS[i]}</span><span>${math(o.t)}</span></button>`).join('')}</div>`;
  }

  function test(app) {
    const i = run.cur, task = run.tasks[i], a = run.answers[i];
    const left = run.answers.filter(x => !answered(x)).length;
    app.innerHTML = `
      <section class="card narrow ent-test">
        <div class="qmeta"><span class="chip">${t('Задание {n} из 40', { n: i + 1 })} · ${typeName(task.type)}</span><span class="ent-timer" id="ent-timer" aria-live="off">${mmss(run.deadline - Date.now())}</span></div>
        <nav class="ent-nav" aria-label="${t('Задания')}">${run.tasks.map((x, j) => `<button class="${j === i ? 'cur' : ''}${answered(run.answers[j]) ? ' done' : ''}" data-go="${j}" aria-label="${t('Задание {n}', { n: j + 1 })}">${j + 1}</button>`).join('')}</nav>
        ${task.passage ? `<div class="ent-passage">${math(task.passage)}</div>` : ''}
        <h2 class="qtext">${math(task.text)}</h2>
        ${taskBody(task, a)}
        <div class="row ent-move">
          <button class="btn ghost" id="ent-prev" ${i === 0 ? 'disabled' : ''}>${t('Назад')}</button>
          ${i < 39 ? `<button class="btn primary" id="ent-next">${t('Далее')}</button>` : ''}
          <button class="btn ${i === 39 ? 'primary' : ''}" id="ent-end">${run.confirm ? (left ? t('Без ответа: {n}. Точно завершить?', { n: left }) : t('Точно завершить?')) : t('Завершить тест')}</button>
        </div>
        <a class="btn ghost small" href="#home">${t('Прервать — тест сохранится')}</a>
      </section>`;
    const set = v => { run.answers[i] = v; save(); test(app); };
    app.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      const j = Number(b.dataset.i);
      if (task.type !== 'multi') return set(a === j ? null : j);
      const cur = Array.isArray(a) ? a.slice() : [];
      set(cur.includes(j) ? cur.filter(x => x !== j) : cur.concat(j).sort());
    }));
    app.querySelectorAll('.mopt').forEach(b => b.addEventListener('click', () => {
      const cur = Array.isArray(a) ? a.slice() : task.items.map(() => null), k = Number(b.dataset.item), j = Number(b.dataset.o);
      cur[k] = cur[k] === j ? null : j;
      set(cur);
    }));
    const go = j => { run.cur = Math.max(0, Math.min(39, j)); run.confirm = false; save(); window.scrollTo(0, 0); test(app); };
    app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.go))));
    app.querySelector('#ent-prev').addEventListener('click', () => go(i - 1));
    const next = app.querySelector('#ent-next');
    if (next) next.addEventListener('click', () => go(i + 1));
    app.querySelector('#ent-end').addEventListener('click', () => { if (!run.confirm) { run.confirm = true; return test(app); } run.confirm = false; finish(); });
    clearInterval(timer);
    timer = setInterval(() => {
      const el = document.getElementById('ent-timer');
      if (!el || !run || run.done) return clearInterval(timer);
      const ms = run.deadline - Date.now();
      el.textContent = mmss(ms);
      el.classList.toggle('low', ms < 5 * 60 * 1000);
      if (ms <= 0) { clearInterval(timer); finish(); }
    }, 1000);
  }

  function answerText(task, a) {
    if (!answered(a)) return t('нет ответа');
    if (task.type === 'match') return a.map((x, i) => `${i + 1} → ${x === null || x === undefined ? '—' : LETTERS[x]}`).join(', ');
    if (task.type === 'multi') return a.map(i => LETTERS[i]).join(', ');
    return LETTERS[a];
  }
  function correctText(task) {
    if (task.type === 'match') return task.items.map((it, i) => `${i + 1} → ${LETTERS[it.a]}`).join(', ');
    return task.options.map((o, i) => (o.ok ? LETTERS[i] : null)).filter(Boolean).join(', ');
  }

  function results(app) {
    const res = result(), names = { single: '1–25', context: '26–30', match: '31–35', multi: '36–40' };
    const used = Math.min(DURATION, (run.finished || Date.now()) - run.started);
    app.innerHTML = `
      <section class="result-head">
        <div>
          <p class="eyebrow">${t('Пробный ЕНТ · математика')}</p>
          <h1>${t('{score} из 50 баллов', { score: res.score })}</h1>
          <p class="lead">${res.lost.length ? t('Больше всего баллов потеряно в темах ниже — с них и стоит начать.') : t('Ни одного потерянного балла. Отличный результат!')}</p>
        </div>
        <div class="stats"><div><b>${res.pts.filter((p, i) => p === POINTS[run.tasks[i].type]).length}</b><span>${t('заданий без ошибок')}</span></div><div><b>${mmss(used)}</b><span>${t('времени ушло')}</span></div></div>
      </section>
      <section class="grid2">
        <div class="card">
          <h2>${t('Баллы по частям теста')}</h2>
          <table class="ent-format">${['single', 'context', 'match', 'multi'].map(k => `<tr><td>${names[k]}</td><td>${typeName(k)}</td><td><b>${res.by[k].got}</b> / ${res.by[k].max}</td></tr>`).join('')}</table>
        </div>
        <div class="card">
          <h2>${t('Темы, где потеряны баллы')}</h2>
          ${res.lost.length ? `<ul class="ent-lost">${res.lost.slice(0, 8).map(([id, n]) => `<li><a href="#lesson/${id}">${esc(T.TOPIC[id].title)}</a><span class="muted small">−${n}</span></li>`).join('')}</ul>` : `<p class="muted">${t('Нет таких тем.')}</p>`}
        </div>
      </section>
      <section class="card">
        <h2>${t('Разбор заданий')}</h2>
        <ol class="ent-review">${run.tasks.map((task, i) => {
          const p = res.pts[i], max = POINTS[task.type], cls = p === max ? 'good' : p ? 'part' : 'bad';
          return `<li class="${cls}"><details><summary><span class="n">${i + 1}</span><span class="txt">${math(task.text)}</span><span class="pts">${p} / ${max}</span></summary>
            ${task.passage ? `<div class="ent-passage">${math(task.passage)}</div>` : ''}
            ${task.type === 'match' ? `<ol class="ent-items">${task.items.map((it, k) => `<li><span><b>${k + 1}.</b> ${math(it.t)}</span></li>`).join('')}</ol>` : ''}
            <ul class="ent-opts">${(task.type === 'match' ? task.options.map(o => ({ t: o })) : task.options).map((o, j) => `<li class="${o.ok ? 'ok' : ''}"><span class="key">${LETTERS[j]}</span><span>${math(o.t)}</span></li>`).join('')}</ul>
            <p>${t('Твой ответ: {a}. Верно: {b}.', { a: answerText(task, run.answers[i]), b: correctText(task) })}</p>
            ${task.sol && task.sol.length ? `<ol class="steps">${task.sol.map(x => `<li><span class="m">${math(x)}</span></li>`).join('')}</ol>` : ''}
          </details></li>`;
        }).join('')}</ol>
        <div class="row"><button class="btn primary" id="ent-again">${t('Пройти новый вариант')}</button><a class="btn ghost" href="#home">${t('На главную')}</a></div>
      </section>`;
    app.querySelector('#ent-again').addEventListener('click', () => { clear(); intro(app); });
  }

  // для главной: идёт ли тест и сколько осталось
  T.entPending = () => { load(); return run && !run.done && Date.now() < run.deadline ? run : null; };
})();
