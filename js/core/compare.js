/* Compare two PDFs by extracted text (per page, word-level LCS diff). */
const pdfjsLib = window.pdfjsLib;
const CAP = 3000; // word cap per page to bound the O(m*n) diff

async function pageWords(doc, i) {
  if (i >= doc.numPages) return [];
  const p = await doc.getPage(i + 1);
  const tc = await p.getTextContent();
  return tc.items.map((it) => it.str).join(" ").split(/\s+/).filter(Boolean).slice(0, CAP);
}

export async function comparePdfs(bytesA, bytesB) {
  const a = await pdfjsLib.getDocument({ data: bytesA.slice(0) }).promise;
  const b = await pdfjsLib.getDocument({ data: bytesB.slice(0) }).promise;
  const n = Math.max(a.numPages, b.numPages);
  const pages = [];
  let added = 0, removed = 0;
  for (let i = 0; i < n; i++) {
    const wa = await pageWords(a, i), wb = await pageWords(b, i);
    const d = diff(wa, wb);
    added += d.added; removed += d.removed;
    pages.push({ page: i + 1, ...d, onlyA: i >= b.numPages, onlyB: i >= a.numPages });
  }
  return { pages, numA: a.numPages, numB: b.numPages, added, removed };
}

function diff(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const segs = [];
  let i = 0, j = 0, added = 0, removed = 0;
  const push = (type, w) => { const last = segs[segs.length - 1]; if (last && last.type === type) last.text += " " + w; else segs.push({ type, text: w }); };
  while (i < m && j < n) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); removed++; i++; }
    else { push("add", b[j]); added++; j++; }
  }
  while (i < m) { push("del", a[i]); removed++; i++; }
  while (j < n) { push("add", b[j]); added++; j++; }
  return { segs, added, removed };
}
