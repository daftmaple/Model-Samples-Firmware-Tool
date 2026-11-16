// Shared helpers for the tests (node --test). No dependencies.
"use strict";
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const FIRMWARE = path.join(ROOT, "firmware");

/* Firmware files are never committed (Elektron's copyright). Tests that need one skip when it is missing:
 * put the files in firmware/ to run them. */
function firmware(name) {
  const p = path.join(FIRMWARE, name);
  return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
}
function firmwareFiles() {
  return fs.existsSync(FIRMWARE) ? fs.readdirSync(FIRMWARE).filter((f) => /\.syx$/i.test(f)).sort() : [];
}
/* Returns the files' bytes, or calls t.skip() and returns null when one is missing. */
function need(t, ...names) {
  const out = names.map(firmware);
  const missing = names.filter((_, k) => !out[k]);
  if (missing.length) { t.skip(`firmware/ lacks ${missing.join(", ")}`); return null; }
  return out.length === 1 ? out[0] : out;
}

// ---- An independent SysEx writer (Elektron OS transport), so tests do not rely on the code under test ----------
const DEV = { 0x0f: 0x0a, 0x11: 0x0c, 0x0a: 0x08 };
const p21 = (v) => [(v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f];
function pack7(b) {
  const out = [];
  for (let i = 0; i < b.length; i += 7) {
    const n = Math.min(7, b.length - i);
    let hi = 0;
    for (let k = 0; k < n; k++) hi |= (b[i + k] >> 7) << (6 - k);
    out.push(hi);
    for (let k = 0; k < n; k++) out.push(b[i + k] & 0x7f);
  }
  return out;
}
function checksum(m, base) {
  let acc = 0;
  for (let i = 0; i < 119; i++) acc += m[7 + i] ^ (base + i);
  return (base + acc) & 0x7f;
}
/* stream: decoded bytes, a multiple of 101. style "21bit" (current) or "mtlib" (byte 8 = seq >> 7 unmasked). */
function syx(stream, { product = 0x0f, start = 0, style = "21bit", dev = DEV[product] } = {}) {
  if (stream.length % 101) throw new Error("stream must be a multiple of 101 bytes");
  const count = stream.length / 101, pre = [0xf0, 0x00, 0x20, 0x3c, product, 0x00];
  const parts = [[...pre, 0x7f, 0x01, dev, ...p21(start), ...p21(count), 0xf7]];
  for (let n = 0; n < count; n++) {
    const seq = start + n, m = new Uint8Array(128);
    m.set([...pre, 0x7e, ...(style === "mtlib" ? [0, seq >> 7, seq & 0x7f] : p21(seq))]);
    m.set(pack7(stream.subarray(n * 101, (n + 1) * 101)), 10);
    m[127] = 0xf7;
    m[126] = checksum(m, dev);
    parts.push([...m]);
  }
  parts.push([...pre, 0x7f, 0x02, dev, ...p21(start), ...p21(count), 0xf7]);
  return Uint8Array.from(parts.flat());
}

// ---- Container helpers ---------------------------------------------------------------------------------------
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const put32 = (b, o, v) => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };
function contentChecksum(blob) {
  let cs = 0;
  for (let k = 0; k < (blob.length >> 2); k++) cs = (cs + (((k + 1) ^ be32(blob, 4 * k)) >>> 0)) >>> 0;
  return cs;
}
/* A decoded stream: 8-byte preamble (length, content checksum) + container, zero-padded to whole packets. */
function stream(blob, { fixChecksum = true } = {}) {
  const s = new Uint8Array(Math.ceil((8 + blob.length) / 101) * 101);
  put32(s, 0, blob.length);
  put32(s, 4, fixChecksum ? contentChecksum(blob) : 0);
  s.set(blob, 8);
  return s;
}
/* Section table entries of a container: { id, off, size, attr, entry } (entry = offset of the table row). */
function sections(blob) {
  const n = be32(blob, 0x1c), out = [];
  for (let s = 0; s < n; s++) {
    const e = 0x20 + 16 * s;
    out.push({ id: be32(blob, e), off: be32(blob, e + 4), size: be32(blob, e + 8), attr: be32(blob, e + 12), entry: e });
  }
  return out;
}
/* Decode raw with the vendored builder, let edit(blob) change the container in place, then re-wrap it with the
 * same product and start sequence. The content checksum is recomputed unless fixChecksum is false. */
function tamper(raw, edit, { fixChecksum = true } = {}) {
  const B = require("../vendor/modded-cycles/builder.js");
  const u = B.unwrap(raw);
  const blob = Uint8Array.from(u.stream.subarray(8, 8 + be32(u.stream, 0)));
  edit(blob);
  const s = stream(blob, { fixChecksum: true });
  if (!fixChecksum) put32(s, 4, be32(u.stream, 4));
  return syx(s, { product: u.product, start: u.start_seq });
}

// ---- Result helpers --------------------------------------------------------------------------------------------
const find = (r, re) => r.checks.find((c) => re.test(c.title));
const notOk = (r) => r.checks.filter((c) => !["pass", "info"].includes(c.status)).map((c) => `${c.status}: ${c.title}`);

module.exports = { ROOT, firmware, firmwareFiles, need, syx, stream, sections, tamper, contentChecksum, be32, put32, find, notOk };
