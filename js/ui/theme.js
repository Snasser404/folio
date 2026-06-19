/* Theme init + toggle (light/dark). */
import { state, setTheme } from "../core/state.js";

export function initTheme() {
  let t = "light";
  try {
    t = localStorage.getItem("pe-theme") ||
      (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch {}
  setTheme(t);
  updateIcon(t);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.addEventListener("click", () => {
    const nt = state.view.theme === "dark" ? "light" : "dark";
    setTheme(nt); updateIcon(nt);
  });
}

function updateIcon(t) {
  const use = document.querySelector("#themeToggle use");
  if (use) use.setAttribute("href", t === "dark" ? "#ic-sun" : "#ic-moon");
}
