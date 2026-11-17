/* "Install a Cycles OS" tab: puts a modded Model:Cycles OS (Modded-Cycles or a derivative, built for a real Model:Cycles,
 * or already packed for the Model:Samples) on a Model:Samples. The file is packed with the official model-samples_OS1.13.syx
 * by SamplesSanity.forSamples (the same file as Modded-Cycles' mods_for_samples.py), in the transport of the OS the
 * Model:Samples runs now, then sent over USB (usb.js) or downloaded:
 *
 *  - its own Model:Samples OS: smp-os (product 0x0F), also the STARTUP MENU over MIDI IN, whatever OS is installed;
 *  - a Cycles OS with the key fix (Modded-Cycles or a derivative): cyc-os (product 0x11), over USB only.
 *
 * A Cycles OS without the key fix takes neither: back to the Samples OS first ("Back to Samples OS", second way).
 */
(function () {
"use strict";

const S = window.SamplesSanity;
const st = { mode: null, mod: null, smp: null, result: null, error: null, busy: false, log: [] };
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const kb = (n) => (n / 1024).toFixed(0) + " KB";
const hexSha = (raw) => S.hex(S.sha256(raw));
const DEV = { 0x11: "Model:Cycles", 0x0f: "Model:Samples" };

/* "Foo_for-samples_smp-os.syx" / "Foo.syx" → "Foo" */
function baseName(name) {
  return (name || "model-cycles").replace(/\.syx$/i, "").replace(/(_rewrapped)?(_keyfix)?$/i, "")
    .replace(/_(for-samples|model-samples)(_(smp|cyc)-os)?(_pre-fix)?$/i, "").replace(/_(smp|cyc)-os$/i, "");
}

// ---- the file for the chosen OS -------------------------------------------------------------------------------
const STEPS = {
  samples: { id: "smp", key: "smp", suffix: "smp-os", product: 0x0f,
    title: "Send the Cycles OS, packed for the Model:Samples OS (smp-os)",
    sub: "Product 0x0F, the Model:Samples' own transport. The machine answers as a Model:Samples and restarts on the Cycles OS; from then on Transfer shows it as a Model:Cycles. The same file goes through the STARTUP MENU over MIDI IN with a SysEx tool, whatever OS is installed.",
    refused: "" },
  cycles: { id: "cyc", key: "cyc", suffix: "cyc-os", product: 0x11,
    title: "Send the Cycles OS, packed for a Cycles OS with the key fix (cyc-os)",
    sub: "Product 0x11, the transport a Cycles OS listens to. The machine answers as a Model:Cycles and restarts on the new Cycles OS.",
    note: "Over USB only, while the Cycles OS runs. The STARTUP MENU (FUNC + power on) ignores this file: to flash from it with a SysEx tool, pick “Its own Model:Samples OS, or flashing from the STARTUP MENU” in step 1 and use the smp-os file.",
    refused: "If it says “Upgrade Failed”, its Cycles OS has no key fix (or it is a real Model:Cycles), and nothing is written: go back to the Samples OS first (Back to Samples OS tab, second way), or use the STARTUP MENU with the smp-os file." },
};
function steps() {
  if (!st.mode) return [];
  const s = STEPS[st.mode];
  return [Object.assign({}, s, { name: `${baseName(st.mod ? st.mod.name : "")}_for-samples_${s.suffix}.syx` })];
}

// ---- files ------------------------------------------------------------------------------------------------------
async function addFiles(files) {
  for (const f of files) {
    const raw = new Uint8Array(await f.arrayBuffer());
    if (hexSha(raw) === S.REF.samplesSyx) { st.smp = raw; log(`${f.name}: official Model:Samples OS 1.13.`, "ok"); }
    else { st.mod = { name: f.name, raw }; log(`${f.name}: the Cycles OS to install.`); }
  }
  await build();
}

/* From the Check a file tab: the file it just checked. */
function load(name, raw) { st.mod = { name, raw }; return build(); }

async function build() {
  st.result = null; st.error = null;
  if (!st.mod || !st.smp) { render(); return; }
  st.busy = true; render();
  await new Promise((res) => setTimeout(res, 20));          // let "Packing…" paint
  try {
    st.result = S.forSamples(st.mod.raw, st.smp);
    const r = st.result;
    log(r.from === "cycles"
      ? `Packed the ${r.stock ? "stock" : "modded"} Model:Cycles OS 1.13 for the Model:Samples: official Samples container, 32-byte key fix, Samples signature. Checked again: safe.`
      : `${st.mod.name} is already packed for the Model:Samples${r.keyFixAdded ? "; the missing key fix has been added" : ""}. Checked again: safe.`, "ok");
  } catch (e) {
    st.error = e.message || String(e);
    log(`${st.mod.name}: not packed. ${st.error}`, "bad");
  }
  st.busy = false; render();
}

// ---- sending ----------------------------------------------------------------------------------------------------
const usb = window.SamplesUSB ? window.SamplesUSB.panel({ prefix: "in", log: (m, k) => log(m, k), render: () => render() }) : null;

/* Why this step cannot go to the machine that answers (null: it can). */
function devProblem(step) {
  const p = usb.deviceProblem();
  if (p) return p;
  if (usb.dev.product === step.product) return null;
  if (step.product === 0x0f)
    return "It answers as a Model:Cycles: it runs a Cycles OS. With the key fix (installed with Modded-Cycles or a derivative), pick “A Cycles OS with the key fix” in step 1. Without it, its OS refuses both files: go back to the Samples OS first (Back to Samples OS tab), or use the STARTUP MENU.";
  return "It answers as a Model:Samples: it runs its own OS. Pick “Its own Model:Samples OS, or flashing from the STARTUP MENU” in step 1.";
}

function send(step) {
  return usb.send(st.result[step.key], { id: step.id, name: step.name, problem: () => devProblem(step), refusedHint: step.refused });
}

function download(step) {
  const raw = st.result[step.key];
  window.SamplesUSB.save(raw, step.name);
  log(`Saved ${step.name} (${kb(raw.length)}, SHA-256 ${hexSha(raw).slice(0, 16)}…).`, "ok");
}

function checkIt(step) {
  if (!window.SamplesCheck) return;
  location.hash = "#check";
  window.SamplesCheck.show(step.name, st.result[step.key]);
}

// ---- rendering --------------------------------------------------------------------------------------------------
function log(msg, kind) { st.log.push({ msg, kind: kind || "" }); }

function render() {
  for (const m of ["samples", "cycles"]) $("in-mode-" + m).classList.toggle("on", st.mode === m);
  $("in-files").hidden = !st.mode;
  $("in-send").hidden = !st.mode;

  const need = $("in-need");
  need.textContent = "";
  for (const [have, label] of [[st.mod, st.mod ? st.mod.name : "your Cycles OS .syx"], [st.smp, "model-samples_OS1.13.syx"]]) {
    const li = el("li", have ? "have" : "missing");
    li.append(el("span", "badge", have ? "✓" : "needed"), el("span", "mono", label));
    need.append(li);
  }

  const box = $("in-steps");
  box.textContent = "";
  for (const s of steps()) {
    const ready = !!st.result;
    const card = el("div", "step" + (ready ? "" : " off"));
    card.append(el("h4", null, s.title));
    if (s.note) card.append(el("p", "skip", s.note));
    card.append(el("p", "sub", s.sub));
    card.append(el("p", "meta", st.busy ? "Packing and checking…"
      : ready ? `${s.name} · ${kb(st.result[s.key].length)} · goes to a machine that answers as ${DEV[s.product]}`
      : st.error ? "Not packed: see the message below." : "Add both files first."));
    const row = el("div", "btns");
    const p = ready && usb.midi ? devProblem(s) : null;
    const go = el("button", "primary", usb.sending === s.id ? "Sending…" : "Send over USB");
    go.disabled = !ready || !usb.midi || !!p || !!usb.sending;
    go.onclick = () => send(s);
    const dl = el("button", null, "Download .syx");
    dl.disabled = !ready;
    dl.onclick = () => download(s);
    const ck = el("button", null, "Check it");
    ck.title = "Open this file's full report in the Check a file tab";
    ck.disabled = !ready;
    ck.onclick = () => checkIt(s);
    row.append(go, dl, ck);
    if (usb.sending === s.id) { const c = el("button", null, "Cancel"); c.onclick = () => { usb.cancel = true; }; row.append(c); }
    card.append(row);
    if (ready && usb.midi && p) card.append(el("p", "why", p));
    box.append(card);
  }

  usb.renderBar();
  const lg = $("in-log");
  lg.textContent = "";
  for (const x of st.log.slice(-8)) lg.append(el("li", x.kind, x.msg));
}

function init() {
  if (!S || !usb || !$("in-drop")) return;
  usb.init();
  $("in-mode-samples").onclick = () => { st.mode = "samples"; render(); };
  $("in-mode-cycles").onclick = () => { st.mode = "cycles"; render(); };
  const input = $("in-file"), drop = $("in-drop");
  input.addEventListener("change", () => { if (input.files.length) addFiles([...input.files]); input.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  // Deep links (Check a file tab): #install-samples / #install-cycles preselect the OS the machine runs
  const fromHash = () => {
    const m = /^#install-(samples|cycles)$/.exec(location.hash);
    if (m) { st.mode = m[1]; render(); }
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
  render();
}

window.SamplesInstall = { state: st, usb, steps, devProblem, baseName, addFiles, load, init };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
