# KIMEP AI Challenge 2026 poster (A0 portrait)

| File | What it is |
|---|---|
| `TamyrEdu_KIMEP_A0_poster.pdf` | Print file, 841 × 1189 mm. The poster content laid over KIMEP's own template page, so the banner is their original artwork. |
| `poster.html` | Editable source. Open it in a browser to preview; all text, diagrams and the results table are plain HTML/SVG. |
| `preview.png` | Low-resolution picture of the final PDF. |
| `assets/` | KIMEP template, app screenshots, QR codes. |
| `build.js`, `overlay.py` | Rebuild the PDF after editing. |

## Before printing

1. In `poster.html`, replace the two yellow `ADD:` boxes (school, supervisor) in the title block.
2. Scan both QR codes with a phone.
3. Rebuild (below) and check the PDF once on screen at 100%.

## Rebuild

```
npm install playwright && npx playwright install chromium
pip install pypdf
node docs/poster-kimep/build.js      # renders the content and reports any section that overflows its box
python3 docs/poster-kimep/overlay.py # lays it over assets/kimep-template-A0.pdf
```

## Where each number comes from

Every simulation and test figure was re-run from this repository on 13 Nov 2026.

| On the poster | Source |
|---|---|
| 89.8% / 86.7% / 88.4%, the robustness rows, test length | `tests.html` → `window.SIM` (hold-out set, seed 777) |
| "Earlier engine, no root re-check" row | the same simulation at commit `752abd2` |
| 36 topics, 60 links, 216 items, 86 misconceptions, 287 of 648 tagged | counted from `js/data.js` + `js/data-ent.js` |
| 152 / 152 tests | `node tools/run_tests.js` (24 + 63 + 65) |
| 10,200 generated problems, 0 errors | `node tools/verify_gen.js` |
| Fig. 1 trace | `Tamyr.Diagnostic(['quad'])` with `simulateStudent(['frac'])`, seed 4 |
| Screenshots | the app served from this repository, built-in demo student (`#demo`), Russian interface |
| 50% vs 69% (PISA 2022) | OECD country note for Kazakhstan |
| Interviews, Bayesian variant | `docs/validation-plan.md`, main `README.md` (not re-run) |

## Print notes

- No bleed: the KIMEP template has none, so the page is exactly A0.
- The banner is CMYK (as supplied); the poster content is RGB. Ask the print shop to convert on output.
- Fonts are embedded as vector outlines.
