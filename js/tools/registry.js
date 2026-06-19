/* Tool registry. */
import { select, hand } from "./navigation.js";
import { text, image, whiteout } from "./content.js";
import { pen, highlighter } from "./draw.js";
import { rectangle, ellipse, line, arrow } from "./shapes.js";
import { textMarkup } from "./text-markup.js";
import { note, signature, stamp } from "./annotate.js";
import { redact } from "./redact.js";
import { link, crop } from "./link-crop.js";
import { editText } from "./edit-text.js";
import { measure } from "./measure.js";

export const TOOLS = [
  select, hand,
  text, editText, textMarkup, pen, highlighter,
  rectangle, ellipse, line, arrow, measure,
  image, note, signature, stamp, link, whiteout, redact, crop,
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
export const getTool = (id) => BY_ID.get(id);

/** Toolbar layout: groups in display order, with a divider between groups. */
export const TOOLBAR_GROUPS = [
  { name: "select", tools: ["select", "hand"] },
  { name: "markup", tools: ["text", "edit-text", "text-markup", "pen", "highlighter"] },
  { name: "draw", tools: ["rectangle", "ellipse", "line", "arrow", "measure"] },
  { name: "insert", tools: ["image", "note", "signature", "stamp", "link"] },
  { name: "protect", tools: ["whiteout", "redact", "crop"] },
];
