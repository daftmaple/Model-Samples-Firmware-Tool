// The result card drawn by docs/check.js and the Install / Back tabs, run against a minimal DOM stand-in (no browser, no dependencies).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const S = require("../docs/sanity.js");
const { SITE } = require("./helpers.js");

const { Node, run, fakeDocument, loadTab, PARAMS } = require("./dom.js");

function loadRender(window = {}, location = { hash: "" }) {
  const env = { window: Object.assign(window, { SamplesSanity: S, addEventListener() {}, scrollTo() {} }),
    document: fakeDocument({}), navigator: {}, location, URL: {}, Blob: function () {}, setTimeout: () => {} };
  return run(["ui.js", "check.js"], env).SamplesCheck.render;
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

test("the way-back file: a verdict of its own, expected findings in their own colour and wording", (t) => {
  const raw = require("./helpers.js").firmware("reference/model-samples_OS1.13_for-model-cycles.syx")
    || require("./helpers.js").firmware("model-cycles_OS1.13-samples.syx");
  if (!raw) { t.skip("firmware/ lacks the way-back file"); return; }
  const r = S.check(raw, "model-samples_OS1.13_for-model-cycles.syx");
  const box = render(r);
  const v = box.byClass("verdict")[0];
  assert.equal(v.className, "verdict v-onecase");
  assert.match(v.textContent, /Flashable in one case only.*WITHOUT the key fix.*marked “expected”/);
  assert.match(box.byClass("tally")[0].textContent, /5 expected/);
  const exp = box.byClass("chk").filter((c) => c.className === "chk s-expected");
  assert.equal(exp.length, 5);
  assert.match(exp[0].textContent, /\(critical in a Model:Samples file, expected here\)/);
  assert.ok(box.byClass("gcard").some((g) => g.className === "gcard s-expected" && g.open), "their cards open, dashed");
  const links = box.byClass("go").map((a) => a.href);
  assert.deepEqual(links, ["#revert-unfixed"], "only the Back tab link, no 'pack it' link");
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

test("the fixed-file button appears for the packet-numbering warning", () => {
  const buttons = (r) => render(r).byClass("actions")[0].children.map((b) => b.textContent);
  assert.deepEqual(buttons(result()), ["Copy report", "Save report (.txt)"]);
  const r = result(); r.facts.seqHigh = 8;
  assert.deepEqual(buttons(r), ["Download the fixed .syx", "Copy report", "Save report (.txt)"]);
  const f = result({ verdict: "fail" }); f.facts.seqHigh = 8;
  assert.equal(buttons(f)[0], "Copy report");
});

test("the fixed-file button also covers a fixable missing key fix", () => {
  const first = (r) => render(r).byClass("actions")[0].children[0].textContent;
  const r = result(); r.facts.keyfix = false; r.facts.canFixKey = true;
  assert.equal(first(r), "Download the fixed .syx");
  r.facts.seqHigh = 8;
  assert.deepEqual(render(r).byClass("actions")[0].children.map((b) => b.textContent),
    ["Download the fixed .syx", "Copy report", "Save report (.txt)"], "one button for both fixes");
  const n = result(); n.facts.keyfix = false; n.facts.canFixKey = false;
  assert.equal(first(n), "Copy report");
  const f = result({ verdict: "fail" }); f.facts.canFixKey = true;
  assert.equal(first(f), "Copy report");
});

// ---- "Install a Cycles OS" tab (docs/install.js, on docs/usb.js) ---------------------------------------------------
function loadInstall() { const t = loadTab("install.js"); return Object.assign(t, { I: t.window.SamplesInstall }); }
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
  const { I, ids, saved } = loadInstall();
  assert.equal(ids["in-files"].hidden, true, "files come after choosing the OS");
  assert.equal(ids["in-steps"].byClass("step").length, 0);

  click(ids, "in-mode-samples");
  assert.equal(ids["in-files"].hidden, false);
  await I.addFiles([file("model-samples_OS1.13.syx", smp)]);
  assert.equal(I.state.result, null);
  assert.match(ids["in-need"].textContent, /needed/);
  let card = ids["in-steps"].byClass("step")[0];
  assert.match(card.className, /off/);
  assert.match(card.textContent, /Add your Cycles OS/);

  await I.addFiles([file("model-cycles_OS1.13.syx", cyc)]);
  assert.equal(I.state.error, null);
  assert.match(ids["in-log"].textContent, /Packed the stock Model:Cycles OS 1\.13/);
  card = ids["in-steps"].byClass("step")[0];
  assert.match(card.textContent, /smp-os/);
  assert.match(card.textContent, /answers as Model:Samples/);
  const sendBtns = card.byClass("btns")[0].children;
  assert.deepEqual(sendBtns.map((b) => b.textContent), ["Send over USB"], "downloading is its own section");
  assert.equal(sendBtns[0].disabled, true, "no MIDI yet");
  const dlRow = () => ids["in-dl"].byClass("step")[0];
  assert.match(dlRow().textContent, /STARTUP MENU over MIDI IN/);
  const [dl, ...more] = dlRow().byClass("btns")[0].children;
  assert.equal(dl.textContent, "Download .syx");
  assert.equal(more.length, 0, "no hand-off to the Check tab");
  dl.onclick();
  click(ids, "in-mode-cycles");
  assert.match(dlRow().textContent, /Not from the STARTUP MENU/);
  dlRow().byClass("btns")[0].children[0].onclick();
  assert.deepEqual(saved, ["model-cycles_OS1.13_for-samples_smp-os.syx", "model-cycles_OS1.13_for-samples_cyc-os.syx"]);

  await I.addFiles([file("bad.syx", cyc.subarray(0, 4000))]);
  assert.match(ids["in-log"].textContent, /bad\.syx: not packed\. /);
  assert.equal(dlRow().byClass("btns")[0].children[0].disabled, true);
});

test("install tab: a Model:Cycles build waits for the official file; a packed file needs only itself", async (t) => {
  const { firmware } = require("./helpers.js");
  const cyc = firmware("model-cycles_OS1.13.syx"), packed = firmware("modded-cycles-os_2.0_for-samples_cyc-os.syx");
  if (!cyc || !packed) { t.skip("firmware/ lacks the files"); return; }
  let { I, ids } = loadInstall();
  click(ids, "in-mode-samples");
  assert.match(ids["in-need"].textContent, /not needed for a file already packed/, "before any file: both may be needed");
  await I.addFiles([file("model-cycles_OS1.13.syx", cyc)]);
  assert.equal(I.state.result, null);
  assert.equal(I.state.error, null, "waiting, not an error");
  assert.equal(I.state.needSmp, true);
  assert.match(ids["in-need"].textContent, /needed.*model-samples_OS1\.13\.syx/);
  assert.match(ids["in-steps"].byClass("step")[0].textContent, /Add the official model-samples_OS1\.13\.syx/);

  ({ I, ids } = loadInstall());
  click(ids, "in-mode-samples");
  await I.addFiles([file("modded-cycles-os_2.0_for-samples_cyc-os.syx", packed)]);
  assert.equal(I.state.error, null);
  assert.equal(I.state.needSmp, false);
  assert.ok(I.state.result, "packed without the official file");
  assert.doesNotMatch(ids["in-need"].textContent, /model-samples_OS1\.13/, "the official file is not listed");
  assert.equal(ids["in-need-note"].hidden, false);
  assert.match(ids["in-log"].textContent, /already packed for the Model:Samples/);
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
  assert.match(step("samples").where, /STARTUP MENU/);
});

test("check result: no button hands the file to another tab", () => {
  const r = result({ verdict: "safe", raw: new Uint8Array(1), facts: { ...result().facts, os: "cycles", transport: "cycles", cyclesContainer: true } });
  const labels = render(r).byClass("actions")[0].children.map((b) => b.textContent);
  assert.deepEqual(labels, ["Copy report", "Save report (.txt)"]);
});

test("install tab: the machine's answer is compared with the OS chosen in step 1", () => {
  const { I, ids } = loadInstall();
  I.usb.dev = { state: "ok", product: 0x11, name: "x" };
  I.render();
  assert.equal(I.state.mode, null, "connecting does not choose for you");
  assert.equal(ids["in-detect"].textContent, "");
  click(ids, "in-mode-cycles");
  assert.match(ids["in-detect"].textContent, /runs a Cycles OS, as chosen in step 1/);
  click(ids, "in-mode-samples");
  assert.match(ids["in-detect"].textContent, /runs a Cycles OS: with the key fix, pick/);
  I.usb.dev.product = 0x0f; I.render();
  assert.match(ids["in-detect"].textContent, /its own Model:Samples OS, as chosen/);
});

test("install tab: without Web MIDI the page says so and still offers the download", () => {
  const { ids } = loadInstall();
  assert.equal(ids["in-connect"].disabled, true);
  assert.match(ids["in-dev"].textContent, /no Web MIDI.*download the file/);
});

test("back tab: two ways, the files each needs, and the Model:Samples box for the second", () => {
  const { ids, window } = loadTab("revert.js", { MCBuilder: { hex: S.hex, sha256: S.sha256 } });
  const R = window.SamplesRevert;
  assert.equal(ids["rv-files"].hidden, true);
  click(ids, "rv-mode-fixed");
  assert.equal(ids["rv-confirm"].hidden, true);
  assert.deepEqual(R.steps().map((s) => s.id), ["back"]);
  assert.match(ids["rv-need"].textContent, /model-samples_OS1\.13\.syx/);
  assert.doesNotMatch(ids["rv-need"].textContent, /model-cycles/);
  click(ids, "rv-mode-unfixed");
  assert.equal(ids["rv-confirm"].hidden, false);
  assert.deepEqual(R.steps().map((s) => s.id), ["tocyc", "official"]);
  assert.match(ids["rv-need"].textContent, /model-cycles_OS1\.13\.syx/);
  const cards = ids["rv-steps"].byClass("step");
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => /off/.test(c.className)), "no files yet");
  assert.match(cards[1].byClass("note")[0].textContent, /Skip this/);
  assert.ok(cards.every((c) => c.byClass("btns")[0].children.map((x) => x.textContent).join() === "Send over USB"),
    "downloading is its own section");
  const rows = ids["rv-dl"].byClass("step");
  assert.deepEqual(rows.map((r) => r.byClass("mono")[0].textContent),
    ["model-samples_OS1.13_for-model-cycles.syx", "model-samples_OS1.13.syx"]);
  assert.match(rows[0].textContent, /Only to a Model:Samples/);
  assert.match(rows[1].textContent, /unchanged/);
  // The way-back file: a warning box and a warning button; the official file: the usual button
  assert.match(rows[0].className, /step-warn/);
  assert.match(rows[0].byClass("warn-box")[0].textContent, /One case only\..*without the key fix.*Check a file flags it.*Prefer “Send over USB” above/);
  const [warnBtn, plainBtn] = rows.map((r) => r.byClass("btns")[0].children[0]);
  assert.equal(warnBtn.className, "warn");
  assert.match(warnBtn.textContent, /Cycles OS without the key fix only/);
  assert.equal(plainBtn.textContent, "No download needed: it is your own file");
  assert.equal(plainBtn.disabled, true, "the official file is the user's own: nothing to download");
  assert.equal(rows[1].byClass("warn-box").length, 0);
  click(ids, "rv-mode-fixed");
  const back = ids["rv-dl"].byClass("step")[0];
  assert.equal(back.byClass("warn-box").length, 0, "the first way's file needs no warning");
  assert.equal(back.byClass("btns")[0].children[0].className, "primary");
  assert.equal(back.byClass("btns")[0].children[0].textContent, "Download .syx", "the first way's file is built here");
  click(ids, "rv-mode-unfixed");
  assert.ok(rows.every((r) => r.byClass("btns")[0].children[0].disabled), "no files yet");
  Object.assign(R.state.official, { samples: new Uint8Array(1), cycles: new Uint8Array(1) }); R.render();
  const [built, own] = ids["rv-dl"].byClass("step").map((r) => r.byClass("btns")[0].children[0]);
  assert.equal(built.disabled, false, "the way-back file can be downloaded once both files are in");
  assert.equal(own.disabled, true, "the official file still has nothing to download");
  assert.doesNotMatch(ids["rv-dl"].byClass("step")[1].className, /off/, "its row is not greyed out: it is ready to send");
  Object.assign(R.state.official, { samples: null, cycles: null }); R.render();
  assert.equal(ids["rv-download"].hidden, false);
  R.usb.dev = { state: "ok", product: 0x0f, name: "x" };
  assert.match(R.devProblem(R.steps()[0]), /nothing to bring back/);
  assert.equal(R.devProblem(R.steps()[1]), null);
});

// ---- Files never carry over between tabs ---------------------------------------------------------------------------
test("install tab: reset() forgets the files, the choice and the log, but not while sending", async (t) => {
  const smp = require("./helpers.js").firmware("model-samples_OS1.13.syx");
  if (!smp) { t.skip("firmware/ lacks model-samples_OS1.13.syx"); return; }
  const { I, ids } = loadInstall();
  click(ids, "in-mode-samples");
  await I.addFiles([file("model-samples_OS1.13.syx", smp)]);
  assert.ok(I.state.smp);
  I.usb.sending = "smp";
  assert.equal(I.reset(), false);
  assert.ok(I.state.smp, "kept while sending");
  I.usb.sending = false;
  assert.equal(I.reset(), true);
  assert.deepEqual([I.state.mode, I.state.smp, I.state.mod, I.state.log.length], [null, null, null, 0]);
  assert.equal(ids["in-files"].hidden, true);
  assert.equal(ids["in-log"].textContent, "");
});

test("back tab: reset() forgets the files, the choice and the Model:Samples box", () => {
  const { ids, window } = loadTab("revert.js", { MCBuilder: { hex: S.hex, sha256: S.sha256 } });
  const R = window.SamplesRevert;
  click(ids, "rv-mode-unfixed");
  R.state.official.samples = new Uint8Array(1);
  ids["rv-is-samples"].checked = true;
  assert.equal(R.reset(), true);
  assert.deepEqual([R.state.mode, R.state.official.samples, ids["rv-is-samples"].checked], [null, null, false]);
  assert.equal(ids["rv-files"].hidden, true);
});

test("check tab: reset() clears the results", () => {
  const ids = {};
  const env = { window: { SamplesSanity: S, addEventListener() {} }, document: fakeDocument(ids), navigator: {},
    location: { hash: "" }, URL: {}, Blob: function () {}, setTimeout: () => {} };
  const C = run(["ui.js", "check.js"], env).SamplesCheck;
  ids.out = new Node("div"); ids.out.append(new Node("section"));
  C.reset();
  assert.equal(ids.out.children.length, 0);
});

test("app: leaving a tab resets it; staying on it (another hash in the same view) does not", () => {
  const ids = {}, calls = [], location = { hash: "#install" }, handlers = {};
  const tabs = ["start", "install", "revert", "check", "help"].map((v) => { const n = new Node("button"); n.dataset.tab = v; return n; });
  const document = fakeDocument(ids, { querySelectorAll: () => tabs });
  const window = { addEventListener: (t, f) => { handlers[t] = f; }, scrollTo() {},
    SamplesInstall: { reset: () => calls.push("install") }, SamplesCheck: { reset: () => calls.push("check") } };
  const env = { window, document, navigator: {}, location, URL: {}, Blob: function () {}, setTimeout: () => {} };
  new Function(...PARAMS, "history", fs.readFileSync(path.join(SITE, "app.js"), "utf8"))(...PARAMS.map((k) => env[k]),
    { pushState: (_, __, h) => { location.hash = h; } });
  assert.equal(ids["tab-install"].hidden, false);
  location.hash = "#install-samples"; handlers.hashchange();
  assert.deepEqual(calls, [], "same view");
  tabs[3].onclick();
  assert.deepEqual(calls, ["install"]);
  assert.equal(ids["tab-check"].hidden, false);
  location.hash = "#help-recovery"; handlers.hashchange();
  assert.deepEqual(calls, ["install", "check"]);
});
