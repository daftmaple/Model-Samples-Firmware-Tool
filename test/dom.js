// Minimal DOM stand-in for the docs/ scripts (no browser, no dependencies), shared by the UI tests.
"use strict";
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

/* Runs docs/ scripts in order against a fake window/document, the way index.html loads them. */
const PARAMS = ["window", "document", "navigator", "location", "URL", "Blob", "setTimeout"];
function run(files, env) {
  for (const f of files)
    new Function(...PARAMS, fs.readFileSync(path.join(SITE, f), "utf8"))(...PARAMS.map((k) => env[k]));
  return env.window;
}
function fakeDocument(ids, extra) {
  return Object.assign({ readyState: "complete", createElement: (t) => new Node(t), createTextNode: text,
    getElementById: (id) => (ids[id] ||= new Node("div")), body: new Node("body") }, extra);
}

/* Loads one tab (ui.js, usb.js, then f) on the stand-in; window entries override the defaults (e.g. SamplesSanity), env
 * entries the globals (e.g. a real setTimeout). saved: downloaded names; files: { name, bytes } of each download. */
function loadTab(f, window = {}, envOver = {}) {
  const ids = {}, saved = [], files = [];
  const document = fakeDocument(ids, {
    createElement: (t) => {
      const n = new Node(t);
      if (t === "a") n.click = () => { saved.push(n.download); files.push({ name: n.download, bytes: n.href.parts[0] }); };
      return n;
    },
  });
  const location = { hash: "" };
  const env = Object.assign({ window: Object.assign({ SamplesSanity: S, MCFlasher: {}, addEventListener() {}, isSecureContext: false }, window),
    document, navigator: {}, location, URL: { createObjectURL: (b) => b, revokeObjectURL() {} },
    Blob: function (parts) { this.parts = parts; }, setTimeout: (fn) => fn() }, envOver);
  run(["ui.js", "usb.js", f], env);
  return { ids, saved, files, location, window: env.window };
}

module.exports = { Node, text, run, fakeDocument, loadTab, PARAMS };
