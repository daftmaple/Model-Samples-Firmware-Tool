/* Views and navigation. The hash picks the view: "#revert-unfixed" opens "revert", "#help-recovery" opens "help" and
 * scrolls to #help-recovery. No hash: the Start view. The nav follows the ARIA tabs pattern (arrow keys, Home, End).
 * Files never carry over: leaving a tab resets it (its files, choices and log), except while it is sending. */
(function () {
"use strict";

const VIEWS = ["start", "install", "revert", "check", "help"];
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];

function current() {
  const v = location.hash.slice(1).split("-")[0];
  return VIEWS.includes(v) ? v : "start";
}

const TABS = () => ({ check: window.SamplesCheck, install: window.SamplesInstall, revert: window.SamplesRevert });
let shown = null;

function show() {
  const view = current();
  if (shown && shown !== view) { const t = TABS()[shown]; if (t && t.reset) t.reset(); }
  shown = view;
  for (const t of tabs) {
    const on = t.dataset.tab === view;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  }
  for (const v of VIEWS) document.getElementById("tab-" + v).hidden = v !== view;
  const target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (target && target.scrollIntoView) target.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
}

function go(view) {
  if (current() !== view || location.hash !== "#" + view) history.pushState(null, "", "#" + view);
  show();
}

tabs.forEach((t, k) => {
  t.onclick = () => go(t.dataset.tab);
  t.onkeydown = (e) => {
    const n = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n == null) return;
    e.preventDefault();
    const next = tabs[(n + tabs.length) % tabs.length];
    next.focus(); go(next.dataset.tab);
  };
});
window.addEventListener("hashchange", show);
window.addEventListener("popstate", show);
// A file dropped outside a drop zone must not replace the page
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
show();
})();
