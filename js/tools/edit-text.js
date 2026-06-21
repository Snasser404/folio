/* "Replace text" — the realistic substitute for true inline PDF text editing.
 * No browser-only library can rewrite a page's embedded-font text in place (only paid
 * WASM engines like Apryse/Nutrient do). So, like every free PDF tool, we COVER the
 * original line with a background-matched patch and drop an editable copy on top in the
 * same font. It can't reflow the page, so replacements should stay ~the same length. */
const fabric = window.fabric;

export const editText = {
  id: "edit-text", label: "Replace text", icon: "edit-text", group: "markup",
  shortcut: "e", cursor: "text", usesSelection: false, usesTextLayer: true, options: [],
  hint: "Click a line of text to cover it and retype in the same font",
  activate(ctx) {
    this._ctx = ctx;
    this._busy = false;
    this._h = (e) => this._click(e);
    document.addEventListener("click", this._h, true);
    let seen = false;
    try { seen = !!localStorage.getItem("pe_replace_text_seen"); } catch {}
    if (!seen) {
      ctx.util.toast("Replace text covers the original line and drops in an editable copy in the same font. It can't reflow the page — keep replacements about the same length.", "info", 6500);
      try { localStorage.setItem("pe_replace_text_seen", "1"); } catch {}
    }
  },
  deactivate() {
    if (this._h) document.removeEventListener("click", this._h, true);
    this._h = null;
  },
  async _click(e) {
    if (this._busy) return;
    const ctx = this._ctx;
    const span = e.target && e.target.closest && e.target.closest(".text-layer > span");
    if (!span) return;
    const hostEl = span.closest(".page-host");
    if (!hostEl) return;
    const pageId = hostEl.dataset.pageId;
    const canvas = ctx.getCanvas(pageId);
    if (!canvas) { ctx.util.toast("Scroll the page fully into view first.", "warning"); return; }
    e.preventDefault(); e.stopPropagation();
    this._busy = true;

    // Merge the spans of the clicked visual line ONLY — same line, same size, same font.
    // (Keying off the clicked span's top with a fat tolerance used to sweep a small
    // eyebrow like "THE HAMMAM" into a big heading, producing a jumbled merged copy.)
    const clicked = span.getBoundingClientRect();
    const cCenter = clicked.top + clicked.height / 2;
    const cLoaded = (span.dataset.ploaded || "").trim();
    const sibs = [...span.parentElement.children].filter((s) => s.tagName === "SPAN");
    const line = sibs
      .filter((s) => {
        const r = s.getBoundingClientRect();
        if (!r.height) return false;
        const tol = Math.min(clicked.height, r.height) * 0.5;          // tolerance from the SHORTER run
        if (Math.abs(r.top + r.height / 2 - cCenter) > tol) return false; // same visual line (centers)
        const ratio = r.height / clicked.height;
        if (ratio <= 0.7 || ratio >= 1.4) return false;               // same size run only
        const sl = (s.dataset.ploaded || "").trim();
        if (cLoaded && sl && sl !== cLoaded) return false;            // same font identity
        return true;
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, txt = "";
    line.forEach((s) => {
      const r = s.getBoundingClientRect();
      left = Math.min(left, r.left); top = Math.min(top, r.top);
      right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
      txt += s.textContent;
    });

    const tl = ctx.screenToOverlay(pageId, left, top);
    const br = ctx.screenToOverlay(pageId, right, bottom);
    const w = br.x - tl.x, h = br.y - tl.y;
    // Pad the cover proportionally to the text height so it swallows glyph overhang —
    // tall ascenders/accents, descenders on g/y/p, italic lean, letter-spacing — that
    // a fixed few-px pad missed on big headings (leaving the original peeking out).
    const padX = Math.max(4, h * 0.12), padTop = Math.max(3, h * 0.20), padBot = Math.max(3, h * 0.24);
    const coverBox = { left: tl.x - padX, top: tl.y - padTop, width: w + padX * 2, height: h + padTop + padBot };
    // Sample the background from the INFLATED box so paper outnumbers ink in the
    // histogram (a tightly-set heading would otherwise sample its own dark ink as "bg").
    const { bg, fg } = ctx.sampleRasterColors(pageId, coverBox);

    // Reproduce the EXACT original typeface. PDF.js registers the embedded font in
    // document.fonts under its `loadedName` (stashed on the span as data-ploaded);
    // we use that genuine font first, so the text doesn't change when edited. The
    // matching serif/sans/mono category is the fallback for any glyph the embedded
    // (often subsetted) font lacks — never Fabric's blind Times default.
    const cs = window.getComputedStyle(span);
    const fam = (span.dataset.pfontfam || "").trim().toLowerCase();
    const pname = (span.dataset.pname || "").toLowerCase();
    let cat = fam === "serif" ? "serif" : fam === "monospace" ? "mono" : fam === "sans-serif" ? "sans" : "";
    if (!cat) {
      cat = /mono|courier|consol/.test(pname) ? "mono"
        : /serif|times|georgia|garamond|roman|minion|playfair|caslon|baskerville|palatino|cambria|antiqua|merriweather|didot|bodoni/.test(pname) ? "serif"
        : "sans";
    }
    const generic = cat === "mono" ? '"Courier New", monospace'
      : cat === "serif" ? 'Georgia, "Times New Roman", serif'
      : "Helvetica, Arial, sans-serif";
    const loaded = (span.dataset.ploaded || "").trim();
    const fontSize = Math.max(6, parseFloat(cs.fontSize) || h * 0.9);
    const wantBold = (span.dataset.pbold === "1" || parseInt(cs.fontWeight, 10) >= 600 || /bold|black|heavy|semibold|demi/.test(pname));
    const wantItalic = (span.dataset.pitalic === "1" || /italic|oblique/.test(cs.fontStyle) || /italic|oblique/.test(pname));

    // Use the GENUINE embedded font when it's actually available. Canvas text does
    // not auto-repaint when a font loads later, so we load it first, then verify with
    // document.fonts.check. We apply it ALONE (no fallback list): a multi-family list
    // is honoured by a raw canvas but NOT reliably by Fabric's measuring/render path,
    // which snaps back to the generic. Only when the embedded font is truly absent do
    // we fall back to a matching serif/sans/mono stack — never Fabric's Times default.
    let fontFamily = generic, usedEmbedded = false;
    if (loaded && document.fonts && document.fonts.load) {
      const probe = `${Math.max(8, Math.round(fontSize))}px "${loaded}"`;
      try { await document.fonts.load(probe); } catch {}
      try { if (document.fonts.check(probe)) { fontFamily = `"${loaded}"`; usedEmbedded = true; } } catch {}
    }
    // The embedded font already has its weight & slant baked into the glyphs, so we must
    // NOT also synthesize bold/italic — that double-styles it (a "Semi Bold" face drawn
    // faux-bold looks far too heavy, which reads as "the text went bold"). Synthesize
    // only when we fell back to a generic family.
    const fontWeight = (!usedEmbedded && wantBold) ? "bold" : "normal";
    const fontStyle = (!usedEmbedded && wantItalic) ? "italic" : "normal";

    const cover = new fabric.Rect({ ...coverBox, fill: bg, stroke: "" });
    cover.toolId = "edit-text";
    ctx.addObject(pageId, cover, { select: false });

    const t = new fabric.IText(txt, {
      left: tl.x, top: tl.y, fontSize, fill: fg, fontFamily, fontWeight, fontStyle,
      cursorColor: fg, cursorWidth: 2, editingBorderColor: "#4f46e5",
    });
    t.toolId = "edit-text";
    // Record what the ORIGINAL text actually was, so the contextual toolbar can show
    // it (font, type, size) and offer one-click "Reset to original" — handy when the
    // embedded font isn't reproducible and the replacement looks slightly off.
    t.detected = {
      family: fontFamily,                                    // what we applied
      loaded,                                                // embedded FontFace name (if any)
      psName: span.dataset.pname || "",                      // real PostScript/base font name
      category: cat,                                         // "serif" | "sans" | "mono"
      sizePt: Math.round((fontSize / ctx.OVERLAY_SCALE) * 10) / 10,
      weight: fontWeight, style: fontStyle,
    };
    ctx.addObject(pageId, t, { select: false });

    ctx.setActiveTool("select");        // also removes our click listener (deactivate)
    canvas.setActiveObject(t);
    t.enterEditing();
    t.selectAll();
    if (typeof t.initDimensions === "function") t.initDimensions();  // re-measure with the now-loaded font
    canvas.requestRenderAll();
    ctx.commitFor(pageId, "Edit text");
    this._busy = false;
  },
  canStyle: (o) => o.toolId === "edit-text",
};
