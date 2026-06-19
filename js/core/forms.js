/* AcroForm helpers: detect fillable fields, and apply collected values to a
 * pdf-lib document on export (then flatten so values become page content). */
const PDFLib = window.PDFLib;

/** Returns the number of form fields in the PDF (0 = no form). */
export async function detectForm(bytes) {
  try {
    const d = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    return d.getForm().getFields().length;
  } catch {
    return 0;
  }
}

/** Apply { fieldName: value } to a pdf-lib doc's form; optionally flatten.
 * Uses instanceof (not constructor.name) because pdf-lib ships minified. */
export function applyForm(pdfLibDoc, values, flatten = true) {
  let form;
  try { form = pdfLibDoc.getForm(); } catch { return; }
  const fields = form.getFields();
  if (!fields.length) return;
  const T = PDFLib;
  for (const f of fields) {
    const name = f.getName();
    if (!(name in values)) continue;
    const v = values[name];
    try {
      if (T.PDFTextField && f instanceof T.PDFTextField) f.setText(v == null ? "" : String(v));
      else if (T.PDFCheckBox && f instanceof T.PDFCheckBox) (v ? f.check() : f.uncheck());
      else if (T.PDFRadioGroup && f instanceof T.PDFRadioGroup) { if (v) f.select(String(v)); }
      else if (T.PDFDropdown && f instanceof T.PDFDropdown) { if (v) f.select(String(v)); }
      else if (T.PDFOptionList && f instanceof T.PDFOptionList) { if (v) f.select(String(v)); }
      else if (typeof f.setText === "function") f.setText(v == null ? "" : String(v));
      else if (typeof f.check === "function") (v ? f.check() : f.uncheck());
      else if (typeof f.select === "function" && v != null) f.select(String(v));
    } catch (e) { console.warn("[forms] could not set", name, e); }
  }
  if (flatten) {
    try { form.flatten(); } catch (e) { console.warn("[forms] flatten failed", e); }
  }
}
