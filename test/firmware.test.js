// Verdicts on real firmware files, and tampered copies of the official Model:Samples OS.
// Needs the .syx files in firmware/ (never committed); each test skips when its file is missing.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../docs/sanity.js");
const B = require("../docs/vendor/modded-cycles/builder.js");
const { need, firmware, firmwareFiles, tamper, sections, find, notOk, put32 } = require("./helpers.js");

const SMP = "model-samples_OS1.13.syx", CYC = "model-cycles_OS1.13.syx";
const route = (r, re) => r.facts.routes.find((x) => re.test(x.where));
const STARTUP = /STARTUP MENU \(hold FUNC/;

// ---- Known files ------------------------------------------------------------------------------------------------
test("official Model:Samples OS 1.13: safe, recognised, every route it should have", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(raw, SMP);
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
  assert.equal(r.facts.sha256, S.REF.samplesSyx);
  assert.match(r.facts.known, /Official Model:Samples OS 1\.13/);
  assert.equal(r.facts.os, "samples");
  assert.equal(r.facts.transport, "samples");
  assert.equal(route(r, /on its own Model:Samples OS/).ok, "yes");
  assert.equal(route(r, STARTUP).ok, "yes");
  assert.equal(route(r, /A Model:Cycles/).ok, "no");
});

test("official Model:Cycles OS 1.13: critical (Cycles container and bootstrap)", (t) => {
  const raw = need(t, CYC); if (!raw) return;
  const r = S.check(raw, CYC);
  assert.equal(r.verdict, "critical");
  assert.equal(find(r, /Model:Cycles container/).status, "critical");
  assert.equal(find(r, /Model:Cycles container/).link.href, "#install");
  assert.match(find(r, /Section 2 bootstrap MODIFIED/).detail, /It is the Model:Cycles bootstrap/);
  assert.match(find(r, /Section 5 meta MODIFIED/).detail, /It is the Model:Cycles meta/);
  assert.equal(find(r, /Signature not checked/).status, "skip");
  assert.equal(r.facts.routes, undefined);
});

test("another Elektron OS (Syntakt): fail, named", (t) => {
  const raw = need(t, "Syntakt_OS1.42.syx"); if (!raw) return;
  const r = S.check(raw, "Syntakt_OS1.42.syx");
  assert.equal(r.verdict, "fail");
  assert.match(find(r, /Not a Model:Samples/).detail, /Syntakt/);
});

test("Modded-Cycles cyc-os build: safe, Cycles transport, key fix present", (t) => {
  const raw = need(t, "modded-cycles-os_2.0_for-samples_cyc-os.syx"); if (!raw) return;
  const r = S.check(raw, "cyc-os");
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
  assert.equal(r.facts.transport, "cycles");
  assert.equal(r.facts.os, "cycles");
  assert.equal(r.facts.cyclesStock, false);
  assert.equal(r.facts.keyfix, true);
  assert.equal(route(r, /Cycles OS with the key fix/).ok, "yes");
  assert.equal(route(r, STARTUP).ok, "no", "the STARTUP MENU only takes the Samples transport");
});

test("Modded-Cycles smp-os build: safe, Samples transport, key fix present", (t) => {
  const raw = need(t, "modded-cycles-os_2.0_for-samples_smp-os.syx"); if (!raw) return;
  const r = S.check(raw, "smp-os");
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
  assert.equal(r.facts.transport, "samples");
  assert.equal(r.facts.keyfix, true);
  assert.equal(route(r, STARTUP).ok, "yes");
  assert.match(r.facts.after.next, /Back to Samples OS/);
});

test("elektron-firmware-tool cross-flash: warn, no key fix, links to the second way back", (t) => {
  const raw = need(t, "model-samples_OS1.13-cycles-via-elektron-firmware-tool.syx"); if (!raw) return;
  const r = S.check(raw, "eft.syx");
  assert.equal(r.verdict, "warn");
  assert.equal(r.facts.keyfix, false);
  assert.equal(r.facts.cyclesStock, true);
  const c = find(r, /will NOT verify updates/);
  assert.equal(c.status, "warn");
  assert.equal(c.link.href, "#revert-unfixed");
  assert.match(S.report(r), /→ Back to Samples OS: installed another way/);
});

for (const kind of ["smp-os", "cyc-os"]) {
  test(`Supermodel ${kind} pre-fix file: warn for packet numbering, and rewrap() gives the published re-wrapped file`, (t) => {
    const pre = `Supermodel_Full_2.64_for-samples_${kind}_pre-fix.syx`, fixed = `Supermodel_Full_2.64_for-samples_${kind}_rewrapped.syx`;
    const files = need(t, pre, fixed); if (!files) return;
    const r = S.check(files[0], pre);
    assert.equal(r.verdict, "warn");
    assert.ok(r.facts.seqHigh > 0);
    assert.deepEqual(notOk(r), ["warn: Packet numbers above 16,383 are encoded wrongly (byte ≥ 0x80 inside SysEx)"]);
    if (kind === "smp-os") assert.equal(route(r, STARTUP).ok, "no");

    const out = S.rewrap(files[0]);
    assert.equal(S.hex(S.sha256(out)), S.hex(S.sha256(files[1])), "byte-identical to Supermodel's tools/rewrap_syx.py");
    const r2 = S.check(out, fixed);
    assert.equal(r2.verdict, "safe", notOk(r2).join("; "));
    assert.equal(r2.facts.mainSha, r.facts.mainSha, "same OS");
    if (kind === "smp-os") assert.equal(route(r2, STARTUP).ok, "yes");
  });
}

test("rewrap() leaves the official file byte-identical", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  assert.deepEqual(S.rewrap(raw), raw);
});

test("every file in firmware/ gets a verdict, and safe/warn/one-case ones get routes", () => {
  for (const f of firmwareFiles()) {
    const r = S.check(firmware(f), f);
    assert.ok(["safe", "warn", "onecase", "fail", "critical"].includes(r.verdict), f);
    assert.equal(r.verdict === "onecase", S.hex(S.sha256(firmware(f))) === S.REF.samplesOnCyclesSyx, `${f}: one-case verdict only for the way-back file`);
    assert.equal(!!r.facts.routes, ["safe", "warn", "onecase"].includes(r.verdict), f);
    assert.ok(r.checks.length > 0, f);
  }
});

// ---- The two ways back (vendored Modded-Cycles builder) ----------------------------------------------------------
test("way back A (Model:Samples: back to its OS): reference build, checked safe on the Cycles transport", (t) => {
  const files = need(t, CYC, SMP); if (!files) return;
  const raw = B.samplesBack(files[0], files[1]).raw;
  assert.equal(S.hex(S.sha256(raw)), "d63ce13dd1a5039d11b60d3f69d4e88e9d0f56fb2e7350c105ec641d32083680");
  const r = S.check(raw, "back.syx");
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
  assert.equal(r.facts.transport, "cycles");
  assert.equal(r.facts.os, "samples");
  assert.match(r.facts.known, /return file/);
});

test("way back B (Model:Cycles → Samples OS): reference build, full check, a verdict of its own", (t) => {
  const files = need(t, CYC, SMP); if (!files) return;
  const raw = B.crossflash(files[0], files[1]).raw;
  assert.equal(S.hex(S.sha256(raw)), S.REF.samplesOnCyclesSyx);
  const r = S.check(raw, "tocyc.syx");
  assert.equal(r.verdict, "onecase");
  assert.deepEqual([...new Set(r.checks.map((c) => c.group))], ["Recognised file", "Model:Cycles container (what this file must be)",
    "SysEx transport", "Container", "Protected sections (must be Elektron's)", "Signature", "MAIN OS (section 3)"], "the full check runs too");
  // What the full Model:Samples check flags is kept, marked expected, and nothing else is wrong
  const expected = r.checks.filter((c) => c.status === "expected").map((c) => `${c.was}: ${c.title}`);
  assert.deepEqual(expected, ["critical: This is a Model:Cycles container, not a Model:Samples one",
    "critical: Section table differs from the official Model:Samples OS", "fail: Section 5 meta MODIFIED",
    "critical: Section 2 bootstrap MODIFIED", "skip: Signature not checked against the Samples key"]);
  assert.ok(r.checks.filter((c) => c.status === "expected").every((c) => /Expected here/.test(c.detail) && !c.link));
  assert.deepEqual(r.checks.filter((c) => !["pass", "info", "expected"].includes(c.status)).map((c) => c.title),
    ["One case only: a Model:Samples that runs a Cycles OS WITHOUT the key fix"]);
  assert.ok(r.checks.some((c) => c.title === "MAIN OS = official Model:Samples OS 1.13"));
  assert.deepEqual(r.checks.filter((c) => c.group.startsWith("Model:Cycles container")).map((c) => c.status), ["pass", "pass", "pass", "pass"]);
  assert.match(S.report(r), /Verdict: ONE CASE ONLY/);
  assert.equal(r.facts.routes.filter((x) => x.ok === "yes").length, 1);
  assert.match(r.facts.routes[0].where, /WITHOUT the key fix/);
  const w = r.checks.find((c) => c.status === "warn");
  assert.match(w.title, /One case only.*WITHOUT the key fix/);
  assert.match(w.detail, /refuses it.*ignore it.*real Model:Cycles/);
  assert.equal(w.link.href, "#revert-unfixed", "points to the Back tab's USB send");
  assert.match(S.report(r), /→ Back to Samples OS: send it over USB/);
});

test("only the exact way-back file gets the one-case verdict: one changed byte gets the full check's verdict", (t) => {
  const files = need(t, CYC, SMP); if (!files) return;
  const raw = B.crossflash(files[0], files[1]).raw;
  const off = raw.length - 100;                                          // inside the last packet's payload
  const other = Uint8Array.from(raw); other[off] ^= 1;
  const r = S.check(other, "changed.syx");
  assert.notEqual(r.verdict, "onecase");
  assert.ok(["fail", "critical"].includes(r.verdict), r.verdict);
  assert.ok(!r.checks.some((c) => c.status === "expected"));
});

// ---- Tampered copies of the official Model:Samples OS ------------------------------------------------------------
const sec = (blob, id) => sections(blob).find((s) => s.id === id);

test("tamper: re-wrapping the official container unchanged stays safe (the harness itself is sound)", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, () => {}), "same.syx");
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
});

test("tamper: one byte changed in the bootstrap is critical, and the signature is not trusted", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { b[sec(b, 2).off + 100] ^= 0xff; }), "boot.syx");
  assert.equal(r.verdict, "critical");
  assert.equal(find(r, /Section 2 bootstrap MODIFIED/).status, "critical");
  assert.equal(find(r, /Signature not checked/).status, "skip");
});

test("tamper: a changed updater is critical, a changed meta is a fail", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const up = S.check(tamper(raw, (b) => { b[sec(b, 4).off + 50] ^= 1; }), "upd.syx");
  assert.equal(find(up, /Section 4 updater MODIFIED/).status, "critical");
  assert.equal(up.verdict, "critical");
  const meta = S.check(tamper(raw, (b) => { b[sec(b, 5).off + 2] ^= 1; }), "meta.syx");
  assert.equal(find(meta, /Section 5 meta MODIFIED/).status, "fail");
});

test("tamper: a higher bootstrap version in the section table is critical and explained", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { const s = sec(b, 2); put32(b, s.entry + 12, s.attr + 1); }), "attr.syx");
  assert.equal(r.verdict, "critical");
  assert.match(find(r, /Section table differs/).detail, /rewrite its bootstrap/);
});

test("tamper: a wrong signature is a fail (the device refuses it, nothing written)", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { b[b.length - 1] ^= 1; }), "sig.syx");
  assert.equal(r.verdict, "fail");
  assert.equal(find(r, /HMAC signature invalid/).status, "fail");
});

test("tamper: a changed MAIN OS without re-signing is a fail, never critical", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { b[sec(b, 3).off + 5000] ^= 0x10; }), "os.syx");
  assert.equal(r.verdict, "fail");
  assert.ok(find(r, /HMAC signature invalid/));
  assert.equal(find(r, /Section 2 bootstrap = official/).status, "pass");
});

test("tamper: a stale content checksum is a fail", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { b[b.length - 1] ^= 1; }, { fixChecksum: false }), "cs.syx");
  assert.equal(find(r, /Content checksum mismatch/).status, "fail");
});

test("tamper: an extra section is critical", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(tamper(raw, (b) => { put32(b, 0x1c, 5); }), "extra.syx");
  assert.equal(r.verdict, "critical");
});

test("a truncated official file is refused", (t) => {
  const raw = need(t, SMP); if (!raw) return;
  const r = S.check(raw.subarray(0, raw.length - 1000), "cut.syx");
  assert.equal(r.verdict, "fail");
});

// ---- Adding the missing key fix ----------------------------------------------------------------------------------
const EFT = "model-samples_OS1.13-cycles-via-elektron-firmware-tool.syx";

test("fixKey(): the cross-flash gets the key fix, checks safe, same OS as Modded-Cycles' reference build", (t) => {
  const files = need(t, EFT, CYC, SMP); if (!files) return;
  const [eft, cyc, smp] = files;
  assert.equal(S.check(eft, EFT).facts.canFixKey, true);
  const out = S.fixKey(eft);
  const r = S.check(out, "fixed.syx");
  assert.equal(r.verdict, "safe", notOk(r).join("; "));
  assert.equal(r.facts.keyfix, true);
  assert.equal(r.facts.transport, "samples", "transport kept");
  assert.equal(out.length, eft.length);
  const ref = S.check(B.cyclesForSamples(cyc, smp).raw, "ref.syx");
  assert.equal(r.facts.mainSha, ref.facts.mainSha, "installed OS = Modded-Cycles' stock Cycles OS for Model:Samples");
  assert.equal(route(r, STARTUP).ok, "yes");
  assert.equal(find(S.check(eft, EFT), /will NOT verify/).detail.includes("download the fixed .syx"), true);
});

test("fixKey(): only the 32 key bytes of the MAIN OS change, and sections 2, 4 and 5 stay byte-identical", (t) => {
  const eft = need(t, EFT); if (!eft) return;
  const a = B.parseContainer(B.unwrap(eft).stream), b = B.parseContainer(B.unwrap(S.fixKey(eft)).stream);
  const stored = (c, id) => { const s = c.sections.find((x) => x.id === id); return c.blob.subarray(s.off, s.off + s.size); };
  for (const id of [2, 4, 5]) assert.deepEqual(stored(b, id), stored(a, id), `section ${id}`);
  const m0 = B.aplibDepack(stored(a, 3)).data, m1 = B.aplibDepack(stored(b, 3)).data;
  assert.equal(m1.length, m0.length);
  const diff = [];
  for (let i = 0; i < m0.length; i++) if (m0[i] !== m1[i]) diff.push(i);
  assert.ok(diff.length > 0 && diff.every((i) => i >= 0x401296b2 - 0x40000400 && i < 0x401296b2 - 0x40000400 + 32), "diff inside 0x401296b2..+32");
});

test("fixKey(): refuses files that do not need it or cannot take it", (t) => {
  const files = need(t, SMP, "modded-cycles-os_2.0_for-samples_smp-os.syx", EFT); if (!files) return;
  assert.throws(() => S.fixKey(files[0]), /no missing key fix/);
  assert.throws(() => S.fixKey(files[1]), /no missing key fix/);
  const badSig = tamper(files[2], (b) => { b[b.length - 1] ^= 1; });
  assert.throws(() => S.fixKey(badSig), /no missing key fix|fix the errors/);
});
