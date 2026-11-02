/*
 * Независимая проверка задач генераторов (js/gen-ent.js и js/content.js): читаем ТЕКСТ задачи, решаем её заново
 * другим способом — подстановкой, численной производной и интегралом, перебором — и сверяем с вариантом, помеченным верным.
 * Решение генератора здесь не используется. Задачи — на русском (T.lang = 'ru').
 * В браузере: tests-academy.html. В Node: node tools/verify_gen.js — 300 задач на каждый генератор.
 */
(function (root) {
  const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const fromSup = s => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => SUPS.indexOf(c)).replace(/⁻/g, '-').replace(/⁺/g, '+');
  const fromSub = s => s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => SUBS.indexOf(c));
  const close = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

  /* «2x³ − 3x + 1», «(x − 2)(x + 2)», «√2/2» → функция от x. */
  function fn(expr) {
    let s = expr.replace(/−/g, '-').replace(/·/g, '*').replace(/:/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
    s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, m => '**(' + fromSup(m) + ')');
    s = s.replace(/√\(/g, 'Math.sqrt(').replace(/√([0-9.]+)/g, 'Math.sqrt($1)').replace(/π/g, 'Math.PI');
    s = s.replace(/([0-9x)])(?=[x(M])/g, '$1*');
    s = s.replace(/(^|[(*+\-/])-/g, '$1(-1)*'); // унарный минус: в JS «-x**2» без скобок — ошибка
    if (!/^[-+*/().0-9xMathsqrtPI]*$/.test(s)) throw new Error('не разобрать: ' + expr);
    return new Function('x', 'return ' + s); // eslint-disable-line no-new-func
  }
  const val = expr => fn(expr)(0);
  const sameFn = (a, b) => [-2.5, -1, 0.5, 1.5, 3].every(x => close(fn(a)(x), fn(b)(x)));
  const nums = s => (s.replace(/−/g, '-').match(/-?\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
  const roots = s => (/Корней нет/.test(s) ? [] : nums(s));

  function verify(q) {
    const t = q.text, ok = q.options.find(o => o.ok).t;
    let m;
    const fail = why => `${q.topic}: «${t}» → «${ok}»: ${why}`;
    try {
      switch (q.topic) {
        case 'pow':
          if ((m = t.match(/^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+) = \?$/))) return close(Number(ok), Number(m[1]) ** Number(fromSup(m[2]))) ? null : fail('степень');
          if ((m = t.match(/^\(−(\d+)\)² = \?$/))) return Number(ok) === Number(m[1]) ** 2 ? null : fail('квадрат');
          if ((m = t.match(/Упростите: (.+)$/))) return sameFn(m[1].replace(/\)(?=[²³⁴⁵⁶⁷⁸⁹])/g, ')'), ok) ? null : fail('преобразование');
          break;
        case 'root':
          if ((m = t.match(/^√(\d+) = \?$/))) return close(Number(ok), Math.sqrt(Number(m[1]))) ? null : fail('корень');
          if ((m = t.match(/^√\((\d+) \+ (\d+)\) = \?$/))) return close(Number(ok), Math.sqrt(Number(m[1]) + Number(m[2]))) ? null : fail('корень суммы');
          if ((m = t.match(/Упростите: √(\d+)$/))) {
            const [k, r] = ok.split('√').map(Number);
            return k * k * r === Number(m[1]) && ![4, 9, 16, 25].some(s => r % s === 0) ? null : fail('вынесение множителя');
          }
          break;
        case 'fsu':
          if ((m = t.match(/Раскройте скобки: (.+)$/))) return sameFn(m[1], ok) ? null : fail('скобки');
          if ((m = t.match(/Вычислите: (\d+)² − (\d+)²/))) return Number(ok) === Number(m[1]) ** 2 - Number(m[2]) ** 2 ? null : fail('разность квадратов');
          break;
        case 'quad': {
          if ((m = t.match(/дискриминант уравнения (.+) = 0/))) {
            const f = fn(m[1]), c = f(0), a = (f(1) + f(-1)) / 2 - c, b = (f(1) - f(-1)) / 2;
            return close(Number(ok.replace('−', '-')), b * b - 4 * a * c) ? null : fail('дискриминант');
          }
          if ((m = t.match(/: x² = (\d+)$/))) { const n = Math.sqrt(Number(m[1])); return ok === `x = ±${n}` ? null : fail('x² = n²'); }
          m = t.match(/: (.+) = 0$/); const f = fn(m[1]), rs = roots(ok);
          const c = f(0), a = (f(1) + f(-1)) / 2 - c, b = (f(1) - f(-1)) / 2, D = b * b - 4 * a * c;
          const want = D < 0 ? 0 : D === 0 ? 1 : 2;
          return rs.length === want && rs.every(x => close(f(x), 0)) ? null : fail('корни');
        }
        case 'ineq': {
          m = t.match(/: (.+) ([<>≥≤]) (−?\d+)$/); const f = fn(m[1]), c = nums(m[3])[0];
          const a = ok.match(/^x ([<>≥≤]) (−?\d+)$/), x0 = nums(a[2])[0];
          const test = (op, l, r) => ({ '<': l < r, '>': l > r, '≤': l <= r, '≥': l >= r }[op]);
          for (let x = x0 - 4; x <= x0 + 4; x += 0.5) if (test(m[2], f(x), c) !== test(a[1], x, x0)) return fail('при x = ' + x);
          return null;
        }
        case 'sys': {
          const eqs = t.split('.')[0].split(', ');
          const sat = (x, y) => eqs.every(e => { const [l, r] = e.split(' = '); const L = fn(l.replace(/y/g, '(' + y + ')')), R = fn(r.replace(/y/g, '(' + y + ')')); return close(L(x), R(x)); });
          if (/Решение системы/.test(t)) { const [x, y] = nums(ok); return sat(x, y) ? null : fail('пара'); }
          // ищем x перебором целых y: единственная пара, удовлетворяющая обоим
          const x = nums(ok)[0];
          for (let y = -60; y <= 60; y++) if (sat(x, y)) return null;
          return fail('x');
        }
        case 'linf': {
          const f = fn(t.match(/y = (.+?)(?: пересекает|\?|\. )/)[1]);
          if (/ось Oy/.test(t)) { const [x, y] = nums(ok); return x === 0 && close(f(0), y) ? null : fail('Oy'); }
          if (/ось Ox/.test(t)) { const [x, y] = nums(ok); return y === 0 && close(f(x), 0) ? null : fail('Ox'); }
          if (/угловой/.test(t)) return close(f(1) - f(0), nums(ok)[0]) ? null : fail('k');
          m = t.match(/при x = (−?\d+)/); return close(f(nums(m[1])[0]), nums(ok)[0]) ? null : fail('значение');
        }
        case 'parab': {
          if (/ветви/.test(t)) { const f = fn(t.match(/y = (.+)\?/)[1]); return (f(100) > 0) === (ok === 'Вверх') ? null : fail('ветви'); }
          if (/нули/.test(t)) { const f = fn(t.match(/y = (.+)\./)[1]); const rs = roots(ok); return rs.length === 2 && rs.every(x => close(f(x), 0)) ? null : fail('нули'); }
          const f = fn(t.match(/параболы y = (.+):$/)[1]), [x0, y0] = nums(ok);
          return close(f(x0), y0) && close(f(x0 - 1), f(x0 + 1)) ? null : fail('вершина');
        }
        case 'prog': {
          const g = k => nums(fromSub(t.split(k + ' = ')[1] || ''))[0];
          if (/Геометрическая/.test(t)) { const n = Number(fromSub(t.match(/Найдите b([₀-₉]+)/)[1])); return close(g('b₁') * g('q') ** (n - 1), nums(ok)[0]) ? null : fail('bₙ'); }
          if (/сумму первых (\d+)/.test(t)) {
            const n = Number(t.match(/сумму первых (\d+)/)[1]); let S = 0;
            for (let i = 0; i < n; i++) S += g('a₁') + i * g('d');
            return close(S, nums(ok)[0]) ? null : fail('Sₙ');
          }
          if (/разность/.test(t)) {
            m = t.match(/a([₀-₉]+) = (−?\d+)\. Найдите разность/); const k = Number(fromSub(m[1])), ak = nums(m[2])[0];
            return close(g('a₁') + (k - 1) * nums(ok)[0], ak) ? null : fail('d');
          }
          const n = Number(fromSub(t.match(/Найдите a([₀-₉]+)/)[1]));
          let a = g('a₁'); for (let i = 1; i < n; i++) a += g('d');
          return close(a, nums(ok)[0]) ? null : fail('aₙ');
        }
        case 'log': {
          if ((m = t.match(/(?:log([₀-₉]+)|lg) (\d+)$/)) && /Вычислите/.test(t) && !/\+/.test(t)) {
            const b = m[1] ? Number(fromSub(m[1])) : 10; return close(b ** Number(ok), Number(m[2])) ? null : fail('log');
          }
          if ((m = t.match(/log₂ (\d+) \+ log₂ (\d+)/))) return close(2 ** Number(ok), Number(m[1]) * Number(m[2])) ? null : fail('сумма логарифмов');
          if ((m = t.match(/log([₀-₉]+) x = (\d+)/))) return close(nums(ok)[0], Number(fromSub(m[1])) ** Number(m[2])) ? null : fail('уравнение');
          if ((m = t.match(/log[₀-₉]+\(x ([−+]) (\d+)\)/))) { const a = (m[1] === '−' ? 1 : -1) * Number(m[2]); return ok === `x > ${a < 0 ? '−' + -a : a}` ? null : fail('ОДЗ'); }
          break;
        }
        case 'exp': {
          if ((m = t.match(/(\d+)\^\(−(\d+)\)$/))) return close(val(ok), Number(m[1]) ** -Number(m[2])) ? null : fail('отрицательный показатель');
          m = t.match(/: (\d+)\^(?:x|\(x − (\d+)\)) = (.+)$/); const b = Number(m[1]), a = Number(m[2] || 0), rhs = val(m[3]), x = nums(ok)[0];
          return close(b ** (x - a), rhs) ? null : fail('показательное');
        }
        case 'trig': {
          if (/sin²(\d+)° \+ cos²/.test(t)) return ok === '1' ? null : fail('тождество');
          if ((m = t.match(/Вычислите: (sin|cos|tg) (\d+)°/))) {
            const r = Number(m[2]) * Math.PI / 180, v = { sin: Math.sin, cos: Math.cos, tg: Math.tan }[m[1]](r);
            return close(val(ok), v) ? null : fail('табличное значение');
          }
          m = t.match(/sin α = (\d+)\/(\d+), угол α (в первой|во второй)/); const s = Number(m[1]) / Number(m[2]);
          const c = val(ok); return close(s * s + c * c, 1) && (m[3] === 'в первой' ? c > 0 : c < 0) ? null : fail('cos по sin');
        }
        case 'deriv': {
          const f = fn(t.match(/(?:f\(x\)|y) = (.+?)(?:\. Найдите| в точке|$)/)[1]), d = x => (f(x + 1e-4) - f(x - 1e-4)) / 2e-4;
          if (/Найдите производную/.test(t)) { const g = fn(ok); return [-2, 0.5, 1.5].every(x => Math.abs(g(x) - d(x)) < 1e-3 * Math.max(1, Math.abs(g(x)))) ? null : fail('производная'); }
          const x0 = nums((t.match(/f′\((−?\d+)\)/) || t.match(/x₀ = (−?\d+)/))[1])[0];
          return Math.abs(d(x0) - nums(ok)[0]) < 1e-3 ? null : fail('f′(x₀)');
        }
        case 'integ': {
          if ((m = t.match(/∫₀([⁰¹²³⁴⁵⁶⁷⁸⁹]) (.+) dx/))) {
            const B = Number(fromSup(m[1])), f = fn(m[2]); let S = 0; const N = 2000;
            for (let i = 0; i < N; i++) S += f((i + 0.5) * B / N) * B / N;
            return Math.abs(S - nums(ok)[0]) < 1e-3 * Math.max(1, Math.abs(S)) ? null : fail('интеграл');
          }
          const f = fn(t.match(/f\(x\) = (.+)$/)[1]), F = fn(ok.replace(/ \+ C$/, ''));
          return [-1.5, 0.5, 2].every(x => Math.abs((F(x + 1e-4) - F(x - 1e-4)) / 2e-4 - f(x)) < 1e-3 * Math.max(1, Math.abs(f(x)))) && / \+ C$/.test(ok) ? null : fail('первообразная');
        }
        case 'planmet': {
          const n = nums(t), a = nums(ok)[0];
          if (/гипотенузу/.test(t)) return close(a, Math.hypot(n[0], n[1])) ? null : fail('гипотенуза');
          if (/второй катет/.test(t)) return close(a * a + n[1] * n[1], n[0] * n[0]) ? null : fail('катет');
          if (/площадь треугольника/.test(t)) return close(a, n[0] * n[1] / 2) ? null : fail('площадь');
          if (/подобны/.test(t)) return close(a, n[1] * n[0] * n[0]) ? null : fail('подобие');
          break;
        }
        default: return null; // генераторы content.js проверяются своими тестами
      }
    } catch (e) { return fail('ошибка проверки: ' + e.message); }
    return fail('вид задачи не распознан');
  }
  root.verifyGenerated = verify;

  /* Пробный ЕНТ (js/ent.js): задания «несколько ответов» и «соответствие». Для каждого варианта решаем заново,
     подходит ли он, и сверяем с пометкой. Возвращает null или текст ошибки. */
  const trigVal = e => { const m = e.match(/^(sin|cos|tg) (\d+)°$/); const r = Number(m[2]) * Math.PI / 180; return { sin: Math.sin, cos: Math.cos, tg: Math.tan }[m[1]](r); };
  const deriv = f => x => (f(x + 1e-4) - f(x - 1e-4)) / 2e-4;
  const sameDeriv = (F, g) => [-1.5, 0.5, 2].every(x => Math.abs(deriv(fn(F))(x) - fn(g)(x)) < 1e-3 * Math.max(1, Math.abs(fn(g)(x))));
  function verifyEnt(task) {
    const t = task.text;
    const fail = why => `${task.type} ${task.topic}: «${t}»: ${why}`;
    try {
      if (task.type === 'multi') {
        let fits, m;
        if ((m = t.match(/корни уравнения (.+) = 0$/))) { const f = fn(m[1]); fits = o => close(f(nums(o)[0]), 0); }
        else if ((m = t.match(/неравенства (.+) ([<>≥≤]) (−?\d+)$/))) { const f = fn(m[1]), c = nums(m[3])[0], op = m[2]; fits = o => { const v = f(nums(o)[0]); return { '<': v < c, '>': v > c, '≤': v <= c, '≥': v >= c }[op]; }; }
        else if ((m = t.match(/значение которых равно (.+)$/))) { const v = val(m[1]); fits = o => close(trigVal(o), v); }
        else if ((m = t.match(/графике функции y = (.+)$/))) { const f = fn(m[1]); fits = o => { const [x, y] = nums(o); return close(f(x), y); }; }
        else if ((m = t.match(/производная которых равна (.+)$/))) { const g = m[1]; fits = o => sameDeriv(o, g); }
        else if ((m = t.match(/выражения, равные (.+)$/))) { const v = val(m[1]); fits = o => close(val(o), v); }
        else if ((m = t.match(/прогрессия: (−?\d+), (−?\d+),/))) { const a = Number(m[1]), d = Number(m[2]) - a; fits = o => { const x = nums(o)[0]; return x >= a && (x - a) % d === 0; }; }
        else return fail('вид не распознан');
        const right = task.options.filter(o => o.ok).length;
        if (task.options.length !== 6 || new Set(task.options.map(o => o.t)).size !== 6 || right < 1 || right > 3) return fail('6 разных вариантов, верных 1–3');
        const wrong = task.options.find(o => !!o.ok !== !!fits(o.t));
        return wrong ? fail(`вариант «${wrong.t}» помечен ${wrong.ok ? 'верным' : 'неверным'}`) : null;
      }
      if (task.type === 'match') {
        if (task.items.length !== 2 || task.options.length !== 4 || new Set(task.options).size !== 4 || task.items[0].a === task.items[1].a) return fail('2 пункта, 4 разных варианта, разные ответы');
        const fits = (item, o) => {
          let m;
          if ((m = item.match(/^f\(x\) = (.+)$/))) return sameDeriv(m[1], o);
          if ((m = item.match(/^log([₀-₉]) (\d+)$/))) return close(Number(fromSub(m[1])) ** nums(o)[0], Number(m[2]));
          if (/^(sin|cos|tg) /.test(item)) return close(trigVal(item), val(o));
          if ((m = item.match(/^(.+) = 0$/))) { const f = fn(m[1]), rs = nums(o); return rs.length === 2 && rs.every(x => close(f(x), 0)); }
          if ((m = item.match(/^Прямоугольник со сторонами (\d+) см и (\d+) см$/))) return nums(o)[0] === Number(m[1]) * Number(m[2]);
          if ((m = item.match(/^Треугольник с основанием (\d+) см и высотой (\d+) см$/))) return nums(o)[0] === Number(m[1]) * Number(m[2]) / 2;
          if ((m = item.match(/^Арифметическая: a₁ = (\d+), d = (\d+)\. Член a([₀-₉]+)$/))) return nums(o)[0] === Number(m[1]) + (Number(fromSub(m[3])) - 1) * Number(m[2]);
          if ((m = item.match(/^Геометрическая: b₁ = (\d+), q = (\d+)\. Член b([₀-₉]+)$/))) return nums(o)[0] === Number(m[1]) * Number(m[2]) ** (Number(fromSub(m[3])) - 1);
          throw new Error('пункт не распознан: ' + item);
        };
        for (const it of task.items) {
          const ok = task.options.map((o, j) => j).filter(j => fits(it.t, task.options[j]));
          if (ok.length !== 1 || ok[0] !== it.a) return fail(`пункт «${it.t}»: подходят ${ok.map(j => task.options[j]).join(', ') || 'ни один'}, помечен ${task.options[it.a]}`);
        }
        return null;
      }
      return null;
    } catch (e) { return fail('ошибка проверки: ' + e.message); }
  }
  root.verifyEnt = verifyEnt;

  if (typeof module !== 'undefined' && require.main === module) {
    global.window = global; global.Tamyr = {}; global.location = { search: '', hash: '' };
    global.document = { documentElement: {}, addEventListener() {} }; global.localStorage = { getItem() { return null; }, setItem() {} }; global.navigator = { language: 'ru' };
    ['data', 'data-ent', 'i18n', 'engine', 'content', 'content-ent', 'gen-ent'].forEach(f => require('../js/' + f + '.js'));
    require('../js/ent.js');
    const T = global.Tamyr; T.lang = 'ru';
    let n = 0; const bad = [];
    Object.values(T.GENERATORS).forEach(g => { for (let s = 1; s <= 300; s++) { n++; const e = verify(g(T.rng(s))); if (e) bad.push(e); } });
    [T.ENT_MULTI, T.ENT_MATCH].forEach(set => Object.values(set).forEach(g => { for (let s = 1; s <= 300; s++) { n++; const e = verifyEnt(g(T.rng(s))); if (e) bad.push(e); } }));
    console.log(`Проверено задач: ${n}, ошибок: ${bad.length}`);
    bad.slice(0, 20).forEach(e => console.log('  ' + e));
    process.exit(bad.length ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
