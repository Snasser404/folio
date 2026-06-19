/* Small shared helpers. */
export function hexToRgba(hex, a = 1) {
  if (!hex || hex === "transparent") return "rgba(0,0,0,0)";
  if (hex.startsWith("rgb")) return hex;
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function download(bytes, name, type = "application/pdf") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function dataUrlToBytes(dataUrl) {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export function readFileAsArrayBuffer(file) {
  return file.arrayBuffer();
}

export function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
