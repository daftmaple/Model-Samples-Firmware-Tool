/* USB sending shared by the "Install a Cycles OS" and "Back to Samples OS" tabs: Web MIDI access, the port menu, asking
 * the machine who it is, and sending a .syx with Modded-Cycles' fast USB method (vendor/modded-cycles/flasher.js: the
 * Elektron Transfer OS-upgrade protocol). Each tab makes its own panel:
 *
 *   const usb = SamplesUSB.panel({ prefix: "rv", log, render });
 *
 * using the elements <prefix>-connect, -port, -dev and -progress. The tab decides what may be sent where (problem()).
 */
(function () {
"use strict";

const F = window.MCFlasher;
const $ = (id) => document.getElementById(id);
const el = (tag, text) => { const e = document.createElement(tag); if (text != null) e.textContent = text; return e; };

function panel({ prefix, log, render }) {
  const id = (k) => $(`${prefix}-${k}`);
  const u = { midi: null, dev: null, sending: false, cancel: false, progress: 0 };

  const outputs = () => (u.midi ? [...u.midi.outputs.values()].filter((p) => p.state !== "disconnected") : []);
  const inputs = () => (u.midi ? [...u.midi.inputs.values()].filter((p) => p.state !== "disconnected") : []);
  function inputFor(out) {
    const name = (out.name || "").trim(), ins = inputs();
    return ins.find((i) => (i.name || "").trim() === name)
      || ins.find((i) => i.name && name && (i.name.includes(name) || name.includes(i.name))) || null;
  }
  function currentOut() { const v = id("port").value; return outputs().find((o) => o.id === v) || null; }

  async function connect() {
    if (!window.isSecureContext || !navigator.requestMIDIAccess) {
      log(!navigator.requestMIDIAccess
        ? "This browser has no Web MIDI: use Chrome, Edge or Opera on a computer, or download the file and send it with Elektron Transfer."
        : "Web MIDI needs a secure page: open the hosted version, or serve this folder (python3 -m http.server) instead of opening the file.", "bad");
      render(); return;
    }
    try {
      u.midi = await navigator.requestMIDIAccess({ sysex: true });
      u.midi.addEventListener("statechange", () => fillPorts());
      log("MIDI access granted.", "ok");
      fillPorts();
      probe();
    } catch (e) { log("MIDI access refused: " + (e.message || e), "bad"); }
    render();
  }

  function fillPorts() {
    const sel = id("port"), prev = sel.value;
    sel.textContent = "";
    const outs = outputs();
    if (!outs.length) sel.append(el("option", "No MIDI output: connect the Model:Samples by USB"));
    for (const o of outs) { const op = el("option", o.name); op.value = o.id; sel.append(op); }
    const pick = outs.find((o) => o.id === prev) || outs.find((o) => /model|elektron/i.test(o.name)) || outs[0];
    if (pick) sel.value = pick.id;
  }

  async function probe() {
    const out = currentOut();
    u.dev = null;
    if (!out) { render(); return; }
    const inp = inputFor(out);
    if (!inp) { u.dev = { state: "noinput" }; render(); return; }
    u.dev = { state: "probing" }; render();
    let session = null;
    try {
      session = await F.xferOpen(inp, out);
      const info = await F.xferIdentify(session);
      u.dev = Object.assign({ state: "ok" }, info);
      log(`“${out.name}” answers: ${info.device || "Elektron device " + info.id} “${info.name}”, OS ${info.version}.`, "ok");
    } catch (e) {
      u.dev = { state: e.code === "busy" ? "busy" : "none" };
    } finally { if (session) session.close(); }
    render();
  }

  /* Why nothing can be sent to the machine that answers, before looking at what it runs (null: it answers). */
  function deviceProblem() {
    const d = u.dev;
    if (!d) return "Connect MIDI and pick the Model:Samples' USB port.";
    if (d.state === "probing") return "Asking the machine who it is…";
    if (d.state === "noinput") return "No MIDI input matches this output: pick the Model:Samples' own USB port.";
    if (d.state === "busy") return "Its USB port is in use: close Elektron Transfer, Overbridge and music software, then Refresh.";
    if (d.state !== "ok") return "No answer: is it on, connected by USB, and past its start screen? Then Refresh.";
    if (!d.product) return `This Elektron machine (${d.name}) is not a Model:Samples / Model:Cycles.`;
    return null;
  }

  /* Sends raw. problem() runs again on the machine's fresh answer and stops the send if it returns a reason.
   * refusedHint: what to try when the machine refuses the update. */
  async function send(raw, { id: sid, name, problem, refusedHint }) {
    const out = currentOut();
    if (!out || u.sending) return;
    const inp = inputFor(out);
    u.sending = sid; u.cancel = false; u.progress = 0; render();
    let session = null;
    try {
      session = await F.xferOpen(inp, out);
      const info = await F.xferIdentify(session);
      u.dev = Object.assign({ state: "ok" }, info);
      const p = deviceProblem() || problem();
      if (p) throw new F.XferError("mismatch", p);
      log(`Sending ${name} (${(raw.length / 1024).toFixed(0)} KB) to ${info.device} “${info.name}”, OS ${info.version}…`);
      const res = await F.upgradeFast(session, raw, {
        onProgress: (d, t) => { u.progress = d / t; renderProgress(); },
        isCancelled: () => u.cancel,
      });
      if (res.cancelled) log("Cancelled before the end: nothing is written. Turn the machine off and on.", "warn");
      else log(`Sent in ${Math.round(res.seconds)} s. Confirm on the machine if it asks (YES). It writes the flash and restarts by itself: do not turn it off.`, "ok");
    } catch (e) {
      const why = e.detail ? ` (${e.detail})` : "";
      const msg = { mismatch: e.detail, timeout: "The machine stopped answering. Turn it off and on, then try again.",
        refused: `The machine refused the update${why}.` + (refusedHint ? " " + refusedHint : ""),
        write: `The machine reported an error${why}. Turn it off and on, then try again.`,
        busy: "Its USB port is in use by another program.", gone: "The MIDI port disappeared." }[e.code] || (e.message || String(e));
      log(msg, "bad");
    } finally {
      if (session) session.close();
      u.sending = false; render();
    }
  }

  function renderProgress() {
    const bar = id("progress");
    bar.hidden = !u.sending;
    bar.querySelector("span").style.width = Math.round((u.progress || 0) * 100) + "%";
  }

  /* The connect button, port menu, machine line and progress bar. */
  function renderBar() {
    id("connect").textContent = u.midi ? "Refresh" : "Connect MIDI";
    id("port").disabled = !u.midi || !!u.sending;
    const d = u.dev;
    id("dev").textContent = !u.midi ? "Not connected." : !d ? "" : d.state === "ok"
      ? `Answers as ${d.device || "Elektron device " + d.id} “${d.name}”, OS ${d.version}.` : d.state === "probing" ? "Asking…" : "No answer.";
    renderProgress();
  }

  function init() {
    id("connect").onclick = () => (u.midi ? (fillPorts(), probe()) : connect());
    id("port").onchange = () => probe();
  }

  return Object.assign(u, { connect, fillPorts, probe, deviceProblem, send, renderBar, init });
}

/* Download raw as name. */
function save(raw, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([raw], { type: "application/octet-stream" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

window.SamplesUSB = { panel, save };
})();
