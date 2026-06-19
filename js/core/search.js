/* Full-text search over the document via PDF.js text content.
 * Tracks per-item offsets so matches map to text-layer span indices (item index
 * === span index in renderTextLayer output) for on-page highlighting. */
import { state, getSourceDoc } from "./state.js";

const cache = new Map(); // pageId -> { text, offsets:[{s,e}] }

export async function getPageText(model) {
  if (cache.has(model.id)) return cache.get(model.id);
  let rec = { text: "", offsets: [] };
  const pdfDoc = getSourceDoc(model);
  if (model.srcIndex != null && pdfDoc) {
    try {
      const page = await pdfDoc.getPage(model.srcIndex + 1);
      const tc = await page.getTextContent();
      let text = "";
      const offsets = [];
      tc.items.forEach((it) => { const s = text.length; text += it.str; offsets.push({ s, e: text.length }); });
      rec = { text, offsets };
    } catch {}
  }
  // Fall back to OCR words (one item per word) for scanned/image pages
  if (!rec.text.trim() && model.ocr && model.ocr.words && model.ocr.words.length) {
    let text = "";
    const offsets = [];
    model.ocr.words.forEach((w, i) => { if (i) text += " "; const s = text.length; text += w.str; offsets.push({ s, e: text.length }); });
    rec = { text, offsets };
  }
  cache.set(model.id, rec);
  return rec;
}

export async function search(query) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 1) return [];
  const matches = [];
  for (const model of state.pages) {
    const { text, offsets } = await getPageText(model);
    const lc = text.toLowerCase();
    let idx = 0;
    while ((idx = lc.indexOf(q, idx)) !== -1) {
      const mEnd = idx + q.length;
      let spanStart = offsets.findIndex((o) => o.e > idx);
      let spanEnd = spanStart;
      for (let i = spanStart; i >= 0 && i < offsets.length; i++) { if (offsets[i].s < mEnd) spanEnd = i; else break; }
      const start = Math.max(0, idx - 32), end = Math.min(text.length, mEnd + 36);
      matches.push({
        pageId: model.id,
        spanStart: spanStart < 0 ? null : spanStart,
        spanEnd: spanStart < 0 ? null : spanEnd,
        snippet: (start > 0 ? "…" : "") + text.slice(start, idx) + "​" + text.slice(idx, mEnd) + "​" + text.slice(mEnd, end) + (end < text.length ? "…" : ""),
      });
      idx = mEnd;
      if (matches.length > 800) return matches;
    }
  }
  return matches;
}

export function clearCache() { cache.clear(); }
