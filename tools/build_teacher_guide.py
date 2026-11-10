"""
Инструкция для учителя: docs/teacher-guide/README.md → index.html (страница на сайте) и PDF (для печати и чатов).

    pip install markdown
    py tools/build_teacher_guide.py           # только HTML
    py tools/build_teacher_guide.py --pdf     # ещё и PDF (нужен Node и Playwright: npm i playwright)

Источник правды — README.md: правьте его, потом запускайте скрипт. Снимки экранов — tools/teacher_guide_shots.js.
"""
import pathlib, re, subprocess, sys
import markdown

DIR = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'teacher-guide'
PDF = 'Tamyr-instrukciya-dlya-uchitelya.pdf'


def slug(value, sep):
    # как у GitHub: ссылки из оглавления README.md работают и в HTML
    value = re.sub(r'[^\w\s-]', '', value.strip().lower())
    return re.sub(r'\s', sep, value)


src = (DIR / 'README.md').read_text(encoding='utf-8')
body = markdown.markdown(src, extensions=['tables', 'fenced_code', 'toc'], extension_configs={'toc': {'slugify': slug}})
body = body.replace('<img ', '<img loading="lazy" ')

html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tamyr: инструкция для учителя</title>
<meta name="description" content="Как зарегистрироваться, создать класс, подключить учеников, читать панель учителя и записывать результаты пробного ЕНТ.">
<link rel="icon" href="../../icons/icon-192.png">
<style>
  :root {{ --bg: #f6f4ef; --card: #fff; --ink: #1d2422; --muted: #5d6763; --line: #e4e0d8; --brand: #1f6f5c; --soft: #e3f0eb; --warn: #fff6e0; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg: #141917; --card: #1c2321; --ink: #e8ece9; --muted: #a3ada9; --line: #2f3936; --brand: #5cc3a6; --soft: #1f3330; --warn: #3a3220; }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  main {{ max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }}
  .top {{ display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }}
  .top a {{ color: var(--brand); font-weight: 600; text-decoration: none; }}
  .pdf {{ border: 1.5px solid var(--brand); border-radius: 999px; padding: 6px 14px; }}
  h1 {{ font-size: 2.1rem; line-height: 1.2; margin: .4em 0 .3em; }}
  h2 {{ font-size: 1.5rem; margin-top: 2.2em; padding-top: .6em; border-top: 1px solid var(--line); }}
  h3 {{ font-size: 1.15rem; margin-top: 1.6em; }}
  a {{ color: var(--brand); }}
  img {{ max-width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); background: #fff; }}
  p > img + img {{ margin-left: 8px; }}
  p:has(> img[width]) {{ display: flex; gap: 10px; flex-wrap: wrap; }}
  p:has(> img[width]) img {{ width: calc((100% - 20px) / 3); min-width: 200px; max-width: 260px; margin: 0; }}
  blockquote {{ margin: 1.2em 0; padding: .8em 1.1em; background: var(--soft); border-left: 4px solid var(--brand); border-radius: 0 10px 10px 0; }}
  blockquote p {{ margin: .3em 0; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95rem; display: block; overflow-x: auto; }}
  th, td {{ border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }}
  th {{ background: var(--soft); }}
  td {{ background: var(--card); }}
  code {{ background: var(--soft); padding: 1px 6px; border-radius: 5px; font-size: .92em; }}
  pre {{ background: var(--card); border: 2px dashed var(--brand); border-radius: 12px; padding: 16px; overflow-x: auto; font-size: .88rem; line-height: 1.5; }}
  pre code {{ background: none; padding: 0; }}
  hr {{ border: 0; border-top: 1px solid var(--line); margin: 2em 0; }}
  @media print {{
    :root {{ --bg: #fff; --card: #fff; --ink: #000; --muted: #444; --line: #ccc; --brand: #1f6f5c; --soft: #eef5f2; }}
    body {{ font-size: 11pt; }}
    main {{ max-width: none; padding: 0; }}
    .top {{ display: none; }}
    h2 {{ margin-top: 1.4em; }}
    img {{ max-height: 110mm; width: auto; }}
    p:has(> img[width]) img {{ width: auto; max-height: 95mm; min-width: 0; }}
    h3, img, table, pre, blockquote {{ break-inside: avoid; }}
    h2 + *, h3 + * {{ break-before: avoid; }}
    a {{ color: inherit; text-decoration: none; }}
  }}
</style>
</head>
<body>
<main>
<div class="top"><a href="../../">← Открыть Tamyr</a><a class="pdf" href="{PDF}" download>Скачать PDF для печати</a></div>
{body}
</main>
</body>
</html>
"""
(DIR / 'index.html').write_text(html, encoding='utf-8')
print('index.html')

if '--pdf' in sys.argv:
    js = """
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + process.argv[1] + '/index.html', { waitUntil: 'load' });
  await p.evaluate(() => Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }); })));
  await p.pdf({ path: process.argv[1] + '/' + process.argv[2], format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true,
    headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8pt;width:100%;text-align:center;color:#777">Tamyr · инструкция для учителя · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  await b.close();
})();
"""
    subprocess.run(['node', '-e', js, str(DIR), PDF], check=True)
    print(PDF)
