# FolioPDF

**Edit any PDF, right in your browser.** A professional, **100% client-side** PDF editor —
Acrobat-grade editing with nothing ever uploaded; your files stay on your device.

![tech](https://img.shields.io/badge/PDF.js-render-blue) ![tech](https://img.shields.io/badge/Fabric.js-edit-green) ![tech](https://img.shields.io/badge/pdf--lib-save-orange)

## Features

**View & navigate**
- Continuous vertical scroll with virtualized rendering (only pages near the viewport are rasterized — handles large documents)
- Page thumbnails, document outline/bookmarks
- Full-text **search** with on-page highlighting and next/prev navigation
- Zoom in/out, fit-width, fit-page, **status-bar zoom slider**; page navigator; hand/pan tool
- **Measure** distances (with unit + scale); **resizable** side panels; light & dark themes; keyboard + ARIA accessible toolbar

**Comment & markup**
- **Markup real PDF text** — select existing text and highlight / underline / strikethrough (the signature Acrobat feature)
- Sticky notes with a **Comments panel** (list, jump, delete)
- Freehand **pen** and **highlighter** (multiply blend)
- Shapes: **rectangle, ellipse, line, arrow** (color, fill, weight, opacity)
- **Stamps** (Approved / Draft / Confidential / …) and **signatures** (typed, saved for reuse)

**Edit content**
- **Edit text** — click a line of existing text to replace it: the original is covered with a
  background-matched box and swapped for an editable box pre-filled with that text
  *(overlay edit, not glyph reflow — see limits)*
- Add **text boxes** (font, size, color, bold/italic)
- Insert **images**
- **White-out** cover

**Pages (organize)**
- Drag-to-reorder, rotate, duplicate, delete, add blank page, **append another PDF**
- **Multi-select** (Ctrl/Shift-click thumbnails) → batch rotate / delete / **extract to new PDF**
- **Crop** pages (sets the PDF CropBox on export)

**Links & reuse**
- **Hyperlink tool** — draw a box → web URL or go-to-page (real clickable PDF link annotations)
- **Custom stamp upload** (saved for reuse) alongside the built-in stamps
- **Import / export annotations** as JSON (move your markup between sessions/files)

**Protect & document tools**
- **True redaction** — marked regions are permanently removed (the affected page is rasterized, so no hidden text/image survives underneath); other pages keep selectable vector text
- **OCR** (Document ▸ OCR) — makes scanned/image pages searchable, in-app and in the downloaded PDF (lazy-loads Tesseract.js; needs internet the first time)
- **Compare** two PDFs (Document ▸ Compare with…) — per-page word diff (added/removed)
- **Remove metadata & download** — strips title/author/subject/keywords/creator
- **Recent files** — reopen recently opened PDFs (stored locally in your browser; never uploaded)

**Forms**
- **Detects fillable AcroForm fields** and renders an interactive layer (text, checkbox, radio, dropdown)
- Fill fields and **Download** — values are baked into the PDF (filled + flattened)

**Save & output**
- Download an edited PDF (original vector text preserved on clean pages; rotated/redacted pages flattened)
- **Print** (Ctrl+P) · **Download flattened** (rasterize everything) · Export pages as images · document properties

**Productivity**
- Full **undo/redo** across pages, keyboard shortcuts, contextual property inspector, drag-and-drop open
- **Right-click context menu** (copy/paste/duplicate, bring-to-front/back, delete) with copy/paste across pages
- **Persistent tools** (place many annotations without re-clicking), **zoom dropdown** with presets, **collapsible panels**
- Draw- or type-a-**signature** pad (saved for reuse), unsaved-changes guard on close

## Run it

The app must be served over `http://` (PDF rendering uses a web worker). Pick whichever you have:

```powershell
# Option A — Python (recommended: no-cache dev server, always loads fresh)
cd "C:\Users\Nasser Abdulqawi\EditPDF"
python serve.py 8000            # then open http://localhost:8000

# Option B — Node
npx serve .
```

Or **double-click `start.bat`** (auto-starts the server and opens your browser), or use VS Code's *Live Server* extension.

> `serve.py` sends no-cache headers so edits and new versions always load fresh (plain
> `python -m http.server` can serve stale JS/CSS from the browser cache). If you ever see
> odd stale behavior with another server, hard-refresh once with **Ctrl+Shift+R**.
>
> Works offline after first load — the libraries are vendored locally in `vendor/`.

## Keyboard shortcuts

| Key | Tool / Action | | Key | Action |
|---|---|---|---|---|
| `V` | Select | | `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `H` | Pan | | `Ctrl+S` | Download |
| `T` | Text | | `Ctrl+O` | Open |
| `U` | Markup text | | `Ctrl+A` | Select all on page |
| `P` / `K` | Pen / Highlighter | | `Delete` | Remove selection |
| `R` `O` `L` `A` | Rect / Ellipse / Line / Arrow | | `Esc` | Select tool |
| `N` | Sticky note | | | |

## Architecture

Plain ES modules, no build step.

```
index.html              app shell (CSS grid) + SVG icon sprite
css/    tokens · layout · components          (design tokens, light/dark)
vendor/ pdf.js · pdf.worker · fabric · pdf-lib  (offline copies)
js/
  app.js                bootstrap + global actions
  core/   bus · state · ids · util · pdf-engine · page-host ·
          render-scheduler · history · editor-context · tool-manager ·
          export-engine · search
  tools/  registry · navigation · content · draw · shapes ·
          text-markup · annotate · redact     (plugin interface)
  ui/     toolbar · contextual-toolbar · menus · statusbar ·
          zoom-control · shortcuts · theme · toast · dnd · icon
  panels/ thumbnails · search-panel · outline-panel ·
          comments-panel · properties-panel
```

**Key ideas**
- Each page is a *page-host*: stacked raster canvas (PDF.js) + text layer + Fabric overlay. A render-scheduler mounts a live editing canvas only for pages near the viewport.
- Annotations live as Fabric JSON in `state.pages[i].annotations` (source of truth). Overlay coordinates are PDF-points × 2; display zoom is applied via CSS so annotation coordinates stay zoom-independent.
- Export decides per page: vector-preserve (clean) · flatten (rotated) · flatten-with-redaction (content truly removed). Redaction regions are stored as normalized fractions, so they land correctly at any rotation.

## Roadmap

- **Phase 1 (done):** form filling · print · flatten/rasterize export
- **Phase 2 (done):** hyperlink tool · custom stamp upload · crop pages · multi-page thumbnail selection (batch rotate/delete/extract) · annotation import/export
- **Phase 3 (done):** in-page search highlighting + next/prev · status-bar zoom slider · resizable panels · persistent text/format controls on selection · toolbar accessibility (ARIA) · measurement tool
- **Phase 4 (done):** OCR (Tesseract.js) · PDF compare (text diff) · recent files · metadata sanitization. *Password encryption is intentionally omitted — pdf-lib can't write PDF encryption, and bolting on a correct/secure implementation client-side isn't feasible.*

## Limits (honest)

- Filled forms are **flattened** on download (values baked in, not re-editable). Keeping fields fillable after edit is a future option.
- **Edit text** is an *overlay* edit, not true glyph-level reflow (no client-side library does
  content-stream text editing). It covers the original line with a background-matched box and a
  new editable text box. Caveats: the replacement uses a standard font (may not match the
  original exactly), and the original text remains *underneath* the cover (hidden, not deleted —
  use **Redact** if it must be truly removed). Works best on solid/white backgrounds.
- **Password/encryption is not supported** — pdf-lib can't write PDF encryption, and a correct, secure implementation isn't feasible in-browser. (Use your OS/Acrobat to encrypt the downloaded file if needed.)
- No cryptographic (certificate) signatures — visual signatures only.
- OCR uses Tesseract.js (English), loaded on first use; accuracy depends on scan quality.

## Tech

[PDF.js](https://mozilla.github.io/pdf.js/) · [Fabric.js](http://fabricjs.com/) · [pdf-lib](https://pdf-lib.js.org/)
