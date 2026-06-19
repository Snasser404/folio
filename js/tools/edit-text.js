/* "Edit text" — practical substitute for true inline PDF text editing.
 * Click a line of existing text: the original is covered with a background-matched
 * box and replaced by an editable text box pre-filled with that text.
 * (This is an overlay edit, not glyph-level reflow — no client-side lib does that.) */
const fabric = window.fabric;

export const editText = {
  id: "edit-text", label: "Edit text", icon: "edit-text", group: "markup",
  shortcut: "e", cursor: "text", usesSelection: false, usesTextLayer: true, options: [],
  hint: "Click a line of existing text to replace it",
  activate(ctx) {
    this._ctx = ctx;
    this._busy = false;
    this._h = (e) => this._click(e);
    document.addEventListener("click", this._h, true);
    if (!this._warned) { ctx.util.toast("Click a line of text to replace it.", "info", 3200); this._warned = true; }
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

    // merge all spans on the clicked visual line for a whole-line edit
    const clicked = span.getBoundingClientRect();
    const sibs = [...span.parentElement.children].filter((s) => s.tagName === "SPAN");
    const line = sibs
      .filter((s) => Math.abs(s.getBoundingClientRect().top - clicked.top) < clicked.height * 0.6)
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
    const { bg, fg } = ctx.sampleRasterColors(pageId, { left: tl.x, top: tl.y, width: w, height: h });

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
    const fontWeight = (span.dataset.pbold === "1" || parseInt(cs.fontWeight, 10) >= 600 || /bold|black|heavy|semibold|demi/.test(pname)) ? "bold" : "normal";
    const fontStyle = (span.dataset.pitalic === "1" || /italic|oblique/.test(cs.fontStyle) || /italic|oblique/.test(pname)) ? "italic" : "normal";
    const fontSize = Math.max(6, parseFloat(cs.fontSize) || h * 0.9);

    // Use the GENUINE embedded font when it's actually available. Canvas text does
    // not auto-repaint when a font loads later, so we load it first, then verify with
    // document.fonts.check. We apply it ALONE (no fallback list): a multi-family list
    // is honoured by a raw canvas but NOT reliably by Fabric's measuring/render path,
    // which snaps back to the generic. Only when the embedded font is truly absent do
    // we fall back to a matching serif/sans/mono stack — never Fabric's Times default.
    let fontFamily = generic;
    if (loaded && document.fonts && document.fonts.load) {
      const probe = `${Math.max(8, Math.round(fontSize))}px "${loaded}"`;
      try { await document.fonts.load(probe); } catch {}
      try { if (document.fonts.check(probe)) fontFamily = `"${loaded}"`; } catch {}
    }

    const cover = new fabric.Rect({ left: tl.x - 3, top: tl.y - 2, width: w + 8, height: h + 4, fill: bg, stroke: "" });
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
