/* Small DOM helpers shared by every tab (browser window.SamplesUI). No dependencies. */
(function () {
"use strict";

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const kb = (n) => (n / 1024).toFixed(0) + " KB";

/* Download bytes (or text) as a file. */
function save(data, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: type || "application/octet-stream" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* A drop zone: a <label class="drop"> holding a visually hidden <input type="file">. The input stays focusable, so
 * the zone opens the file picker from the keyboard too (Tab, then Enter or Space). */
function dropZone(drop, input, onFiles) {
  input.addEventListener("change", () => { if (input.files.length) onFiles([...input.files]); input.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
}

/* The "✓ file / needed file" checklist under a drop zone. items: [[have, label], …] */
function needList(ul, items) {
  ul.textContent = "";
  for (const [have, label] of items) {
    const li = el("li", have ? "have" : "missing");
    li.append(el("span", "badge", have ? "✓" : "needed"), el("span", "mono", label));
    ul.append(li);
  }
}

/* The last few log lines of a tab. */
function renderLog(ul, log) {
  ul.textContent = "";
  for (const x of log.slice(-8)) ul.append(el("li", x.kind, x.msg));
}

/* Marks a numbered step heading as done or waiting (for the ✓ / number badge). */
function stepState(id, state) {
  const h = $(id);
  if (h) h.dataset.state = state;
}

/* One file to download for a SysEx tool: its name, where it can be sent, a status line and a Download button.
 * warn: { title, text, button } for a file that may be flashed in one case only: a warning box, and a warning-coloured
 * button that names the case. own: the user's own file, unchanged: nothing to download, the button stays disabled. */
function downloadRow({ name, where, meta, ready, onDownload, warn, own }) {
  const r = el("div", "step" + (ready ? "" : " off") + (warn ? " step-warn" : ""));
  r.append(el("h4", "mono", name));
  r.append(el("p", "sub", where));
  if (warn) {
    const w = el("p", "warn-box");
    w.append(el("strong", "", warn.title + " "), warn.text);
    r.append(w);
  }
  if (meta) r.append(el("p", "meta", meta));
  const row = el("div", "btns");
  const dl = el("button", warn ? "warn" : "primary", own ? "No download needed: it is your own file" : warn ? warn.button : "Download .syx");
  dl.disabled = !ready || !!own;
  dl.onclick = onDownload;
  row.append(dl);
  r.append(row);
  return r;
}

window.SamplesUI = { $, el, kb, save, dropZone, needList, renderLog, stepState, downloadRow };
})();
