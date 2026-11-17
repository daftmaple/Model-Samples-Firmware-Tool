// forSamples(): a modded Model:Cycles .syx + the official Model:Samples OS → the same OS packed for the Model:Samples
// (a file already packed for the Model:Samples needs no official file).
// Real Model:Cycles builds are made here from the _for-samples files (same MAIN OS, key constant set back to the Cycles
// key, official Model:Cycles container, Cycles signature), then compared with Modded-Cycles' own modsForSamples().
// Needs the .syx files in firmware/ (never committed); each test skips when its file is missing.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../docs/sanity.js");
const B = require("../docs/vendor/modded-cycles/builder.js");
const { need, tamper, sections } = require("./helpers.js");

const SMP = "model-samples_OS1.13.syx", CYC = "model-cycles_OS1.13.syx";
const MC2 = "modded-cycles-os_2.0_for-samples_smp-os.syx", MC2_CYC = "modded-cycles-os_2.0_for-samples_cyc-os.syx";
const SM306 = "Supermodel_3.06_for-samples_smp-os.syx", EFT = "model-samples_OS1.13-cycles-via-elektron-firmware-tool.syx";
const KEY_STR = 0x40129650 - B.BASE, KEY_CONST = 0x401296b2 - B.BASE;

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function keyOf(c) {
  const plain = [];
  for (const s of c.sections) try { plain.push(B.aplibDepack(c.blob.subarray(s.off, s.off + s.size)).data); } catch (e) { /* raw */ }
  return B.findKey(plain, c.blob.subarray(0, c.blob.length - 32), c.blob.subarray(c.blob.length - 32));
}
/* A Model:Cycles build of the OS in a (mtlib-encoded) _for-samples file. edit(main, cKey) may change the OS further. */
function cyclesBuild(cycRaw, samplesRaw, edit) {
  const cy = B.unwrap(cycRaw), cc = B.parseContainer(cy.stream), cKey = keyOf(cc);
  const sc = B.parseContainer(B.unwrap(samplesRaw).stream), s3 = sc.sections.find((s) => s.id === 3);
  const { data, ops } = B.aplibDepack(sc.blob.subarray(s3.off, s3.off + s3.size));
  const main = Uint8Array.from(data), dirty = new Uint8Array(main.length);
  const t = main.subarray(KEY_STR, KEY_STR + 11), h = S.sha256(t), hr = S.sha256(Uint8Array.from(t).reverse());
  for (let i = 0; i < 32; i++) { main[KEY_CONST + i] = cKey[i] ^ h[i] ^ hr[i]; dirty[KEY_CONST + i] = 1; }
  if (edit) {
    const before = Uint8Array.from(main);
    edit(main, cKey);
    for (let i = 0; i < main.length; i++) if (main[i] !== before[i]) dirty[i] = 1;
  }
  return B.wrap(B.buildStream(B.rebuildContainer(cc, { 3: B.aplibRepack(main, ops, dirty) }, cKey), 101), 0x11, cy.start_seq);
}
const throwsLike = (fn, re) => assert.throws(fn, (e) => { assert.match(e.message, re); return true; });

// ---- Model:Cycles builds ----------------------------------------------------------------------------------------
test("Modded-Cycles 2.0 built for a Model:Cycles: byte-identical to Modded-Cycles' modsForSamples, both transports", (t) => {
  const f = need(t, CYC, SMP, MC2); if (!f) return;
  const [cyc, smp, mc2] = f;
  const built = cyclesBuild(cyc, mc2);
  assert.equal(S.check(built).verdict, "critical", "a Model:Cycles container is not flashable as is");
  const r = S.forSamples(built, smp);
  assert.equal(r.from, "cycles");
  assert.equal(r.stock, false);
  assert.equal(r.keyFixAdded, true);
  assert.ok(same(r.smp, S.rewrap(B.modsForSamples(built, cyc, smp, "samples").raw)), "smp-os");
  assert.ok(same(r.cyc, S.rewrap(B.modsForSamples(built, cyc, smp, "cycles").raw)), "cyc-os");
  assert.equal(r.mainSha, S.check(mc2).facts.mainSha, "the same OS as Modded-Cycles' own _for-samples build");
  for (const [raw, transport] of [[r.smp, "samples"], [r.cyc, "cycles"]]) {
    const c = S.check(raw);
    assert.equal(c.verdict, "safe");
    assert.equal(c.facts.transport, transport);
    assert.equal(c.facts.keyfix, true);
  }
});

test("stock Model:Cycles OS 1.13: Modded-Cycles' reference “stock Cycles OS for Model:Samples”", (t) => {
  const f = need(t, CYC, SMP); if (!f) return;
  const r = S.forSamples(f[0], f[1]);
  assert.equal(r.stock, true);
  assert.equal(S.hex(S.sha256(r.smp)), "c06c23f31e50fac6ad40cd0f633acd4a7da4f63c929dff563dae887b93105dd4");
  assert.equal(S.check(r.cyc).verdict, "safe");
});

test("an OS past 0x40200000 (Supermodel 3.06): packed and safe under the in-place unpacking rule", (t) => {
  const f = need(t, CYC, SMP, SM306); if (!f) return;
  const r = S.forSamples(cyclesBuild(f[0], f[2]), f[1]);
  const c = S.check(r.smp);
  assert.equal(c.verdict, "safe");
  assert.ok(c.facts.mainEnd > 0x40200000);
  assert.equal(r.mainSha, S.check(f[2]).facts.mainSha);
});

// ---- Files already packed for the Model:Samples ----------------------------------------------------------------
test("a smp-os file: the cyc-os twin is Modded-Cycles' own cyc-os file", (t) => {
  const f = need(t, SMP, MC2, MC2_CYC); if (!f) return;
  const r = S.forSamples(f[1], f[0]);
  assert.equal(r.from, "samples");
  assert.equal(r.keyFixAdded, false);
  assert.ok(same(r.cyc, S.rewrap(f[2])));
  assert.ok(same(r.smp, S.rewrap(f[1])));
});

test("a file already packed for the Model:Samples needs only itself", (t) => {
  const f = need(t, SMP, MC2, MC2_CYC); if (!f) return;
  for (const raw of [f[1], f[2]]) {
    const alone = S.forSamples(raw, null), withSmp = S.forSamples(raw, f[0]);
    assert.equal(alone.from, "samples");
    assert.ok(same(alone.smp, withSmp.smp) && same(alone.cyc, withSmp.cyc), "same files with or without the official one");
  }
  assert.ok(same(S.forSamples(f[2]).smp, S.rewrap(f[1])), "a cyc-os file alone gives back its smp-os twin");
});

test("a Model:Cycles build without the official file asks for it", (t) => {
  const cyc = need(t, CYC); if (!cyc) return;
  let err = null;
  try { S.forSamples(cyc, null); } catch (e) { err = e; }
  assert.ok(err && err.needsSamplesOs, "needsSamplesOs set");
  assert.match(err.message, /needs the official model-samples_OS1\.13\.syx/);
});

test("an elektron-firmware-tool cross-flash: the key fix is added, as fixKey()", (t) => {
  const f = need(t, SMP, EFT); if (!f) return;
  const r = S.forSamples(f[1], f[0]);
  assert.equal(r.keyFixAdded, true);
  assert.equal(r.stock, true);
  assert.equal(r.mainSha, S.check(S.fixKey(f[1])).facts.mainSha);
});

// ---- Refusals ---------------------------------------------------------------------------------------------------
test("wrong files are refused with the reason", (t) => {
  const f = need(t, CYC, SMP); if (!f) return;
  const [cyc, smp] = f;
  throwsLike(() => S.forSamples(cyc, cyc), /official model-samples_OS1\.13\.syx/);
  throwsLike(() => S.forSamples(smp, smp), /official Model:Samples OS, not a Model:Cycles OS/);
  const syn = need(t, "Syntakt_OS1.42.syx"); if (!syn) return;
  throwsLike(() => S.forSamples(syn, smp), /Syntakt/);
});

test("a Model:Cycles build with a changed bootstrap, signature or update path is refused", (t) => {
  const f = need(t, CYC, SMP, MC2); if (!f) return;
  const [cyc, smp, mc2] = f;
  const built = cyclesBuild(cyc, mc2);
  const boot = tamper(built, (b) => { const s = sections(b).find((x) => x.id === 2); b[s.off + 100] ^= 1; });
  throwsLike(() => S.forSamples(boot, smp), /section 2 \(bootstrap\)/);
  const sig = tamper(built, (b) => { b[b.length - 1] ^= 1; });
  throwsLike(() => S.forSamples(sig, smp), /signature does not check/);
  const code = cyclesBuild(cyc, mc2, (m) => { m[0x40052760 - B.BASE] ^= 1; });
  throwsLike(() => S.forSamples(code, smp), /update-check code is modified \(HMAC check/);
  const konst = cyclesBuild(cyc, mc2, (m) => { m[KEY_CONST] ^= 1; });
  throwsLike(() => S.forSamples(konst, smp), /update key is not the Model:Cycles key/);
});
