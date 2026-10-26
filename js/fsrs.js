/*
 * FSRS-5 — модель забывания, тот же алгоритм, что в Anki.
 * По истории повторений темы оценивает «стабильность» памяти (через сколько дней вероятность вспомнить упадёт до 90%)
 * и сложность темы для ученика, и ставит следующее повторение на этот день.
 * Параметры по умолчанию — из открытого проекта FSRS, обучены на миллионах повторений; свои подберём по журналу ответов.
 * Формулы: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */
(function () {
  const T = window.Tamyr;
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const RETENTION = 0.9;   // повторяем, когда вероятность вспомнить падает до 90%
  const MAX_DAYS = 60;     // до ЕНТ обычно меньше полугода — дальше двух месяцев не откладываем
  const DAY = 86400000;
  const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

  const clampD = d => Math.min(10, Math.max(1, d));
  const d0 = g => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
  // Вероятность вспомнить через t дней при стабильности s. При t = s она ровно 90%.
  const recall = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);

  /* Следующее состояние памяти после повторения. card — {s, d, last} или null (тема ещё не повторялась), g — оценка 1–4. */
  function review(card, g, now) {
    if (!card) return { s: W[g - 1], d: d0(g), last: now };
    const days = Math.max(0, (now - card.last) / DAY);
    let s;
    if (days < 1) {
      s = card.s * Math.exp(W[17] * (g - 3 + W[18]));     // повторение в тот же день
    } else {
      const r = recall(days, card.s);
      s = g === AGAIN
        ? Math.min(card.s, W[11] * Math.pow(card.d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)))
        : card.s * (1 + Math.exp(W[8]) * (11 - card.d) * Math.pow(card.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1)
          * (g === HARD ? W[15] : 1) * (g === EASY ? W[16] : 1));
    }
    const d = card.d - W[6] * (g - 3) * (10 - card.d) / 9;
    return { s: Math.max(0.1, s), d: clampD(W[7] * d0(EASY) + (1 - W[7]) * d), last: now };
  }

  /* Через сколько дней повторять: когда вероятность вспомнить дойдёт до RETENTION. */
  const interval = card => Math.min(MAX_DAYS, Math.max(1, Math.round(card.s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1))));

  /* Вероятность вспомнить тему сейчас (0–1) или null, если тема ещё не повторялась. */
  const retrievability = (card, now) => (card ? recall(Math.max(0, (now - card.last) / DAY), card.s) : null);

  /* Сохранённое состояние могло испортиться: берём только осмысленные числа. */
  const sanitize = c => (c && [c.s, c.d, c.last].every(Number.isFinite) && c.s > 0 ? { s: c.s, d: clampD(c.d), last: c.last } : null);

  T.fsrs = { review, interval, retrievability, sanitize, AGAIN, HARD, GOOD, EASY, RETENTION };
})();
