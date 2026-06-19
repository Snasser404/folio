/* Thin adapter over PDF.js. The ONLY module (besides export-engine) that
 * touches window.pdfjsLib. */
const pdfjsLib = window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

/** Load a PDF from bytes. Pass a COPY — pdf.js may detach the buffer. */
export async function loadPdf(bytes) {
  return pdfjsLib.getDocument({ data: bytes, cMapUrl: undefined }).promise;
}

/** 0-based page index. */
export async function getPage(pdfDoc, index) {
  return pdfDoc.getPage(index + 1);
}

export function getViewport(pdfPage, scale, rotation = 0) {
  return pdfPage.getViewport({ scale, rotation });
}

export async function getTextContent(pdfPage) {
  return pdfPage.getTextContent();
}

export async function getOutline(pdfDoc) {
  try { return await pdfDoc.getOutline(); } catch { return null; }
}

export async function getMetadata(pdfDoc) {
  try { return await pdfDoc.getMetadata(); } catch { return null; }
}

export function renderTextLayer(textContent, container, viewport) {
  const textDivs = [];
  const task = pdfjsLib.renderTextLayer({ textContentSource: textContent, container, viewport, textDivs });
  return task.promise.then(() => textDivs);
}

export async function cleanup(pdfDoc) {
  try { await pdfDoc.cleanup(); } catch {}
}
