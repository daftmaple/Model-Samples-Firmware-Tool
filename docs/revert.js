/* "Back to Samples OS" tab: brings a Model:Samples running a Model:Cycles OS back to its own OS, the two ways
 * 18nelli18's Modded-Cycles web flasher offers in its Samples OS tab (notes/41 §4, §6, §8):
 *
 *  A. "Model:Samples: back to its OS" (crossflash.py --back-samples / MCBuilder.samplesBack): for a Cycles OS WITH the
 *     32-byte key fix (installed by Modded-Cycles or another Samples build). The official Samples OS, unchanged, in
 *     the Model:Cycles SysEx transport (0x11). One step.
 *  B. "Model:Cycles → Samples OS" (crossflash.py --to cycles / MCBuilder.crossflash): for a Cycles OS WITHOUT the key
 *     fix (elektron-firmware-tool cross-flash, a plain Model:Cycles build). The official Samples MAIN OS in the
 *     official Model:Cycles container, signed with the Cycles key: that OS accepts it, the Samples bootstrap starts the
 *     Samples OS from it. Then the official model-samples_OS1.13.syx over USB restores the exact official state.
 *
 * Files are built with Modded-Cycles' own builder (vendor/modded-cycles/builder.js) and refused unless their SHA-256
 * equals Modded-Cycles' references. Sending: usb.js (Modded-Cycles' fast USB method, after asking the machine who it is).
 */
(function () {
"use strict";

const B = window.MCBuilder, S = window.SamplesSanity;
const REF_SAMPLES_ON_CYCLES = "614d28cfe1100856aef7a67aa49003726e27e0e6eb3b6b05ecba6dc177e83911";   // app.js of Modded-Cycles
const REF_SAMPLES_BACK = "d63ce13dd1a5039d11b60d3f69d4e88e9d0f56fb2e7350c105ec641d32083680";
const DEV = { 0x11: "Model:Cycles", 0x0f: "Model:Samples" };

const st = { mode: null, official: { samples: null, cycles: null }, log: [] };
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const hexSha = (raw) => B.hex(B.sha256(raw));
const kb = (n) => (n / 1024).toFixed(0) + " KB";

// ---- steps for the chosen way back ----------------------------------------------------------------
function steps() {
  const smp = st.official.samples, cyc = st.official.cycles;
  if (st.mode === "fixed") {
    return [{ id: "back", title: "Send the official Model:Samples OS, packed for the Cycles OS",
      sub: "Modded-Cycles “Model:Samples: back to its OS”. The machine answers as a Model:Cycles and restarts as a Model:Samples.",
      needs: ["samples"], product: 0x11, name: "model-samples_OS1.13_back-from-cycles-os.syx",
      build: () => {
        const s = B.unwrap(smp);
        const raw = B.wrap(s.stream, 0x11, s.start_seq);
        if (hexSha(raw) !== REF_SAMPLES_BACK) throw new Error("result is not Modded-Cycles' reference build");
        return raw;
      } }];
  }
  if (st.mode === "unfixed") {
    return [
      { id: "tocyc", title: "Step 1: Model:Cycles → Samples OS",
        sub: "The Samples OS in the Model:Cycles container, signed with the Cycles key: the only thing a Cycles OS without the key fix accepts. The machine answers as a Model:Cycles and restarts as a Model:Samples.",
        needs: ["cycles", "samples"], product: 0x11, name: "model-samples_OS1.13_for-model-cycles.syx", confirmSamples: true,
        build: () => {
          const raw = B.crossflash(cyc, smp).raw;
          if (hexSha(raw) !== REF_SAMPLES_ON_CYCLES) throw new Error("result is not Modded-Cycles' reference build");
          return raw;
        } },
      { id: "official", title: "Step 2 (optional clean-up): the official Model:Samples OS",
        sub: "After step 1 the machine already runs the Model:Samples OS, but its flash still holds the Model:Cycles container (header, meta, a copy of the Cycles bootstrap, Cycles signature). Once it has restarted as a Model:Samples, send the official file, unchanged, so the flash ends exactly as after an Elektron update.",
        skip: "Skip this if you are about to flash a custom smp-os build: it replaces the whole container anyway.",
        needs: ["samples"], product: 0x0f, name: "model-samples_OS1.13.syx", build: () => smp },
    ];
  }
  return [];
}

// ---- official files -------------------------------------------------------------------------------
async function addFiles(files) {
  for (const f of files) {
    const raw = new Uint8Array(await f.arrayBuffer());
    const sha = hexSha(raw);
    if (sha === S.REF.samplesSyx) { st.official.samples = raw; log(`${f.name}: official Model:Samples OS 1.13.`, "ok"); }
    else if (sha === S.REF.cyclesSyx) { st.official.cycles = raw; log(`${f.name}: official Model:Cycles OS 1.13.`, "ok"); }
    else log(`${f.name}: not an official OS 1.13 file from elektron.se (SHA-256 ${sha.slice(0, 16)}…). Ignored.`, "bad");
  }
  render();
}

// ---- sending -----------------------------------------------------------------------------------------
const usb = window.SamplesUSB ? window.SamplesUSB.panel({ prefix: "rv", log: (m, k) => log(m, k), render: () => render() }) : null;

/* Why this step cannot go to the machine that answers (null: it can). */
function devProblem(step) {
  const p = usb.deviceProblem();
  if (p) return p;
  if (usb.dev.product === step.product) return null;
  if (step.product === 0x11)
    return "It answers as a Model:Samples: it already runs a Samples OS, so there is nothing to bring back. If it runs the Cycles OS with Model-TG, set Device Config › Transfer back to CYC (or restart it), then Refresh.";
  return "It still answers as a Model:Cycles: wait until step 1 has finished and the machine has restarted, then Refresh.";
}

function send(step) {
  if (step.confirmSamples && !$("rv-is-samples").checked) {
    log("Tick “this is a Model:Samples” first: a real Model:Cycles would also accept this file and switch to the Samples OS.", "bad");
    render(); return;
  }
  let raw;
  try { raw = step.build(); } catch (e) { log(`${step.title}: ${e.message}`, "bad"); render(); return; }
  return usb.send(raw, { id: step.id, name: step.name, problem: () => devProblem(step),
    refusedHint: "If it says “Upgrade Failed”, its OS does not take this file: try the other way back." });
}

function download(step) {
  let raw;
  try { raw = step.build(); } catch (e) { log(`${step.title}: ${e.message}`, "bad"); render(); return; }
  window.SamplesUSB.save(raw, step.name);
  log(`Saved ${step.name} (${kb(raw.length)}, SHA-256 ${hexSha(raw).slice(0, 16)}…).`, "ok");
}

// ---- rendering --------------------------------------------------------------------------------------
function log(msg, kind) { st.log.push({ msg, kind: kind || "" }); }

function render() {
  for (const m of ["fixed", "unfixed"]) $("rv-mode-" + m).classList.toggle("on", st.mode === m);
  const list = steps();
  const needs = new Set(list.flatMap((s) => s.needs));
  const need = $("rv-need");
  need.textContent = "";
  for (const [k, label] of [["samples", "model-samples_OS1.13.syx"], ["cycles", "model-cycles_OS1.13.syx"]]) {
    if (!needs.has(k) && !st.official[k]) continue;
    const have = !!st.official[k];
    const li = el("li", have ? "have" : "missing");
    li.append(el("span", "badge", have ? "✓" : "needed"), el("span", "mono", label));
    need.append(li);
  }
  $("rv-files").hidden = !st.mode;
  $("rv-confirm").hidden = st.mode !== "unfixed";

  const box = $("rv-steps");
  box.textContent = "";
  $("rv-send").hidden = !st.mode;
  for (const s of list) {
    const ready = s.needs.every((k) => st.official[k]);
    const card = el("div", "step" + (ready ? "" : " off"));
    card.append(el("h4", null, s.title));
    if (s.skip) card.append(el("p", "skip", s.skip));
    card.append(el("p", "sub", s.sub));
    const meta = el("p", "meta");
    meta.textContent = ready ? `${s.name} · goes to a machine that answers as ${DEV[s.product]}` : "Add the official file(s) above first.";
    card.append(meta);
    const row = el("div", "btns");
    const p = ready && usb.midi ? devProblem(s) : null;
    const go = el("button", "primary", usb.sending === s.id ? "Sending…" : "Send over USB");
    go.disabled = !ready || !usb.midi || !!p || !!usb.sending;
    go.onclick = () => send(s);
    const dl = el("button", null, "Download .syx");
    dl.disabled = !ready;
    dl.onclick = () => download(s);
    row.append(go, dl);
    if (usb.sending === s.id) { const c = el("button", null, "Cancel"); c.onclick = () => { usb.cancel = true; }; row.append(c); }
    card.append(row);
    if (ready && usb.midi && p) card.append(el("p", "why", p));
    box.append(card);
  }

  usb.renderBar();

  const lg = $("rv-log");
  lg.textContent = "";
  for (const x of st.log.slice(-8)) lg.append(el("li", x.kind, x.msg));
}

function init() {
  if (!B || !S || !usb) return;
  usb.init();
  $("rv-mode-fixed").onclick = () => { st.mode = "fixed"; render(); };
  $("rv-mode-unfixed").onclick = () => { st.mode = "unfixed"; render(); };
  const input = $("rv-file"), drop = $("rv-drop");
  input.addEventListener("change", () => { if (input.files.length) addFiles([...input.files]); input.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  $("rv-is-samples").onchange = () => render();
  // Deep links from the Check tab: #revert-fixed / #revert-unfixed preselect the way back
  const fromHash = () => {
    const m = /^#revert-(fixed|unfixed)$/.exec(location.hash);
    if (m) { st.mode = m[1]; render(); window.scrollTo(0, 0); }
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
  render();
}

window.SamplesRevert = { state: st, usb, steps, init };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
