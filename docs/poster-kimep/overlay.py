"""Lays the poster content over the official KIMEP A0 template page.

The KIMEP banner (logo + "AI CONFERENCE 2026") stays exactly as KIMEP supplied it: the template page is the
bottom layer and is not redrawn. Run build.js first.

    python3 docs/poster-kimep/overlay.py        (needs: pip install pypdf)
"""
from pathlib import Path
from pypdf import PdfReader, PdfWriter, Transformation

here = Path(__file__).resolve().parent
writer = PdfWriter(clone_from=here / "assets" / "kimep-template-A0.pdf")
content = PdfReader(here / "out" / "content.pdf")

page = writer.pages[0]
top = content.pages[0]
tw, th = float(page.mediabox.width), float(page.mediabox.height)
cw, ch = float(top.mediabox.width), float(top.mediabox.height)
# Chromium rounds the page to whole CSS pixels (about 0.4 mm off at A0), so fit the content to the template exactly.
assert abs(tw - cw) < 4 and abs(th - ch) < 4, f"page sizes differ: template {tw}x{th} pt, content {cw}x{ch} pt"

page.merge_transformed_page(top, Transformation().scale(tw / cw, th / ch))
writer.add_metadata({"/Title": "TamyrEdu: Tracing Math Errors to Their Root Cause (KIMEP AI Challenge 2026, A0 portrait)"})
out = here / "TamyrEdu_KIMEP_A0_poster.pdf"
with open(out, "wb") as f:
    writer.write(f)
print(f"wrote {out.name}: {tw / 72 * 25.4:.0f} x {th / 72 * 25.4:.0f} mm")
