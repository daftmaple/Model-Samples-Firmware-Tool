/* "Check a file" tab: one result card per dropped .syx (SamplesSanity.check), with its corrected file to download when
 * there is one. Files stay in this tab: nothing is handed to another tab. */
(function () {
"use strict";

const S = window.SamplesSanity, UI = window.SamplesUI;
const { el } = UI;

const VERDICT = {
  safe: ["✓", "Looks safe to flash", "Only the OS (section 3) differs from Elektron's Model:Samples firmware, and everything it depends on checks out."],
  warn: ["!", "Flashable, with caveats", "Nothing here touches the recovery path, but read the warnings before flashing."],
  fail: ["✕", "Do not flash this file", "The device would refuse it or the OS would not start. The STARTUP MENU still recovers that, but fix the file first."],
  critical: ["✕", "Do not flash: brick risk", "This file changes more than the OS, or it is not a Model:Samples firmware. It touches what the recovery path depends on."],
};
const ICON = { pass: "✓", info: "i", skip: "–", warn: "!", fail: "✕", critical: "✕" };
const LABEL = { pass: "pass", info: "info", skip: "skipped", warn: "warning", fail: "failure", critical: "critical" };
const RANK = { pass: 0, info: 0, skip: 1, warn: 2, fail: 3, critical: 4 };
const NAME = { warn: ["warning", "warnings"], fail: ["failure", "failures"], critical: ["critical", "critical"], skip: ["skipped", "skipped"] };

const icon = (status) => { const i = el("span", "ic", ICON[status]); i.setAttribute("aria-label", LABEL[status]); return i; };
const stem = (f) => (f.fileName || "firmware").replace(/\.syx$/i, "");

function render(r) {
  const box = el("section", "result");
  const [ic, title, sub] = VERDICT[r.verdict];
  const v = el("div", "verdict v-" + r.verdict);
  const h = el("h2"); h.append(el("span", null, ic), el("span", null, title));
  v.append(h, el("p", null, sub));
  box.append(v);

  const f = r.facts, dl = el("dl", "facts");
  const row = (k, val, mono) => { if (val == null || val === "") return; dl.append(el("dt", null, k), el("dd", mono ? "mono" : null, val)); };
  row("File", `${f.fileName} (${f.size.toLocaleString("en-US")} bytes)`);
  row("SHA-256", f.sha256, true);
  if (f.known) row("Recognised as", f.known);
  if (f.mainSize) row("MAIN OS", `${f.mainSize.toLocaleString("en-US")} bytes, ends at 0x${f.mainEnd.toString(16)}`
    + (f.os === "cycles" ? (f.cyclesStock ? " (stock Model:Cycles OS)" : " (Model:Cycles OS with mods)") : f.os === "samples" ? " (official Model:Samples OS)" : ""));

  const ov = el("div", "overview");
  const left = el("div");
  left.append(el("h3", "sec-h", "File"), dl);
  ov.append(left);
  if (f.routes) {
    const af = el("div", "after");
    const p1 = el("p"); p1.append(el("strong", null, "After flashing: "), document.createTextNode(f.after.now));
    const p2 = el("p"); p2.append(el("strong", null, "Next updates / way back: "), document.createTextNode(f.after.next));
    af.append(p1, p2);
    left.append(af);

    const w = el("div");
    w.append(el("h3", "sec-h", "Where and when it can be flashed"));
    const LBL = { yes: "Yes", no: "No", risky: "Risky" };
    for (const x of f.routes) {
      const rr = el("details", "route r-" + x.ok);
      const sm = el("summary");
      sm.append(el("span", "badge", LBL[x.ok]), el("span", "t", x.where));
      const more = el("div", "more");
      if (x.how !== "—") more.append(el("div", "how", "via " + x.how));
      more.append(el("div", "d", x.why));
      rr.append(sm, more);
      w.append(rr);
    }
    ov.append(w);
  }
  box.append(ov);

  // Checks: one collapsible card per group, opened when something in it needs attention
  const groups = [];
  for (const c of r.checks) {
    if (!groups.length || groups[groups.length - 1].name !== c.group) groups.push({ name: c.group, items: [] });
    groups[groups.length - 1].items.push(c);
  }
  const tallyOf = (items) => {
    const n = {};
    for (const c of items) n[c.status] = (n[c.status] || 0) + 1;
    return n;
  };
  const describe = (n, total) => {
    const bad = ["critical", "fail", "warn", "skip"].filter((k) => n[k]).map((k) => `${n[k]} ${NAME[k][n[k] > 1 ? 1 : 0]}`);
    return bad.length ? bad.join(", ") : `${total} OK`;
  };

  const cs = el("div", "checks");
  const top = el("div", "checks-top");
  const all = tallyOf(r.checks);
  const tally = el("div", "tally");
  const ok = (all.pass || 0) + (all.info || 0);
  tally.append(el("span", null, `${ok} of ${r.checks.length} checks passed` + (ok < r.checks.length ? ` · ${describe(all, 0)}` : "")));
  const toggle = el("button", "link", "Expand all");
  tally.append(toggle);
  top.append(el("h3", "sec-h", "Checks"), tally);
  cs.append(top);

  const grid = el("div", "grid");
  const cards = [];
  for (const g of groups) {
    const worst = g.items.reduce((m, c) => (RANK[c.status] > RANK[m] ? c.status : m), "pass");
    const card = el("details", "gcard s-" + worst);
    if (RANK[worst] >= 2) card.open = true;
    const sm = el("summary");
    sm.append(icon(worst), el("span", "gname", g.name), el("span", "count", describe(tallyOf(g.items), g.items.length)));
    const rows = el("div", "rows");
    for (const c of g.items) {
      const rw = el("div", "chk s-" + c.status);
      rw.append(icon(c.status), el("span", "t", c.title));
      if (c.detail) rw.append(el("span", "d", c.detail));
      if (c.link) { const a = el("a", "go", c.link.text + " →"); a.href = c.link.href; rw.append(a); }
      rows.append(rw);
    }
    card.append(sm, rows);
    cards.push(card);
    grid.append(card);
  }
  const sync = () => { toggle.textContent = cards.every((c) => c.open) ? "Collapse all" : "Expand all"; };
  toggle.onclick = () => { const open = !cards.every((c) => c.open); for (const c of cards) c.open = open; sync(); };
  for (const c of cards) c.addEventListener("toggle", sync);
  sync();
  cs.append(grid);
  box.append(cs);

  const act = el("div", "actions");
  const copy = el("button", null, "Copy report");
  copy.onclick = async () => {
    const txt = S.report(r);
    try { await navigator.clipboard.writeText(txt); copy.textContent = "Copied"; }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); copy.textContent = "Copied"; } catch (e2) { copy.textContent = "Copy failed"; }
      ta.remove();
    }
    setTimeout(() => (copy.textContent = "Copy report"), 1600);
  };
  const save = el("button", null, "Save report (.txt)");
  save.onclick = () => UI.save(S.report(r), stem(f) + "_check.txt", "text/plain");
  act.append(copy, save);

  /* One corrected file, built on click. The key fix also writes the new packet numbering, so it covers both fixes. */
  const fix = r.verdict !== "warn" ? null
    : f.canFixKey ? { make: S.fixKey, suffix: "_keyfix.syx",
      title: "Adds the 32-byte key fix: same container and OS, only those bytes change, re-signed with the Model:Samples key" + (f.seqHigh ? "; packet numbering fixed too" : "") }
    : f.seqHigh ? { make: S.rewrap, suffix: "_rewrapped.syx",
      title: "Fixes the packet numbering for MIDI IN and Web MIDI: same container, OS and signature" }
    : null;
  if (fix) {
    const b = el("button", "primary", "Download the fixed .syx");
    b.title = fix.title;
    b.onclick = () => {
      try { UI.save(fix.make(r.raw), stem(f) + fix.suffix); b.textContent = "Saved: check it again here"; }
      catch (e) { b.textContent = "Fix failed: " + e.message; b.disabled = true; }
    };
    act.prepend(b);
  }
  box.append(act);
  return box;
}

let gen = 0;                                               // bumped by reset(): a check still running is dropped

async function handle(files) {
  const out = UI.$("out"), my = ++gen;
  out.textContent = "";
  for (const file of files) {
    if (my !== gen) return;
    const busy = el("div", "result busy", `Checking ${file.name}…`);
    out.append(busy);
    await new Promise((res) => setTimeout(res, 20));      // let the message paint
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (my !== gen) return;
      const res = S.check(buf, file.name);
      res.raw = buf;
      busy.replaceWith(render(res));
    } catch (e) {
      busy.textContent = `Could not check ${file.name}: ${e.message}`;
    }
  }
}

function init() {
  if (UI.$("drop")) UI.dropZone(UI.$("drop"), UI.$("file"), handle);
}

/* Leaving the tab: forget the results and their files. */
function reset() { gen++; UI.$("out").textContent = ""; }

window.SamplesCheck = { render, reset };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
