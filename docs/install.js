/* "Install a Cycles OS" tab: puts a modded Model:Cycles OS (Modded-Cycles or a derivative, built for a real Model:Cycles,
 * or already packed for the Model:Samples) on a Model:Samples. The file is packed with the official model-samples_OS1.13.syx
 * by SamplesSanity.forSamples (the same file as Modded-Cycles' mods_for_samples.py), in the transport of the OS the
 * Model:Samples runs now, then sent over USB (usb.js) or downloaded:
 *
 *  - its own Model:Samples OS: smp-os (product 0x0F), also the STARTUP MENU over MIDI IN, whatever OS is installed;
 *  - a Cycles OS with the key fix (Modded-Cycles or a derivative): cyc-os (product 0x11), over USB only.
 *
 * A Cycles OS without the key fix takes neither: back to the Samples OS first ("Back to Samples OS" tab, second way).
 *
 * Steps: 1. which OS it runs, 2. files, 3. connect and send over USB (the machine's answer is compared with step 1),
 * 4. or download the file for a SysEx tool.
 */
(function () {
"use strict";

const S = window.SamplesSanity, UI = window.SamplesUI;
const { $, el, kb } = UI;
const st = { mode: null, mod: null, smp: null, result: null, error: null, busy: false, log: [] };
let gen = 0;                                               // bumped by reset(): a build still running is dropped
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
    title: "Your mods, for a Model:Samples on its own OS (smp-os)",
    sub: "The machine restarts on the Cycles OS with your mods; from then on Transfer shows it as a Model:Cycles.",
    where: "Send it with a SysEx tool over USB while the Model:Samples OS runs, or from the STARTUP MENU over MIDI IN, whatever OS is installed.",
    refused: "" },
  cycles: { id: "cyc", key: "cyc", suffix: "cyc-os", product: 0x11,
    title: "Your mods, for a Model:Samples already on a Cycles OS (cyc-os)",
    sub: "Replaces the Cycles OS it runs now with this one. The machine restarts on the new Cycles OS.",
    note: "Over USB only, while the Cycles OS runs. The STARTUP MENU ignores this file: for that route, pick “Its own Model:Samples OS” in step 1 and use the smp-os file.",
    where: "Send it with a SysEx tool over USB, while the Cycles OS runs. Not from the STARTUP MENU: it ignores this file (use the smp-os file there).",
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

async function build() {
  st.result = null; st.error = null;
  if (!st.mod || !st.smp) { render(); return; }
  st.busy = true; render();
  const my = gen;
  await new Promise((res) => setTimeout(res, 20));          // let "Packing…" paint
  if (my !== gen) return;
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
  return "It answers as a Model:Samples: it runs its own OS. Pick “Its own Model:Samples OS” in step 1.";
}

function send(step) {
  return usb.send(st.result[step.key], { id: step.id, name: step.name, problem: () => devProblem(step), refusedHint: step.refused });
}

function download(step) {
  const raw = st.result[step.key];
  UI.save(raw, step.name);
  log(`Saved ${step.name} (${kb(raw.length)}, SHA-256 ${hexSha(raw).slice(0, 16)}…).`, "ok");
}

function choose(mode) { st.mode = mode; render(); }

/* What the machine's answer means next to the OS chosen in step 1, under the Connect button. */
function detected() {
  const d = usb.dev;
  if (!d || d.state !== "ok" || !d.product || !st.mode) return "";
  if (d.product === 0x0f)
    return st.mode === "samples" ? "It runs its own Model:Samples OS, as chosen in step 1."
      : "It runs its own Model:Samples OS: pick “Its own Model:Samples OS” in step 1.";
  return st.mode === "cycles"
    ? "It runs a Cycles OS, as chosen in step 1. Installed another way than Modded-Cycles, a derivative or this page (for example an elektron-firmware-tool cross-flash)? Go back to the Samples OS first with the Back to Samples OS tab."
    : "It runs a Cycles OS: with the key fix, pick “A Cycles OS with the key fix” in step 1; without it, go back to the Samples OS first with the Back to Samples OS tab.";
}



// ---- rendering --------------------------------------------------------------------------------------------------
function log(msg, kind) { st.log.push({ msg, kind: kind || "" }); }

function render() {
  for (const m of ["samples", "cycles"]) {
    $("in-mode-" + m).classList.toggle("on", st.mode === m);
    $("in-mode-" + m).setAttribute("aria-pressed", String(st.mode === m));
  }
  $("in-detect").textContent = detected();
  $("in-files").hidden = !st.mode;
  $("in-send").hidden = !st.mode;
  $("in-download").hidden = !st.mode;
  UI.stepState("in-h-mode", st.mode ? "done" : "");
  UI.stepState("in-h-files", st.result ? "done" : "");

  UI.needList($("in-need"), [[st.mod, st.mod ? st.mod.name : "your Cycles OS .syx"], [st.smp, "model-samples_OS1.13.syx"]]);

  const box = $("in-steps"), dls = $("in-dl");
  box.textContent = ""; dls.textContent = "";
  for (const s of steps()) {
    const ready = !!st.result;
    box.append(usb.card(s, {
      ready,
      meta: st.busy ? "Packing and checking…"
        : ready ? `${s.name} · ${kb(st.result[s.key].length)} · goes to a machine that answers as ${DEV[s.product]}`
        : st.error ? "Not packed: see Activity below." : "Add both files in step 2 first.",
      problem: () => devProblem(s),
      send: () => send(s),
      connectHint: "Connect above to send it over USB.",
    }));
    dls.append(UI.downloadRow({ name: s.name, where: s.where, ready, onDownload: () => download(s),
      meta: st.busy ? "Packing and checking…" : ready ? kb(st.result[s.key].length) : "Add both files in step 2 first." }));
  }

  usb.renderBar();
  UI.renderLog($("in-log"), st.log);
}

/* Leaving the tab: forget the files, the choice and the log (not the USB connection). Not while sending. */
function reset() {
  if (usb.sending) return false;
  gen++;
  Object.assign(st, { mode: null, mod: null, smp: null, result: null, error: null, busy: false, log: [] });
  render();
  return true;
}

function init() {
  if (!S || !usb || !$("in-drop")) return;
  usb.init();
  $("in-mode-samples").onclick = () => choose("samples");
  $("in-mode-cycles").onclick = () => choose("cycles");
  UI.dropZone($("in-drop"), $("in-file"), addFiles);
  render();
}

window.SamplesInstall = { state: st, usb, steps, devProblem, baseName, addFiles, init, render, reset };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
