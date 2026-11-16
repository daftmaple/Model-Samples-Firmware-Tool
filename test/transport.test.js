// The SysEx transport and container front checks, on synthetic files (no firmware needed).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../sanity.js");
const { syx, stream, find, put32 } = require("./helpers.js");

// A container that is not ELE3: enough to get past the transport into the container checks.
const junkBlob = () => { const b = new Uint8Array(0x60); for (let k = 0; k < b.length; k++) b[k] = (k * 37 + 11) & 0xff; return b; };
const good = (opts) => syx(stream(junkBlob()), opts);

test("empty file: fail", () => {
  const r = S.check(new Uint8Array(0), "empty.syx");
  assert.equal(r.verdict, "fail");
  assert.ok(find(r, /File is empty/));
  assert.equal(r.facts.routes, undefined, "no routes for a file that must not be flashed");
});

test("no SysEx at all: fail, not an Elektron OS file", () => {
  const r = S.check(new TextEncoder().encode("just some text, not a firmware"), "notes.txt");
  assert.equal(r.verdict, "fail");
  assert.match(find(r, /Not an Elektron OS file/).detail, /0 SysEx message/);
});

test("other manufacturer: fail", () => {
  const raw = good();
  for (const at of [1, raw.length - 16 + 1]) raw[at] = 0x41;     // Roland id on the start and end markers
  const r = S.check(raw, "x.syx");
  assert.equal(r.verdict, "fail");
  assert.ok(find(r, /Not an Elektron SysEx file/));
});

test("another Elektron product is named and refused", () => {
  const r = S.check(syx(stream(junkBlob()), { product: 0x0a }), "digitakt.syx");
  assert.equal(r.verdict, "fail");
  assert.match(find(r, /Not a Model:Samples \/ Model:Cycles firmware/).detail, /Digitakt/);
});

test("both transports are recognised", () => {
  const smp = S.check(good({ product: 0x0f }), "a.syx"), cyc = S.check(good({ product: 0x11 }), "b.syx");
  assert.equal(smp.facts.transport, "samples");
  assert.equal(cyc.facts.transport, "cycles");
  assert.match(find(smp, /^Transport/).title, /Model:Samples \(product 0x0f, device byte 0x0a\)/);
  assert.match(find(cyc, /^Transport/).title, /Model:Cycles \(product 0x11, device byte 0x0c\)/);
});

test("a well-formed transport passes its checks and reaches the container checks", () => {
  const r = S.check(good({ start: 300 }), "x.syx");
  for (const re of [/markers well formed/, /Packet count matches/, /Every packet/, /Content checksum OK/])
    assert.equal(find(r, re).status, "pass", re.source);
  assert.equal(find(r, /No ELE3 container/).status, "fail");
  assert.equal(r.facts.startSeq, 300);
});

test("a corrupted packet checksum is caught and located", () => {
  const raw = good();
  raw[16 + 128 + 126] ^= 0x01;                                     // checksum of the 2nd data packet
  const r = S.check(raw, "x.syx");
  assert.equal(r.verdict, "fail");
  assert.match(find(r, /Corrupted packets/).detail, /1 bad checksum.*First: packet 2: checksum/);
});

test("an out-of-sequence packet is caught", () => {
  const raw = good();
  raw[16 + 9] ^= 0x01;                                             // sequence low byte of packet 1
  raw[16 + 126] = 0; { let acc = 0; for (let i = 0; i < 119; i++) acc += raw[16 + 7 + i] ^ (0x0a + i); raw[16 + 126] = (0x0a + acc) & 0x7f; }
  const r = S.check(raw, "x.syx");
  assert.match(find(r, /Corrupted packets/).detail, /out-of-sequence/);
});

test("packet count announced by the start marker must match", () => {
  const raw = good();
  for (const m of [0, raw.length - 16]) raw[m + 14] += 1;          // announce one more packet in both markers
  const r = S.check(raw, "x.syx");
  assert.match(find(r, /Packet count mismatch/).detail, /announces 3 packets, the file has 2/);
});

test("start and end markers that disagree are refused", () => {
  const raw = good();
  raw[raw.length - 16 + 11] ^= 0x01;
  assert.ok(find(S.check(raw, "x.syx"), /Start and end markers disagree/));
});

test("a truncated file (F0 without F7) is refused", () => {
  const raw = good();
  const r = S.check(raw.subarray(0, raw.length - 40), "x.syx");
  assert.equal(r.verdict, "fail");
  assert.ok(find(r, /not terminated/));
});

test("bytes outside SysEx messages give a warning", () => {
  const raw = good();
  const withJunk = new Uint8Array(raw.length + 3);
  withJunk.set(raw); withJunk.set([0x0d, 0x0a, 0x00], raw.length);
  assert.match(find(S.check(withJunk, "x.syx"), /Bytes outside SysEx/).detail, /^3 byte/);
});

test("content checksum mismatch: fail", () => {
  const s = stream(junkBlob());
  put32(s, 4, 0x12345678);
  const r = S.check(syx(s), "x.syx");
  assert.match(find(r, /Content checksum mismatch/).detail, /Preamble 0x12345678/);
});

test("a container length past the stream is refused", () => {
  const s = stream(junkBlob());
  put32(s, 0, 0x10000);
  assert.ok(find(S.check(syx(s), "x.syx"), /Container length invalid/));
});

test("packet numbers past 16,383 in the old (mtlib) encoding: warning, and rewrap() fixes them", () => {
  const big = new Uint8Array(101 * 12);
  big.set(stream(junkBlob()).subarray(0, 101));
  const old = syx(big, { start: 16380, style: "mtlib" });
  const r = S.check(old, "old.syx");
  assert.equal(find(r, /Every packet/).status, "pass", "old encoding is still a valid transport");
  assert.equal(r.facts.seqHigh, 8, "packets 16,384 to 16,391");
  assert.ok(find(r, /Packet numbers above 16,383/));

  const fixed = S.rewrap(old);
  assert.ok(fixed.every((b) => b < 0x80 || b === 0xf0 || b === 0xf7), "no byte ≥ 0x80 inside SysEx");
  assert.deepEqual(fixed, syx(big, { start: 16380 }), "same bytes as a 21-bit writer");
  const r2 = S.check(fixed, "fixed.syx");
  assert.equal(r2.facts.seqHigh, 0);
  assert.equal(find(r2, /Packet numbers above/), undefined);
});

test("rewrap() leaves a file with low packet numbers byte-identical", () => {
  const raw = good({ start: 242 });
  assert.deepEqual(S.rewrap(raw), raw);
});

test("rewrap() refuses what it cannot re-wrap faithfully", () => {
  assert.throws(() => S.rewrap(syx(stream(junkBlob()), { product: 0x0a })), /not a Model:Samples/);
  const bad = good(); bad[16 + 126] ^= 1;
  assert.throws(() => S.rewrap(bad), /corrupted packet/);
});

test("report(): verdict line and one header per group", () => {
  const r = S.check(good(), "x.syx");
  const txt = S.report(r);
  assert.match(txt, /^Model:Samples firmware sanity check/);
  assert.match(txt, /File: x\.syx {2}\(/);
  assert.match(txt, /Verdict: DO NOT FLASH: the device would refuse it/);
  assert.match(txt, /\n\[SysEx transport\]\n/);
  assert.match(txt, /\n\[Container\]\n {2}PASS {5}Content checksum OK\n {2}FAIL {5}No ELE3 container/);
});
