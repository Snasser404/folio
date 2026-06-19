/* OCR via Tesseract.js (lazy-loaded from CDN on first use).
 * Recognizes a page's rendered image into words with PDF-point bounding boxes,
 * so scanned/image PDFs become searchable (in-app + invisible text on export). */
const pdfjsLib = window.pdfjsLib;
let loading = null;

export function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => rej(new Error("Could not load the OCR engine (needs internet)"));
    document.head.appendChild(s);
  });
  return loading;
}

/** OCR an unrotated source page. Returns { text, words:[{str,x,y,w,h}] } in PDF points (y-up). */
export async function ocrPage(model, pdfDoc, onProgress) {
  const T = await loadTesseract();
  const page = await pdfDoc.getPage(model.srcIndex + 1);
  const scale = 2;
  const vp = page.getViewport({ scale, rotation: 0 });
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const cx = c.getContext("2d");
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: cx, viewport: vp }).promise;

  const { data } = await T.recognize(c, "eng", {
    logger: (m) => { if (onProgress && m.status === "recognizing text") onProgress(m.progress); },
  });
  const ph = model.size.h;
  const words = (data.words || [])
    .filter((w) => w.text && w.text.trim())
    .map((w) => { const b = w.bbox; return { str: w.text, x: b.x0 / scale, y: ph - b.y1 / scale, w: (b.x1 - b.x0) / scale, h: (b.y1 - b.y0) / scale }; });
  return { text: data.text || "", words };
}
