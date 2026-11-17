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
  querySelector() { return (this._q ||= new Node("span")); }
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

// ---- "Install a Cycles OS" tab (docs/install.js, on docs/usb.js) ---------------------------------------------------
function loadInstall() {
  const ids = {}, saved = [];
  const document = {
    readyState: "complete", createTextNode: text, getElementById: (id) => (ids[id] ||= new Node("div")),
    createElement: (t) => { const n = new Node(t); if (t === "a") n.click = () => saved.push(n.download); return n; },
  };
  const location = { hash: "" };
  const window = { SamplesSanity: S, MCFlasher: {}, addEventListener() {}, isSecureContext: false };
  const URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
  for (const f of ["usb.js", "install.js"])
    new Function("window", "document", "navigator", "location", "URL", "Blob", "setTimeout", fs.readFileSync(path.join(SITE, f), "utf8"))(
      window, document, {}, location, URL, function () {}, (fn) => fn());
  return { I: window.SamplesInstall, ids, saved, location, window };
}
const file = (name, bytes) => ({ name, arrayBuffer: async () => bytes });
const click = (ids, id) => ids[id].onclick();

test("install tab: output names drop the old suffixes", () => {
  const { I } = loadInstall();
  assert.equal(I.baseName("Supermodel_3.06_for-samples_smp-os.syx"), "Supermodel_3.06");
  assert.equal(I.baseName("Supermodel_Full_2.64_for-samples_cyc-os_pre-fix_rewrapped.syx"), "Supermodel_Full_2.64");
  assert.equal(I.baseName("my-mods.syx"), "my-mods");
  assert.equal(I.baseName("modded-cycles-techno-edition_model-samples.syx"), "modded-cycles-techno-edition");
});

test("install tab: same three steps as Back to Samples OS; one file per OS, sent or downloaded", async (t) => {
  const { firmware } = require("./helpers.js");
  const cyc = firmware("model-cycles_OS1.13.syx"), smp = firmware("model-samples_OS1.13.syx");
  if (!cyc || !smp) { t.skip("firmware/ lacks the official OS files"); return; }
  const { I, ids, saved, location, window } = loadInstall();
  assert.equal(ids["in-files"].hidden, true, "files come after choosing the OS");
  assert.equal(ids["in-steps"].byClass("step").length, 0);

  click(ids, "in-mode-samples");
  assert.equal(ids["in-files"].hidden, false);
  await I.addFiles([file("model-samples_OS1.13.syx", smp)]);
  assert.equal(I.state.result, null);
  assert.match(ids["in-need"].textContent, /needed/);
  let card = ids["in-steps"].byClass("step")[0];
  assert.match(card.className, /off/);
  assert.match(card.textContent, /Add both files first/);

  await I.addFiles([file("model-cycles_OS1.13.syx", cyc)]);
  assert.equal(I.state.error, null);
  assert.match(ids["in-log"].textContent, /Packed the stock Model:Cycles OS 1\.13/);
  card = ids["in-steps"].byClass("step")[0];
  assert.match(card.textContent, /smp-os/);
  assert.match(card.textContent, /answers as Model:Samples/);
  const [go, dl, ck] = card.byClass("btns")[0].children;
  assert.equal(go.textContent, "Send over USB");
  assert.equal(go.disabled, true, "no MIDI yet");
  dl.onclick();
  click(ids, "in-mode-cycles");
  ids["in-steps"].byClass("step")[0].byClass("btns")[0].children[1].onclick();
  assert.deepEqual(saved, ["model-cycles_OS1.13_for-samples_smp-os.syx", "model-cycles_OS1.13_for-samples_cyc-os.syx"]);

  let shown = null;
  window.SamplesCheck = { show: (name, raw) => { shown = { name, raw }; } };
  ids["in-steps"].byClass("step")[0].byClass("btns")[0].children[2].onclick();
  assert.equal(location.hash, "#check");
  assert.equal(shown.name, "model-cycles_OS1.13_for-samples_cyc-os.syx");
  assert.equal(S.check(shown.raw).verdict, "safe");

  await I.load("bad.syx", cyc.subarray(0, 4000));          // from the Check a file tab
  assert.match(ids["in-log"].textContent, /bad\.syx: not packed\. /);
  assert.equal(ids["in-steps"].byClass("step")[0].byClass("btns")[0].children[1].disabled, true);
});

test("install tab: the machine that answers must run the OS chosen in step 1", () => {
  const { I } = loadInstall();
  const step = (mode) => { I.state.mode = mode; return I.steps()[0]; };
  I.usb.dev = null;
  assert.match(I.devProblem(step("samples")), /Connect MIDI/);
  I.usb.dev = { state: "busy" };
  assert.match(I.devProblem(step("samples")), /in use/);
  I.usb.dev = { state: "ok", product: 0x0f, name: "x" };
  assert.equal(I.devProblem(step("samples")), null);
  assert.match(I.devProblem(step("cycles")), /answers as a Model:Samples.*Its own Model:Samples OS/);
  I.usb.dev.product = 0x11;
  assert.equal(I.devProblem(step("cycles")), null);
  assert.match(I.devProblem(step("samples")), /answers as a Model:Cycles.*key fix/);
  assert.match(step("cycles").refused, /Upgrade Failed.*no key fix/);
  assert.match(step("cycles").note, /STARTUP MENU .*ignores this file/);
  assert.match(step("samples").sub, /STARTUP MENU/);
});

test("check result: “Install it on a Model:Samples” only for a Cycles OS, and it opens the install tab with the file", () => {
  const calls = [];
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => x.includes("function render(r)"));
  const ids = {}, location = { hash: "" };
  const g = {
    document: { createElement: (t) => new Node(t), createTextNode: text, getElementById: (id) => (ids[id] ||= new Node("div")), body: new Node("body") },
    window: { SamplesSanity: S, addEventListener() {}, scrollTo() {}, SamplesInstall: { load: (n, raw) => calls.push(n) } },
  };
  const hooked = src.replace("function render(r) {", "window.__render = render; function render(r) {");
  new Function("document", "window", "navigator", "URL", "Blob", "location", hooked)(g.document, g.window, {}, {}, function () {}, location);
  const r2 = g.window.__render;
  const btn = (box) => box.byClass("primary").find((b) => /Install it/.test(b.textContent));

  assert.equal(btn(r2(result({ verdict: "safe", raw: new Uint8Array(1) }))), undefined, "not for the Samples OS");
  const cycBox = r2(result({ verdict: "critical", raw: new Uint8Array(1), facts: { ...result().facts, routes: undefined, cyclesContainer: true, fileName: "mods.syx" } }));
  btn(cycBox).onclick();
  assert.deepEqual(calls, ["mods.syx"]);
  assert.equal(location.hash, "#install");
  btn(r2(result({ verdict: "safe", raw: new Uint8Array(1), facts: { ...result().facts, os: "cycles", transport: "cycles" } }))).onclick();
  assert.equal(location.hash, "#install-cycles");
  assert.equal(typeof g.window.SamplesCheck.show, "function");
});
