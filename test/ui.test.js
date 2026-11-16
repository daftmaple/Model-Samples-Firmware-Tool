// The result card drawn by docs/index.html, run against a minimal DOM stand-in (no browser, no dependencies).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const S = require("../docs/sanity.js");
const { SITE } = require("./helpers.js");

// ---- Minimal DOM: just what render() uses ------------------------------------------------------------------------
class Node {
  constructor(tag) { Object.assign(this, { tag, children: [], className: "", _text: "", open: false, listeners: {}, style: {}, dataset: {} }); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
  append(...cs) { for (const c of cs) this.children.push(typeof c === "string" ? text(c) : c); }
  prepend(c) { this.children.unshift(c); }
  addEventListener(t, f) { this.listeners[t] = f; }
  replaceWith() {} remove() {} setAttribute() {} select() {}
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
  toggle(open) { this.open = open; if (this.listeners.toggle) this.listeners.toggle(); }
  all(pred, out = []) { for (const c of this.children) { if (c instanceof Node) { if (pred(c)) out.push(c); c.all(pred, out); } } return out; }
  byClass(cls) { return this.all((n) => n.className.split(" ").includes(cls)); }
}
const text = (s) => ({ textContent: s });

function loadRender() {
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const src = scripts.find((s) => s.includes("function render(r)"));
  assert.ok(src, "index.html has the result script");
  const ids = {};
  const g = {
    document: { createElement: (t) => new Node(t), createTextNode: text, getElementById: (id) => (ids[id] ||= new Node("div")), body: new Node("body") },
    window: { SamplesSanity: S, addEventListener() {} },
  };
  const hooked = src.replace("function render(r) {", "window.__render = render; function render(r) {");
  new Function("document", "window", "navigator", "URL", "Blob", hooked)(g.document, g.window, {}, {}, function () {});
  return g.window.__render;
}
const render = loadRender();

const result = (over = {}) => ({
  verdict: "warn",
  checks: [
    { group: "SysEx transport", status: "info", title: "Transport: Model:Samples", detail: "" },
    { group: "SysEx transport", status: "pass", title: "Start and end markers well formed", detail: "" },
    { group: "SysEx transport", status: "pass", title: "Every packet OK", detail: "" },
    { group: "MAIN OS (section 3)", status: "pass", title: "MAIN OS unpacks cleanly", detail: "" },
    { group: "MAIN OS (section 3)", status: "warn", title: "Installed OS will NOT verify updates", detail: "key fix missing",
      link: { href: "#revert-unfixed", text: "Back to Samples OS" } },
  ],
  facts: {
    fileName: "x.syx", size: 1234, sha256: "ab".repeat(32), seqHigh: 0,
    routes: [
      { where: "Model:Samples on its own OS", how: "USB", ok: "yes", why: "It takes it." },
      { where: "A Model:Cycles (any OS)", how: "—", ok: "no", why: "Do not send it." },
    ],
    after: { now: "Now.", next: "Next." },
  },
  ...over,
});

test("verdict banner, file facts and routes side by side", () => {
  const box = render(result());
  assert.equal(box.byClass("verdict")[0].className, "verdict v-warn");
  assert.match(box.byClass("verdict")[0].textContent, /Flashable, with caveats/);
  const ov = box.byClass("overview")[0];
  assert.equal(ov.children.length, 2, "two columns");
  assert.match(ov.children[0].textContent, /x\.syx \(1,234 bytes\)/);
  assert.match(ov.children[0].byClass("after")[0].textContent, /After flashing: Now\./);
  const routes = box.byClass("route");
  assert.deepEqual(routes.map((r) => r.className), ["route r-yes", "route r-no"]);
  assert.deepEqual(routes.map((r) => r.byClass("badge")[0].textContent), ["Yes", "No"]);
  assert.match(routes[0].byClass("how")[0].textContent, /^via USB$/);
  assert.equal(routes[1].byClass("how").length, 0, "no 'via' line when there is no way");
});

test("no routes column for a file that must not be flashed", () => {
  const r = S.check(new Uint8Array(0), "empty.syx");
  const box = render(r);
  assert.equal(box.byClass("overview")[0].children.length, 1);
  assert.equal(box.byClass("route").length, 0);
});

test("one card per check group: passing groups closed, groups needing attention open", () => {
  const box = render(result());
  const cards = box.byClass("gcard");
  assert.deepEqual(cards.map((c) => c.byClass("gname")[0].textContent), ["SysEx transport", "MAIN OS (section 3)"]);
  assert.deepEqual(cards.map((c) => c.className), ["gcard s-pass", "gcard s-warn"]);
  assert.deepEqual(cards.map((c) => c.open), [false, true]);
  assert.deepEqual(cards.map((c) => c.byClass("count")[0].textContent), ["3 OK", "1 warning"]);
  assert.equal(cards[1].byClass("chk").length, 2);
  const a = cards[1].byClass("go")[0];
  assert.equal(a.href, "#revert-unfixed");
  assert.equal(a.textContent, "Back to Samples OS →");
});

test("the worst status names the card, and counts are pluralised", () => {
  const r = result({ verdict: "critical" });
  r.checks.push({ group: "MAIN OS (section 3)", status: "critical", title: "a", detail: "" },
    { group: "MAIN OS (section 3)", status: "fail", title: "b", detail: "" },
    { group: "MAIN OS (section 3)", status: "fail", title: "c", detail: "" });
  const card = render(r).byClass("gcard")[1];
  assert.equal(card.className, "gcard s-critical");
  assert.equal(card.byClass("count")[0].textContent, "1 critical, 2 failures, 1 warning");
});

test("tally and Expand all / Collapse all", () => {
  const box = render(result());
  const tally = box.byClass("tally")[0];
  assert.match(tally.textContent, /^4 of 5 checks passed · 1 warning/);
  const btn = box.byClass("link")[0], cards = box.byClass("gcard");
  assert.equal(btn.textContent, "Expand all");
  btn.onclick();
  assert.ok(cards.every((c) => c.open));
  assert.equal(btn.textContent, "Collapse all");
  btn.onclick();
  assert.ok(cards.every((c) => !c.open));
  cards[0].toggle(true); cards[1].toggle(true);
  assert.equal(btn.textContent, "Collapse all", "follows cards opened by hand");
});

test("an all-pass result says so without a list of issues", () => {
  const r = result({ verdict: "safe" });
  r.checks = r.checks.filter((c) => c.status !== "warn");
  const box = render(r);
  assert.equal(box.byClass("tally")[0].children[0].textContent, "4 of 4 checks passed");
  assert.ok(box.byClass("gcard").every((c) => !c.open));
});

test("the re-wrap button appears only for the packet-numbering warning", () => {
  const buttons = (r) => render(r).byClass("actions")[0].children.map((b) => b.textContent);
  assert.deepEqual(buttons(result()), ["Copy report", "Save report (.txt)"]);
  const r = result(); r.facts.seqHigh = 8;
  assert.deepEqual(buttons(r), ["Download re-wrapped .syx", "Copy report", "Save report (.txt)"]);
  const f = result({ verdict: "fail" }); f.facts.seqHigh = 8;
  assert.equal(buttons(f)[0], "Copy report");
});

test("the key-fix button appears only for a fixable missing key fix", () => {
  const first = (r) => render(r).byClass("actions")[0].children[0].textContent;
  const r = result(); r.facts.keyfix = false; r.facts.canFixKey = true;
  assert.equal(first(r), "Download .syx with the key fix");
  const n = result(); n.facts.keyfix = false; n.facts.canFixKey = false;
  assert.equal(first(n), "Copy report");
  const f = result({ verdict: "fail" }); f.facts.canFixKey = true;
  assert.equal(first(f), "Copy report");
});
