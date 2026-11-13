/*
 * Builds the print files from poster.html.
 *   node docs/poster-kimep/build.js          (needs Playwright; run from the repository root or anywhere)
 *   python3 docs/poster-kimep/overlay.py     (needs pypdf; lays the content over the official KIMEP template page)
 *
 * Output (docs/poster-kimep/out/):
 *   content.pdf   — poster content only, transparent where the KIMEP banner goes (input for overlay.py)
 *   preview.png   — whole poster with the banner, for checking on screen
 * The script also reports any section whose content does not fit its box.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const DIR = __dirname;
const OUT = path.join(DIR, 'out');
const MM = 96 / 25.4;                       // CSS px per mm
const W = Math.round(841 * MM), H = Math.round(1189 * MM);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const url = 'file://' + path.join(DIR, 'poster.html');

  // 1) preview + fit check
  let page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const report = await page.evaluate(() => {
    const mm = px => +(px * 25.4 / 96).toFixed(1);
    const poster = document.querySelector('.poster').getBoundingClientRect();
    return [...document.querySelectorAll('.fit')].map(el => {
      const r = el.getBoundingClientRect();
      // lowest point of real content inside the box
      let bottom = r.top;
      el.querySelectorAll('*').forEach(c => { if (c.parentElement.closest('.crop')) return; /* cropped screenshots are meant to be cut */ const b = c.getBoundingClientRect(); if (b.height && b.bottom > bottom) bottom = b.bottom; });
      const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const h2 = el.querySelector('h2, h4');
      return { box: (h2 ? h2.textContent : el.className).trim().slice(0, 34), top: mm(r.top - poster.top), height: mm(r.height), spare: mm(r.bottom - pad - bottom), wide: el.scrollWidth > el.clientWidth + 1 };
    });
  });
  let bad = 0;
  report.forEach(r => { const over = r.spare < 0 || r.wide; if (over) bad++; console.log(`${over ? 'OVERFLOW' : 'ok      '}  ${r.box.padEnd(36)} top ${String(r.top).padStart(6)} mm  height ${String(r.height).padStart(5)} mm  spare ${String(r.spare).padStart(6)} mm`); });
  await page.screenshot({ path: path.join(OUT, 'preview.png'), clip: { x: 0, y: 0, width: W, height: H } });
  await page.close();

  // 2) content PDF (banner hidden, transparent page) at exact A0
  page = await browser.newPage();
  await page.goto(url + '?pdf');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.pdf({ path: path.join(OUT, 'content.pdf'), width: '841mm', height: '1189mm', printBackground: true, pageRanges: '1', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await browser.close();
  console.log(bad ? `\n${bad} section(s) overflow` : '\nall sections fit');
})();
