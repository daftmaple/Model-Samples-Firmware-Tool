// "Install a Cycles OS": every combination of files, with and without the official model-samples_OS1.13.syx.
//  - forSamples() on every .syx in firmware/: alone, with the official file, with a wrong second file, in every byte form,
//    and every file it produces dropped back in alone (a downloaded smp-os / cyc-os file put back on the drop zone).
//  - The tab itself: every order of up to three drops (one drop each, or all at once), in both step-1 choices, then
//    reset; plus two drops racing with a real timer. The tab runs on cached real forSamples() results, so the hundreds
//    of drop orders stay fast while the API layer above checks the packing itself.
// Needs the .syx files in firmware/ (never committed); tests skip when the official Model:Samples OS is missing.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const S = require("../docs/sanity.js");
const { firmware, firmwareFiles } = require("./helpers.js");
const { loadTab } = require("./dom.js");

const SMP_NAME = "model-samples_OS1.13.syx";
const OFFICIAL = firmware(SMP_NAME);
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
const sha = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
function attempt(fn) { try { return { r: fn() }; } catch (e) { return { e }; } }
const kindOf = (a) => (a.r ? "packed" : a.e.needsSamplesOs ? "cycles" : "refused");

/* Every firmware/ file, run once alone and once with the official file (shared by the tests below). */
let truth = null;
function table() {
  if (truth) return truth;
  truth = new Map();
  for (const name of firmwareFiles()) {
    const raw = firmware(name);
    truth.set(name, { raw, alone: attempt(() => S.forSamples(raw, null)), withSmp: attempt(() => S.forSamples(raw, OFFICIAL)) });
  }
  return truth;
}
const skipNoOfficial = (t) => { if (!OFFICIAL) { t.skip(`firmware/ lacks ${SMP_NAME}`); return true; } return false; };

// ---- forSamples(): every file -------------------------------------------------------------------------------------
test("every file: the official file is needed only for a Model:Cycles build, and never changes the result", (t) => {
  if (skipNoOfficial(t)) return;
  const kinds = {};
  for (const [name, { alone, withSmp }] of table()) {
    const kind = kindOf(alone);
    kinds[name] = kind;
    if (kind === "packed") {
      assert.ok(withSmp.r, `${name}: packs alone, so it must pack with the official file too`);
      assert.equal(alone.r.from, "samples", `${name}: packing alone means it was already packed for the Model:Samples`);
      for (const k of ["smp", "cyc"]) assert.ok(same(alone.r[k], withSmp.r[k]), `${name}: ${k}-os differs with the official file`);
      for (const k of ["from", "stock", "keyFixAdded", "mainSha"]) assert.equal(alone.r[k], withSmp.r[k], `${name}: ${k}`);
    } else if (kind === "cycles") {
      assert.equal(S.check(table().get(name).raw).facts.transport, "cycles", `${name}: only a Model:Cycles file asks for it`);
      if (withSmp.r) assert.equal(withSmp.r.from, "cycles", name);
      else assert.ok(!withSmp.e.needsSamplesOs, `${name}: still asks for the official file when it is given`);
    } else {
      assert.ok(withSmp.e, `${name}: refused alone, so refused with the official file too`);
      assert.equal(withSmp.e.message, alone.e.message, `${name}: the official file changes the reason`);
      assert.ok(!withSmp.e.needsSamplesOs, name);
    }
  }
  // The files whose kind is known by name, when present
  const expect = { "model-cycles_OS1.13.syx": "cycles", "modded-cycles-techno-edition.syx": "cycles",
    [SMP_NAME]: "refused", "Syntakt_OS1.42.syx": "refused" };
  for (const [name, kind] of Object.entries(kinds)) {
    const want = expect[name] || (/for-samples|_model-samples|elektron-firmware-tool/i.test(name) ? "packed" : null);
    if (want) assert.equal(kind, want, name);
  }
  t.diagnostic(Object.entries(kinds).map(([n, k]) => `${k.padEnd(7)} ${n}`).join("\n"));
});

test("the official file in any byte form, or absent in any form", (t) => {
  if (skipNoOfficial(t)) return;
  const tb = table();
  const packed = [...tb.values()].find((x) => x.alone.r), cycles = [...tb.values()].find((x) => x.withSmp.r && x.withSmp.r.from === "cycles");
  if (!packed || !cycles) { t.skip("needs a packed file and a Model:Cycles build in firmware/"); return; }
  const forms = [OFFICIAL, Buffer.from(OFFICIAL), OFFICIAL.slice().buffer, Array.from(OFFICIAL)];
  for (const smp of forms) {
    assert.ok(same(S.forSamples(packed.raw, smp).smp, packed.alone.r.smp));
    assert.ok(same(S.forSamples(cycles.raw, smp).smp, cycles.withSmp.r.smp));
  }
  for (const none of [null, undefined]) {
    assert.ok(same(S.forSamples(packed.raw, none).cyc, packed.alone.r.cyc));
    assert.throws(() => S.forSamples(cycles.raw, none), (e) => e.needsSamplesOs === true);
  }
  assert.ok(same(S.forSamples(packed.raw).smp, packed.alone.r.smp), "second argument left out");
  assert.ok(same(S.forSamples(packed.raw.buffer.slice(packed.raw.byteOffset, packed.raw.byteOffset + packed.raw.length)).smp,
    packed.alone.r.smp), "the Cycles OS as an ArrayBuffer");
});

test("a second file that is not the official one is refused, never ignored", (t) => {
  if (skipNoOfficial(t)) return;
  const tb = table(), names = [...tb.keys()].filter((n) => sha(tb.get(n).raw) !== sha(OFFICIAL));
  const mods = [...tb.values()].filter((x) => x.alone.r || x.withSmp.r);
  if (!mods.length) { t.skip("no packable file"); return; }
  for (const wrong of names)
    for (const m of mods)
      assert.throws(() => S.forSamples(m.raw, tb.get(wrong).raw), /official model-samples_OS1\.13\.syx/, `${wrong} as the Model:Samples file`);
  assert.throws(() => S.forSamples(mods[0].raw, new Uint8Array(0)), /official model-samples_OS1\.13\.syx/, "an empty file");
});

test("round trip: every file the tab makes, dropped back in alone, gives the same two files", (t) => {
  if (skipNoOfficial(t)) return;
  let n = 0;
  for (const [name, { alone, withSmp }] of table()) {
    const r = alone.r || withSmp.r;
    if (!r) continue;
    for (const k of ["smp", "cyc"]) {
      const back = S.forSamples(r[k], null);
      assert.equal(back.from, "samples", `${name} → ${k}-os → back`);
      assert.equal(back.keyFixAdded, false, `${name} → ${k}-os already has the key fix`);
      assert.equal(back.mainSha, r.mainSha, `${name} → ${k}-os: same OS`);
      assert.ok(same(back.smp, r.smp) && same(back.cyc, r.cyc), `${name} → ${k}-os → back: same files`);
      if (r.from === "cycles") {                                      // the official file still in the drop zone
        const withO = S.forSamples(r[k], OFFICIAL);
        assert.ok(same(withO.smp, r.smp) && same(withO.cyc, r.cyc), `${name} → ${k}-os + official`);
      }
      n++;
    }
  }
  if (!n) t.skip("no packable file");
});

// ---- The tab: every drop order --------------------------------------------------------------------------------------
/* forSamples with the real results cached by content, so the tab can be driven through hundreds of drop orders. */
function cachedSanity() {
  const memo = new Map();
  const forSamples = (mod, smp) => {
    const key = sha(mod) + "|" + (smp ? sha(smp) : "");
    if (!memo.has(key)) memo.set(key, attempt(() => S.forSamples(mod, smp)));
    const a = memo.get(key);
    if (a.e) throw a.e;
    return a.r;
  };
  return Object.assign({}, S, { forSamples });
}

/* The cast: the official file and one file of each kind found in firmware/. */
function cast() {
  const tb = table(), pick = (pred) => [...tb.entries()].find(([n, x]) => pred(n, x));
  const named = (n) => tb.has(n) && [n, tb.get(n)];
  const roles = {
    O: [SMP_NAME, { raw: OFFICIAL }],
    C: named("model-cycles_OS1.13.syx") || pick((n, x) => kindOf(x.alone) === "cycles" && x.withSmp.r),
    P: named("modded-cycles-os_2.0_for-samples_smp-os.syx") || pick((n, x) => x.alone.r && S.check(x.raw).facts.transport === "samples"),
    Q: named("modded-cycles-os_2.0_for-samples_cyc-os.syx") || pick((n, x) => x.alone.r && S.check(x.raw).facts.transport === "cycles"),
    E: pick((n, x) => x.alone.r && x.alone.r.keyFixAdded),
    X: pick((n, x) => kindOf(x.alone) === "refused" && n !== SMP_NAME),
  };
  return Object.fromEntries(Object.entries(roles).filter(([, v]) => v).map(([k, [name, x]]) => [k, { name, raw: x.raw, x }]));
}

const file = (name, bytes) => ({ name, arrayBuffer: async () => bytes.slice().buffer });
function* orders(keys, max) {
  function* go(prefix) {
    if (prefix.length) yield prefix;
    if (prefix.length === max) return;
    for (const k of keys) if (!prefix.includes(k)) yield* go([...prefix, k]);
  }
  yield* go([]);
}

/* What the tab must show once the drops in seq are in: depends only on the last Cycles OS and whether O was dropped. */
function expectState(seq, C) {
  const hasO = seq.includes("O"), last = [...seq].reverse().find((k) => k !== "O");
  if (!last) return { hasO, mod: null };
  const m = C[last], a = hasO ? m.x.withSmp : m.x.alone;
  return { hasO, mod: m, kind: kindOf(m.x.alone), a };
}

function checkTab(I, ids, files, seq, want, mode) {
  const st = I.state, label = `${seq.join(" ")} (${mode})`;
  const card = () => ids["in-steps"].byClass("step")[0].textContent;
  const need = ids["in-need"].textContent;
  assert.equal(!!st.smp, want.hasO, `${label}: official file kept`);
  assert.equal(st.busy, false, label);
  if (!want.mod) {
    assert.equal(st.mod, null, label);
    assert.equal(st.result, null, label); assert.equal(st.error, null, label); assert.equal(st.needSmp, null, label);
    assert.match(card(), /Add your Cycles OS/, label);
    assert.match(need, /your Cycles OS \.syx/, label);
    if (want.hasO) assert.doesNotMatch(need, /not needed/, label); else assert.match(need, /not needed for a file already packed/, label);
    return;
  }
  assert.equal(st.mod.name, want.mod.name, `${label}: the last Cycles OS dropped is the one used`);
  const lastLog = st.log[st.log.length - 1] || {};                    // the log keeps earlier drops: look at the last line
  if (want.kind === "refused") {
    assert.equal(st.result, null, label);
    assert.equal(st.error, want.a.e.message, label);
    assert.match(card(), /Not packed/, label);
    assert.equal(lastLog.kind, "bad", `${label}: the refusal is logged`);
    return;
  }
  assert.equal(st.error, null, label);
  assert.equal(st.needSmp, want.kind === "cycles", label);
  if (want.kind === "cycles" && !want.hasO) {
    assert.equal(st.result, null, label);
    assert.notEqual(lastLog.kind, "bad", `${label}: waiting for the official file is not an error`);
    assert.match(lastLog.msg, /the Cycles OS to install/, label);
    assert.match(card(), /Add the official model-samples_OS1\.13\.syx/, label);
    assert.match(need, /needed.*model-samples_OS1\.13\.syx/, label);
    assert.equal(ids["in-need-note"].hidden, true, label);
    return;
  }
  // Packed: the very files the API gives, sent or downloaded
  assert.ok(st.result, label);
  for (const k of ["smp", "cyc"]) assert.ok(same(st.result[k], want.a.r[k]), `${label}: ${k}-os`);
  assert.doesNotMatch(card(), /Add |Not packed/, label);
  const notNeeded = want.kind === "packed" && !want.hasO;
  assert.equal(ids["in-need-note"].hidden, !notNeeded, `${label}: "not needed" note`);
  assert.equal(/model-samples_OS1\.13\.syx/.test(need), !notNeeded, `${label}: official file listed`);
  const key = mode === "samples" ? "smp" : "cyc";
  ids["in-dl"].byClass("step")[0].byClass("btns").at(-1).children[0].onclick();   // the Download button, after any caution box
  const got = files[files.length - 1];
  assert.equal(got.name, `${I.baseName(want.mod.name)}_for-samples_${key}-os.syx`, label);
  assert.ok(same(got.bytes, want.a.r[key]), `${label}: downloaded bytes`);
}

test("the tab: every order of up to three drops, one at a time or all at once, both choices, then reset", async (t) => {
  if (skipNoOfficial(t)) return;
  const C = cast();
  for (const k of ["C", "P", "Q", "X"]) if (!C[k]) { t.skip(`firmware/ lacks a file for role ${k}`); return; }
  const { I, ids, files } = (() => { const x = loadTab("install.js", { SamplesSanity: cachedSanity() }); return Object.assign(x, { I: x.window.SamplesInstall }); })();
  let cases = 0;
  for (const seq of orders(Object.keys(C), 3)) {
    const want = expectState(seq, C);
    for (const together of seq.length > 1 ? [false, true] : [false])
      for (const [first, then] of [["samples", "cycles"], ["cycles", "samples"]]) {
        ids["in-mode-" + first].onclick();
        if (together) await I.addFiles(seq.map((k) => file(C[k].name, C[k].raw)));
        else for (const k of seq) await I.addFiles([file(C[k].name, C[k].raw)]);
        const label = seq.join(" ") + (together ? " [one drop]" : "");
        checkTab(I, ids, files, [label], want, first);
        ids["in-mode-" + then].onclick();                             // the choice in step 1 changes only the file sent
        checkTab(I, ids, files, [label], want, then);
        assert.equal(I.reset(), true);
        assert.deepEqual([I.state.mode, I.state.mod, I.state.smp, I.state.needSmp, I.state.result, I.state.error, I.state.log.length],
          [null, null, null, null, null, null, 0], `${label}: reset leaves nothing behind`);
        cases++;
      }
  }
  t.diagnostic(`${cases} drop orders × 2 choices, roles: ${Object.entries(C).map(([k, v]) => `${k}=${v.name}`).join(", ")}`);
});

test("the tab: the same file twice, or the official file twice, changes nothing", async (t) => {
  if (skipNoOfficial(t)) return;
  const C = cast();
  if (!C.C || !C.P) { t.skip("firmware/ lacks the files"); return; }
  const x = loadTab("install.js", { SamplesSanity: cachedSanity() }), I = x.window.SamplesInstall;
  for (const seq of [["O", "O"], ["P", "P"], ["C", "C"], ["O", "C", "O"], ["P", "O", "P"], ["C", "O", "C"]]) {
    x.ids["in-mode-samples"].onclick();
    for (const k of seq) await I.addFiles([file(C[k].name, C[k].raw)]);
    checkTab(I, x.ids, x.files, seq, expectState(seq, C), "samples");
    I.reset();
  }
});

test("the tab: drops racing on a real timer end on the last file, and a reset drops a build still running", async (t) => {
  if (skipNoOfficial(t)) return;
  const C = cast();
  if (!C.C || !C.P) { t.skip("firmware/ lacks the files"); return; }
  const load = () => {
    const x = loadTab("install.js", { SamplesSanity: cachedSanity() }, { setTimeout: (fn, ms) => setTimeout(fn, ms) });
    x.ids["in-mode-samples"].onclick();
    return Object.assign(x, { I: x.window.SamplesInstall });
  };
  for (const seq of [["C", "O"], ["O", "C"], ["C", "P"], ["P", "C"], ["P", "C", "O"], ["C", "O", "P"]]) {
    const { I, ids, files } = load();
    await Promise.all(seq.map((k) => I.addFiles([file(C[k].name, C[k].raw)])));   // not awaited one by one
    checkTab(I, ids, files, [seq.join(" ") + " [racing]"], expectState(seq, C), "samples");
  }
  const { I } = load();
  const p = I.addFiles([file(C.P.name, C.P.raw)]);
  await new Promise((res) => setImmediate(res));                       // packing has started, behind its 20 ms timer
  I.reset();
  await p;
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(I.state.result, null, "a reset during packing leaves no result behind");
  assert.equal(I.state.mod, null);
});
