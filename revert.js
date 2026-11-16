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
 * equals Modded-Cycles' references. Sending uses its fast USB method (vendor/modded-cycles/flasher.js: the Elektron
 * Transfer OS-upgrade protocol, after asking the machine who it is).
 */
(function () {
"use strict";

const B = window.MCBuilder, F = window.MCFlasher, S = window.SamplesSanity;
const REF_SAMPLES_ON_CYCLES = "614d28cfe1100856aef7a67aa49003726e27e0e6eb3b6b05ecba6dc177e83911";   // app.js of Modded-Cycles
const REF_SAMPLES_BACK = "d63ce13dd1a5039d11b60d3f69d4e88e9d0f56fb2e7350c105ec641d32083680";
const DEV = { 0x11: "Model:Cycles", 0x0f: "Model:Samples" };

const st = { mode: null, official: { samples: null, cycles: null }, midi: null, dev: null, sending: false, cancel: false, log: [] };
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
      { id: "official", title: "Step 2 (recommended clean-up): the official Model:Samples OS",
        sub: "After step 1 the machine already runs the Model:Samples OS, but its flash still holds the Model:Cycles container (header, meta, a copy of the Cycles bootstrap, Cycles signature). Once it has restarted as a Model:Samples, send the official file, unchanged, so the flash ends exactly as after an Elektron update.",
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

// ---- MIDI ---------------------------------------------------------------------------------------------
function outputs() { return st.midi ? [...st.midi.outputs.values()].filter((p) => p.state !== "disconnected") : []; }
function inputs() { return st.midi ? [...st.midi.inputs.values()].filter((p) => p.state !== "disconnected") : []; }
function inputFor(out) {
  const name = (out.name || "").trim(), ins = inputs();
  return ins.find((i) => (i.name || "").trim() === name)
    || ins.find((i) => i.name && name && (i.name.includes(name) || name.includes(i.name))) || null;
}
function currentOut() { const id = $("rv-port").value; return outputs().find((o) => o.id === id) || null; }

async function connectMidi() {
  if (!window.isSecureContext || !navigator.requestMIDIAccess) {
    log(!navigator.requestMIDIAccess
      ? "This browser has no Web MIDI: use Chrome, Edge or Opera on a computer, or download the file and send it with Elektron Transfer."
      : "Web MIDI needs a secure page: open the hosted version, or serve this folder (python3 -m http.server) instead of opening the file.", "bad");
    render(); return;
  }
  try {
    st.midi = await navigator.requestMIDIAccess({ sysex: true });
    st.midi.onstatechange = () => { fillPorts(); };
    log("MIDI access granted.", "ok");
    fillPorts();
    probe();
  } catch (e) { log("MIDI access refused: " + (e.message || e), "bad"); }
  render();
}

function fillPorts() {
  const sel = $("rv-port"), prev = sel.value;
  sel.textContent = "";
  const outs = outputs();
  if (!outs.length) sel.append(el("option", null, "No MIDI output: connect the Model:Samples by USB"));
  for (const o of outs) { const op = el("option", null, o.name); op.value = o.id; sel.append(op); }
  const pick = outs.find((o) => o.id === prev) || outs.find((o) => /model|elektron/i.test(o.name)) || outs[0];
  if (pick) sel.value = pick.id;
}

async function probe() {
  const out = currentOut();
  st.dev = null;
  if (!out) { render(); return; }
  const inp = inputFor(out);
  if (!inp) { st.dev = { state: "noinput" }; render(); return; }
  st.dev = { state: "probing" }; render();
  let session = null;
  try {
    session = await F.xferOpen(inp, out);
    const info = await F.xferIdentify(session);
    st.dev = Object.assign({ state: "ok" }, info);
    log(`“${out.name}” answers: ${info.device || "Elektron device " + info.id} “${info.name}”, OS ${info.version}.`, "ok");
  } catch (e) {
    st.dev = { state: e.code === "busy" ? "busy" : "none" };
  } finally { if (session) session.close(); }
  render();
}

/* Why this step cannot go to the machine that answers (null: it can). */
function devProblem(step) {
  const d = st.dev;
  if (!d) return "Connect MIDI and pick the Model:Samples' USB port.";
  if (d.state === "probing") return "Asking the machine who it is…";
  if (d.state === "noinput") return "No MIDI input matches this output: pick the Model:Samples' own USB port.";
  if (d.state === "busy") return "Its USB port is in use: close Elektron Transfer, Overbridge and music software, then Refresh.";
  if (d.state !== "ok") return "No answer: is it on, connected by USB, and past its start screen? Then Refresh.";
  if (!d.product) return `This Elektron machine (${d.name}) is not a Model:Samples / Model:Cycles.`;
  if (d.product === step.product) return null;
  if (step.product === 0x11)
    return "It answers as a Model:Samples: it already runs a Samples OS, so there is nothing to bring back. If it runs the Cycles OS with Model-TG, set Device Config › Transfer back to CYC (or restart it), then Refresh.";
  return "It still answers as a Model:Cycles: wait until step 1 has finished and the machine has restarted, then Refresh.";
}

async function send(step) {
  const out = currentOut();
  if (!out || st.sending) return;
  if (step.confirmSamples && !$("rv-is-samples").checked) {
    log("Tick “this is a Model:Samples” first: a real Model:Cycles would also accept this file and switch to the Samples OS.", "bad");
    render(); return;
  }
  let raw;
  try { raw = step.build(); } catch (e) { log(`${step.title}: ${e.message}`, "bad"); render(); return; }
  const inp = inputFor(out);
  st.sending = step.id; st.cancel = false; st.progress = 0; render();
  let session = null;
  try {
    session = await F.xferOpen(inp, out);
    const info = await F.xferIdentify(session);
    st.dev = Object.assign({ state: "ok" }, info);
    const p = devProblem(step);
    if (p) throw new F.XferError("mismatch", p);
    log(`Sending ${step.name} (${kb(raw.length)}) to ${info.device} “${info.name}”, OS ${info.version}…`);
    const res = await F.upgradeFast(session, raw, {
      onProgress: (d, t) => { st.progress = d / t; renderProgress(); },
      isCancelled: () => st.cancel,
    });
    if (res.cancelled) log("Cancelled before the end: nothing is written. Turn the machine off and on.", "warn");
    else log(`Sent in ${Math.round(res.seconds)} s. Confirm on the machine if it asks (YES). It writes the flash and restarts by itself: do not turn it off.`, "ok");
  } catch (e) {
    const why = e.detail ? ` (${e.detail})` : "";
    const msg = { mismatch: e.detail, timeout: "The machine stopped answering. Turn it off and on, then try again.",
      refused: `The machine refused the update${why}. If it says “Upgrade Failed”, its OS does not take this file: try the other way back.`,
      write: `The machine reported an error${why}. Turn it off and on, then try again.`,
      busy: "Its USB port is in use by another program.", gone: "The MIDI port disappeared." }[e.code] || (e.message || String(e));
    log(msg, "bad");
  } finally {
    if (session) session.close();
    st.sending = false; render();
  }
}

function download(step) {
  let raw;
  try { raw = step.build(); } catch (e) { log(`${step.title}: ${e.message}`, "bad"); render(); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([raw], { type: "application/octet-stream" }));
  a.download = step.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  log(`Saved ${step.name} (${kb(raw.length)}, SHA-256 ${hexSha(raw).slice(0, 16)}…).`, "ok");
}

// ---- rendering --------------------------------------------------------------------------------------
function log(msg, kind) { st.log.push({ msg, kind: kind || "" }); }

function renderProgress() {
  const bar = $("rv-progress");
  bar.hidden = !st.sending;
  bar.querySelector("span").style.width = Math.round((st.progress || 0) * 100) + "%";
}

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
    card.append(el("h4", null, s.title), el("p", "sub", s.sub));
    const meta = el("p", "meta");
    meta.textContent = ready ? `${s.name} · goes to a machine that answers as ${DEV[s.product]}` : "Add the official file(s) above first.";
    card.append(meta);
    const row = el("div", "btns");
    const p = ready && st.midi ? devProblem(s) : null;
    const go = el("button", "primary", st.sending === s.id ? "Sending…" : "Send over USB");
    go.disabled = !ready || !st.midi || !!p || !!st.sending;
    go.onclick = () => send(s);
    const dl = el("button", null, "Download .syx");
    dl.disabled = !ready;
    dl.onclick = () => download(s);
    row.append(go, dl);
    if (st.sending === s.id) { const c = el("button", null, "Cancel"); c.onclick = () => { st.cancel = true; }; row.append(c); }
    card.append(row);
    if (ready && st.midi && p) card.append(el("p", "why", p));
    box.append(card);
  }

  $("rv-connect").textContent = st.midi ? "Refresh" : "Connect MIDI";
  $("rv-port").disabled = !st.midi || !!st.sending;
  const d = st.dev;
  $("rv-dev").textContent = !st.midi ? "Not connected." : !d ? "" : d.state === "ok"
    ? `Answers as ${d.device || "Elektron device " + d.id} “${d.name}”, OS ${d.version}.` : d.state === "probing" ? "Asking…" : "No answer.";
  renderProgress();

  const lg = $("rv-log");
  lg.textContent = "";
  for (const x of st.log.slice(-8)) lg.append(el("li", x.kind, x.msg));
}

function init() {
  if (!B || !F || !S) return;
  $("rv-mode-fixed").onclick = () => { st.mode = "fixed"; render(); };
  $("rv-mode-unfixed").onclick = () => { st.mode = "unfixed"; render(); };
  const input = $("rv-file"), drop = $("rv-drop");
  input.addEventListener("change", () => { if (input.files.length) addFiles([...input.files]); input.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  $("rv-connect").onclick = () => (st.midi ? (fillPorts(), probe()) : connectMidi());
  $("rv-port").onchange = () => probe();
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

window.SamplesRevert = { state: st, steps, init };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
