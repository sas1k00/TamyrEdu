/*
 * Все проверки в браузере одной командой — локально и в GitHub Actions.
 *   python3 -m http.server 8765 &   (из корня репозитория)
 *   node tools/run_tests.js http://127.0.0.1:8765
 * Что проверяется: tests.html (движок + симуляция), tests-academy.html на русском и казахском,
 * «дымовой» прогон приложения: главные экраны открываются без ошибок JavaScript и без горизонтальной прокрутки,
 * и незаконченная диагностика переживает уход на другой экран и обновление страницы.
 * Нужен Playwright (npm i playwright; npx playwright install chromium). Выход с кодом 1 при любой ошибке.
 */
const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  const report = (ok, line) => { if (!ok) failed++; console.log((ok ? '  ✓ ' : '  ✗ ') + line); };

  for (const page of ['tests.html', 'tests-academy.html', 'tests-academy.html?lang=kk']) {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/${page}`);
    await p.waitForFunction(() => Array.isArray(window.TEST_RESULTS), null, { timeout: 120000 });
    const res = await p.evaluate(() => window.TEST_RESULTS.map(r => ({ name: r.name, ok: r.ok, err: r.err })));
    const bad = res.filter(r => !r.ok);
    console.log(`${page}: ${res.length - bad.length} из ${res.length}`);
    bad.forEach(r => report(false, `${r.name} — ${r.err}`));
    errors.forEach(e => report(false, `ошибка JavaScript: ${e}`));
    await p.close();
  }

  // дымовой прогон: экраны приложения на телефоне и на компьютере
  console.log('Экраны приложения:');
  for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    for (const hash of ['', '#demo', '#home', '#map', '#progress', '#lesson/frac', '#practice/frac', '#start', '#account', '#teacher', '#ent']) {
      await p.goto(`${BASE}/index.html${hash}`);
      await p.waitForTimeout(300);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      const empty = await p.evaluate(() => !document.getElementById('app').textContent.trim());
      report(!overflow && !empty, `${vp.width}px ${hash || '/'}${overflow ? ' — горизонтальная прокрутка' : ''}${empty ? ' — пустой экран' : ''}`);
    }
    errors.forEach(e => report(false, `${vp.width}px: ошибка JavaScript: ${e}`));
    await ctx.close();
  }

  // диагностика не теряется: ушёл на «Карту» и обновил страницу — вернулся к тому же вопросу
  console.log('Незаконченная диагностика:');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/index.html#start`);
    await p.fill('#name', 'Тест');
    await p.click('#start-form button[type=submit]');
    for (let i = 0; i < 3; i++) { await p.click('.opt >> nth=0'); await p.waitForTimeout(50); }
    const question = await p.textContent('.qtext');
    await p.goto(`${BASE}/index.html#map`);
    report(!!(await p.$('.banner.resume')), 'на «Карте» есть «Продолжить диагностику»');
    await p.reload();
    await p.waitForTimeout(300);
    await p.click('.banner.resume a');
    await p.waitForTimeout(300);
    const meta = await p.textContent('.qmeta');
    report(meta.includes('4') && (await p.textContent('.qtext')) === question, 'после обновления страницы — тот же 4-й вопрос');
    await p.goto(`${BASE}/index.html#start`);
    report(!!(await p.$('.banner.resume')), 'на старте предупреждение о незаконченной диагностике');
    errors.forEach(e => report(false, `ошибка JavaScript: ${e}`));
    await ctx.close();
  }

  // пробный ЕНТ: ответы сохраняются при обновлении страницы, итог считается
  console.log('Пробный ЕНТ:');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/index.html#ent`);
    await p.click('#ent-new');
    await p.click('.opt >> nth=0');                       // задание 1
    await p.click('[data-go="30"]');                      // 31: соответствие
    await p.click('.mopt[data-item="0"] >> nth=1');
    await p.click('.mopt[data-item="1"] >> nth=2');
    await p.click('[data-go="35"]');                      // 36: несколько ответов
    await p.click('.opt >> nth=0'); await p.click('.opt >> nth=3');
    await p.reload(); await p.waitForTimeout(300);
    const done = await p.$$eval('.ent-nav button.done', b => b.length);
    report(done === 3, `после обновления страницы ответы на месте (${done} из 3)`);
    report(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'задание на телефоне без горизонтальной прокрутки');
    await p.click('#ent-end'); await p.click('#ent-end'); await p.waitForTimeout(300);
    const head = await p.textContent('h1');
    report(/из 50/.test(head), `итог посчитан: «${head.trim()}»`);
    errors.forEach(e => report(false, `ошибка JavaScript: ${e}`));
    await ctx.close();
  }

  // ответ вводом в практике: Math.random = 0 — генератор даёт 1/2 + 1/3, и задача точно приходит без вариантов
  console.log('Ответ вводом:');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { Math.random = () => 0; });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/index.html#start`);          // ученик без диагностики — практика доступна сразу
    await p.fill('#name', 'Тест');
    await p.check('input[name=goal][value=none]');
    await p.click('#start-form button[type=submit]');
    await p.waitForTimeout(300);
    await p.goto(`${BASE}/index.html#practice/frac`);
    await p.waitForTimeout(300);
    report(!!(await p.$('#typed')) && !(await p.$('.opt')), 'задача пришла без вариантов, с полем для ответа');
    report(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'поле на телефоне без горизонтальной прокрутки');
    await p.fill('#typed', 'пять шестых'); await p.press('#typed', 'Enter');
    report(await p.isVisible('#typed-err') && !(await p.$('.feedback')), 'не число — просим исправить, ответ не засчитан');
    await p.fill('#typed', '2'); await p.click('[data-k="/"]'); await p.type('#typed', '5'); await p.press('#typed', 'Enter');
    await p.waitForTimeout(100);
    const bad = await p.textContent('.feedback');
    report(!!(await p.$('.typed.is-bad')) && /типичную ошибку/.test(bad) && bad.includes('5/6'), 'кнопка «/» вставляет символ; 2/5 узнано как типичная ошибка, показан верный ответ');
    await p.click('#next'); await p.waitForTimeout(100);
    await p.fill('#typed', '10/12'); await p.click('#typed-form button[type=submit]'); await p.waitForTimeout(100);
    report(!!(await p.$('.typed.is-ok')) && /Верно/.test(await p.textContent('.feedback')), '10/12 засчитано как 5/6');
    await p.click('#next'); await p.waitForTimeout(100);
    await p.click('#skip'); await p.waitForTimeout(100);
    report(/Ничего страшного/.test(await p.textContent('.feedback')), '«Не знаю» работает и без вариантов');
    errors.forEach(e => report(false, `ошибка JavaScript: ${e}`));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\nПровалено: ${failed}` : '\nВсё прошло.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
