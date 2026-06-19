/* Comments panel — lists sticky notes across the document. */
import { bus, state, getPage, setFocusedPage } from "../core/state.js";
import * as scheduler from "../core/render-scheduler.js";
import * as PH from "../core/page-host.js";
import { iconSvg } from "../ui/icon.js";

export function initCommentsPanel(ctx) {
  const panel = document.getElementById("panel-comments");
  let t = null;
  const debounced = () => { clearTimeout(t); t = setTimeout(render, 350); };
  bus.on("comments:changed", render);
  bus.on("pages:changed", debounced);
  bus.on("doc:dirty", debounced);
  bus.on("panel:changed", (p) => { if (p === "comments") render(); });

  function collect() {
    for (const h of scheduler.getHosts().values()) PH.syncToModel(h);
    const out = [];
    state.pages.forEach((p, pi) => {
      const objs = (p.annotations && p.annotations.objects) || [];
      objs.forEach((o) => {
        if (o.meta && o.meta.kind === "note")
          out.push({ pageId: p.id, pageNo: pi + 1, objId: o.id, text: o.meta.text || "(empty)", color: o.fill || "#ffd400" });
      });
    });
    return out;
  }

  function render() {
    const items = collect();
    panel.innerHTML = "";
    if (!items.length) { panel.innerHTML = '<div class="empty-note">No comments yet.<br>Use the Sticky note tool to add one.</div>'; return; }
    items.forEach((it) => {
      const el = document.createElement("div");
      el.className = "list-item";
      el.innerHTML = `<div class="li-head"><span class="li-dot" style="background:${it.color}"></span> Page ${it.pageNo}
        <span style="flex:1"></span></div><div class="li-body">${escapeHtml(it.text)}</div>`;
      const head = el.querySelector(".li-head");
      const del = document.createElement("button");
      del.className = "icon-btn"; del.style.cssText = "width:22px;height:22px";
      del.innerHTML = iconSvg("trash");
      del.addEventListener("click", (e) => { e.stopPropagation(); remove(it); });
      head.appendChild(del);
      el.addEventListener("click", () => jump(it));
      panel.appendChild(el);
    });
  }

  function jump(it) {
    setFocusedPage(it.pageId);
    scheduler.scrollToPage(it.pageId, "center");
  }
  function remove(it) {
    const host = scheduler.getHost(it.pageId);
    if (host && host.mounted) {
      const o = host.fabric.getObjects().find((x) => x.id === it.objId);
      if (o) { host.fabric.remove(o); host.fabric.requestRenderAll(); ctx.commitFor(it.pageId, "Delete note"); }
    } else {
      const page = getPage(it.pageId);
      if (page) { page.annotations.objects = (page.annotations.objects || []).filter((o) => o.id !== it.objId); scheduler.invalidate(it.pageId); }
    }
    render();
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
