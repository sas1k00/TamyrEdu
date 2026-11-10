/*
 * Снимки экранов для инструкции учителя (docs/teacher-guide). Регистрирует учителя, создаёт класс,
 * 6 учеников вступают по ссылке и проходят диагностику (с пробелами в дробях, отрицательных числах, процентах),
 * потом снимает все разделы панели учителя и форму пробного ЕНТ. Красные рамки с цифрами — куда нажимать.
 *
 *   py tools/dev_backend.py --teachers teacher@school.kz
 *   py -m http.server 8771
 *   node tools/teacher_guide_shots.js shots      → PNG в папку shots (2x)
 *
 * Потом уменьшить и сохранить как JPEG в docs/teacher-guide/img/ (ширина 1400 для компьютера, 780 для телефона)
 * и пересобрать страницу: py tools/build_teacher_guide.py --pdf. dev_backend перед повторным запуском перезапустить:
 * он хранит аккаунты в памяти, и повторная регистрация тех же почт не пройдёт.
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'http://localhost:8771/index.html';
const BACK = '?backend=http://127.0.0.1:8772';
const OUT = process.argv[2] || 'shots';
require('fs').mkdirSync(OUT, { recursive: true });
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const shot = async (p, name, opts = {}) => {
  await p.waitForTimeout(250);
  await p.evaluate(() => document.querySelectorAll('.cls-share code').forEach(c => { c.textContent = c.textContent.replace(/^http:\/\/localhost:\d+\/index\.html/, 'https://sas1k00.github.io/TamyrEdu/'); }));
  if (opts.clip) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150); }
  await p.screenshot({ path: path.join(OUT, name + '.png'), ...(opts.clip ? { fullPage: true } : {}), ...opts });
  console.log('shot', name);
};
// red frame + numbered badge on an element
const mark = (p, sel, label, nth = 0) => p.evaluate(([sel, label, nth]) => {
  document.querySelectorAll('.cls-share code').forEach(c => { c.textContent = c.textContent.replace(/^http:\/\/localhost:\d+\/index\.html/, 'https://sas1k00.github.io/TamyrEdu/'); });
  const el = document.querySelectorAll(sel)[nth];
  if (!el) throw new Error('no ' + sel);
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = '__mark';
  Object.assign(box.style, { position: 'absolute', left: (r.left + scrollX - 5) + 'px', top: (r.top + scrollY - 5) + 'px', width: (r.width + 10) + 'px', height: (r.height + 10) + 'px',
    border: '3px solid #e53935', borderRadius: '10px', zIndex: 9999, pointerEvents: 'none', boxSizing: 'border-box' });
  document.body.appendChild(box);
  if (label) {
    const b = document.createElement('div');
    b.className = '__mark';
    b.textContent = label;
    Object.assign(b.style, { position: 'absolute', left: (r.left + scrollX - 16) + 'px', top: (r.top + scrollY - 16) + 'px', minWidth: '26px', height: '26px', padding: '0 6px', borderRadius: '13px',
      background: '#e53935', color: '#fff', font: '700 15px/26px system-ui, sans-serif', textAlign: 'center', zIndex: 10000, pointerEvents: 'none', boxSizing: 'border-box' });
    document.body.appendChild(b);
  }
}, [sel, label, nth]);
const unmark = p => p.evaluate(() => document.querySelectorAll('.__mark').forEach(e => e.remove()));
const clipOf = async (p, sel, pad = 12) => {
  const r = await p.evaluate(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; }, sel);
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad };
};

async function signUp(p, name, email) {
  await p.goto(BASE + BACK + '#account');
  await p.waitForSelector('#auth-form');
  if (!(await p.$('#consent'))) await p.click('[data-mode="up"]');
  await p.fill('#name', name);
  await p.fill('#email', email);
  await p.fill('#password', 'password123');
  await p.check('#consent');
  return p;
}

// answer the diagnostic: weak topics wrong (prefer an option with a misconception tag), others right with prob. good
async function diagnostic(p, weak, good, maxQ = 40) {
  let seed = weak.join('').length * 7 + 3;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < maxQ; i++) {
    await p.waitForTimeout(60);
    if (!(await p.$('.qtext'))) break;
    const choice = await p.evaluate(([weak, r]) => {
      const T = window.Tamyr;
      const qh = document.querySelector('.qtext').innerHTML;
      const q = T.QUESTIONS.find(q => T.math(q.text) === qh);
      const btns = [...document.querySelectorAll('.opt')];
      if (!q) return 0;
      const opts = btns.map(b => q.options.find(o => T.math(o.t) === b.children[1].innerHTML));
      const dep = id => weak.includes(id) || T.TOPIC[id].prereq.some(dep);
      const isWeak = dep(q.topic);
      if (isWeak) { const m = opts.findIndex(o => o && o.mis); return m >= 0 ? m : opts.findIndex(o => o && !o.ok); }
      const ok = opts.findIndex(o => o && o.ok);
      return r ? ok : (ok + 1) % opts.length;
    }, [weak, rand() < good]);
    await p.click(`.opt >> nth=${choice < 0 ? 0 : choice}`);
  }
  // finish if still running
  if (await p.$('#stop')) await p.click('#stop');
  await p.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. Teacher: sign up ---------- */
  const tctx = await browser.newContext(DESK);
  const tp = await tctx.newPage();
  tp.on('pageerror', e => console.log('PAGEERROR teacher', e.message));
  await tp.goto(BASE + BACK);
  await tp.waitForTimeout(500);
  await mark(tp, '#acct', '1');
  await shot(tp, '01-landing');
  await unmark(tp);

  await signUp(tp, 'Сауле Ахметовна', 'teacher@school.kz');
  await mark(tp, '#name', '1'); await mark(tp, '#email', '2'); await mark(tp, '#password', '3'); await mark(tp, '.consent', '4'); await mark(tp, '#auth-form button[type=submit]', '5');
  await shot(tp, '02-signup');
  await unmark(tp);
  await tp.click('#auth-form button[type=submit]');
  await tp.waitForTimeout(1200);
  console.log('teacher after signup at', tp.url());

  /* ---------- 2. Teacher panel, empty, create class ---------- */
  await tp.goto(BASE + '#teacher');
  await tp.waitForTimeout(1200);
  await mark(tp, '[data-nav="teacher"]', '');
  await mark(tp, '#new-class', '1');
  await shot(tp, '03-panel-empty');
  await unmark(tp);
  await tp.fill('#cname', '11 «А»');
  await tp.click('#new-class button[type=submit]');
  await tp.waitForTimeout(1200);
  const code = (await tp.textContent('.cls-code .code')).trim();
  console.log('class code', code);
  await tp.evaluate(() => document.querySelector('.classes').scrollIntoView({ block: 'start' }));
  await mark(tp, '.cls-code .code', '1'); await mark(tp, '#copy-link', '2');
  await shot(tp, '04-class-created', { clip: await clipOf(tp, '.classes', 16) });
  await unmark(tp);

  /* ---------- 3. Students join and take the diagnostic ---------- */
  const students = [
    ['Айгерим Сапарова', ['frac'], 0.9],
    ['Нурлан Беков', ['frac', 'neg'], 0.85],
    ['Дана Касымова', ['pct'], 0.9],
    ['Арман Тлеуов', ['frac'], 0.8],
    ['Алия Муратова', [], 0.97],
    ['Ерлан Жумабаев', ['neg', 'expr'], 0.8],
  ];
  let first = true;
  for (let i = 0; i < students.length; i++) {
    const [name, weak, good] = students[i];
    const ctx = await browser.newContext(PHONE);
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('PAGEERROR student', e.message));
    // join link like the teacher would share
    await p.goto(BASE + BACK);
    await p.waitForTimeout(300);
    await p.goto(BASE + '#join/' + code);
    await p.waitForTimeout(500);
    if (first) await shot(p, '05-student-join-login');
    if (!(await p.$('#consent'))) await p.click('[data-mode="up"]');
    await p.fill('#name', name);
    await p.fill('#email', `student${i + 1}@example.com`);
    await p.fill('#password', 'password123');
    await p.check('#consent');
    await p.click('#auth-form button[type=submit]');
    await p.waitForTimeout(1200);
    if (!p.url().includes('#account')) await p.goto(BASE + '#account');
    await p.waitForSelector('#join-form', { timeout: 8000 });
    if (first) {
      await p.evaluate(() => document.querySelector('.join-box').scrollIntoView({ block: 'center' }));
      await mark(p, '#join-code', '1'); await mark(p, '#join-form button', '2');
      await shot(p, '06-student-join-code');
      await unmark(p);
    }
    await p.click('#join-form button');
    await p.waitForTimeout(1000);
    if (first) {
      await p.evaluate(() => document.querySelector('.join-box').scrollIntoView({ block: 'center' }));
      await shot(p, '07-student-joined');
    }
    if (i === 5) { await ctx.close(); continue; } // this one joined but never started
    // diagnostic
    await p.goto(BASE + '#start');
    await p.waitForSelector('#start-form');
    if (first) { await mark(p, '#start-form button[type=submit]', ''); await shot(p, '08-student-start'); await unmark(p); }
    await p.click('#start-form button[type=submit]');
    await p.waitForTimeout(400);
    if (first) await shot(p, '09-student-question');
    await diagnostic(p, weak, good);
    await p.waitForTimeout(2500); // sync to cloud (1.5 s debounce)
    if (first) await shot(p, '10-student-today');
    if (first) {
      await p.goto(BASE + '#progress');
      await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('#share').scrollIntoView({ block: 'center' }));
      await mark(p, '#share', '1'); await mark(p, '#copy', '2');
      await shot(p, '11-student-share-code');
      await unmark(p);
    }
    console.log('student done', name, p.url());
    first = false;
    await ctx.close();
  }

  /* ---------- 4. Teacher panel with the class ---------- */
  await tp.goto(BASE + '#home');
  await tp.waitForTimeout(300);
  await tp.goto(BASE + '#teacher');
  await tp.waitForTimeout(500);
  await tp.reload();
  await tp.waitForTimeout(2500);
  await shot(tp, '12-panel-top');
  await tp.click('.cls-members:not(.cls-mock) summary');
  await tp.waitForTimeout(300);
  await shot(tp, '13-class-members', { clip: await clipOf(tp, '.classes', 16) });
  await tp.click('.cls-members:not(.cls-mock) summary');
  await tp.waitForTimeout(200);
  await shot(tp, '14-todo', { clip: await clipOf(tp, '.todo', 16) });
  await shot(tp, '15-roots-mistakes', { clip: await clipOf(tp, '.grid2', 16) });
  const groupsCard = await tp.evaluateHandle(() => document.querySelector('.groups').closest('.card'));
  await tp.evaluate(el => el.id = '__groups', groupsCard);
  await shot(tp, '16-groups', { clip: await clipOf(tp, '#__groups', 16) });
  await tp.evaluate(() => document.querySelector('.heat').closest('.card').id = '__heat');
  await shot(tp, '17-heatmap', { clip: await clipOf(tp, '#__heat', 16) });
  await tp.evaluate(() => document.querySelector('.toolbar').scrollIntoView({ block: 'center' }));
  await mark(tp, '.switch', '1'); await mark(tp, '.toolbar details summary', '2'); await mark(tp, '#csv', '3');
  await shot(tp, '18-toolbar', { clip: await clipOf(tp, '.toolbar', 30) });
  await unmark(tp);
  await tp.click('.toolbar details summary');
  await tp.waitForTimeout(200);
  await shot(tp, '19-add-by-code', { clip: await clipOf(tp, '.toolbar', 30) });
  await tp.click('.toolbar details summary');

  /* ---------- 5. Mock ENT ---------- */
  await tp.click('.cls-mock summary');
  await tp.waitForTimeout(300);
  await tp.evaluate(() => document.querySelector('.cls-mock').scrollIntoView({ block: 'center' }));
  await mark(tp, '#mock-new', '1');
  await shot(tp, '20-mock-open', { clip: await clipOf(tp, '.cls-mock', 20) });
  await unmark(tp);
  await tp.click('#mock-new');
  await tp.waitForTimeout(400);
  await tp.fill('#mock-name', 'Пробный ЕНТ, ноябрь');
  const topicFor = ['arith', 'neg', 'frac', 'frac', 'pct', 'pow', 'expr', 'fsu', 'lineq', 'quad'];
  for (let i = 0; i < topicFor.length; i++) {
    const ok = await tp.$(`[data-mt="${i}"] option[value="${topicFor[i]}"]`);
    if (ok) await tp.selectOption(`[data-mt="${i}"]`, topicFor[i]);
  }
  const wrongs = ['3, 4', '2-4, 9', '5', '3, 4, 10', '0', ''];
  const inputs = await tp.$$('[data-mw]');
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(wrongs[i] || '');
  await tp.evaluate(() => document.querySelector('.mock-form').scrollIntoView({ block: 'start' }));
  await mark(tp, '.mock-meta', '1');
  await mark(tp, '.mock-topics', '2');
  await shot(tp, '21-mock-topics', { clip: await clipOf(tp, '.mock-form', 16) });
  await unmark(tp);
  await tp.evaluate(() => document.querySelector('.mock-students').scrollIntoView({ block: 'center' }));
  await mark(tp, '.mock-students', '3'); await mark(tp, '#mock-save', '4');
  const st = await clipOf(tp, '.mock-students', 30);
  const sv = await clipOf(tp, '#mock-save', 30);
  await shot(tp, '22-mock-students', { clip: { x: st.x, y: st.y - 60, width: st.width, height: sv.y + sv.height - st.y + 60 } });
  await unmark(tp);
  await tp.click('#mock-save');
  await tp.waitForTimeout(1200);
  await tp.evaluate(() => document.querySelector('.cls-mock').scrollIntoView({ block: 'center' }));
  await shot(tp, '23-mock-saved', { clip: await clipOf(tp, '.cls-mock', 20) });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
