/* Render a tool/icon spec to inline SVG markup.
 * Accepts a raw "<svg…>" string, or a sprite suffix like "rect" -> #ic-rect. */
export function iconSvg(icon) {
  if (!icon) return "";
  if (icon.trim().startsWith("<svg")) return icon;
  return `<svg viewBox="0 0 24 24"><use href="#ic-${icon}"/></svg>`;
}
