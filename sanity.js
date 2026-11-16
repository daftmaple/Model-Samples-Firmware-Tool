/* Model:Samples firmware sanity check — pure logic, no DOM.
 *
 * Checks a .syx meant to install a custom (Cycles-based) OS on an Elektron Model:Samples:
 *   - the SysEx transport is well formed (every packet checksum, sequence, 7-bit bytes);
 *   - the ELE3 container is the official Model:Samples OS 1.13 container: same header, same section table,
 *     and the bootstrap (section 2, holds the STARTUP MENU), updater (section 4) and meta (section 5) are
 *     byte-identical to Elektron's. Only the MAIN OS (section 3) may differ;
 *   - the HMAC signature is valid with the Model:Samples key (derived from the file's own, verified bootstrap);
 *   - the MAIN OS unpacks cleanly and safely in the bootstrap's in-place layout, and the container fits in flash;
 *   - for a Model:Cycles MAIN OS: its update-check code is intact and checks with the Samples key, so the
 *     Model:Samples OS can come back over USB.
 *
 * No Elektron firmware bytes and no key are stored here: only SHA-256 fingerprints of the official
 * model-samples_OS1.13.syx / model-cycles_OS1.13.syx parts.
 *
 * Formats and rules from Modded-Cycles (tools/mtlib, tools/mods_for_samples.py, notes/02, 41, 57) and the
 * bootstrap in-place layout from Supermodel (notes/41 §9). mtlib is MIT (drumkilla), after
 * elektron-firmware-tool by Marcel Bierling (MIT).
 *
 * Works in the browser (window.SamplesSanity) and in Node (module.exports).
 */
(function (root) {
"use strict";

// ===========================================================================
// SHA-256 / HMAC-SHA256 (synchronous, Uint8Array)
// ===========================================================================
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(data) {
  const len = data.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000), false);
  dv.setUint32(total - 4, bits >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => odv.setUint32(4 * i, v, false));
  return out;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

function hmacSha256(key, msg) {
  if (key.length > 64) key = sha256(key);
  const ip = new Uint8Array(64), op = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { const k = key[i] || 0; ip[i] = k ^ 0x36; op[i] = k ^ 0x5c; }
  return sha256(concat(op, sha256(concat(ip, msg))));
}

function hex(b) { let s = ""; for (const x of b) s += x.toString(16).padStart(2, "0"); return s; }
function hx(n, w = 8) { return "0x" + (n >>> 0).toString(16).padStart(w, "0"); }
function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function eq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function fmt(n) { return n.toLocaleString("en-US"); }
function indexOfSub(hay, needle, start) {
  outer: for (let i = start; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

// ===========================================================================
// Reference fingerprints (official OS 1.13 files from elektron.se)
// ===========================================================================
const REF = {
  samplesSyx: "e11859b68deb7e5e3fe86ab32581212093849c4be5d3950add011eac398a2ce8",
  cyclesSyx: "44fe586269631a0ca7da25a3383fc6733c314809505fc3cc52f1e0ed9800640c",
  // first 0x20 bytes of the ELE3 container: magic, product byte, version text, section count
  samplesHeader: "d2fe6d1bf07ca589a5c29a8cc421a46e745089db0a0d0a44f4f622d8ec7c7a30",
  cyclesHeader: "fb4281a3d443d61249bce5deb2a593edbb0bf9e32c9cc81455bca8bd318c34b3",
  // Model:Samples section table, in table order. sha = stored bytes (null = the MAIN OS, free to change)
  samplesSections: [
    { id: 5, name: "meta", attr: 0x00000000, size: 15, sha: "fdb5e0ab55017edde7d3d65f4a22d3413c86ed3ae538ec19472ae1e931e93a98" },
    { id: 2, name: "bootstrap", attr: 0x04000000, size: 15532, sha: "b897e4d5d79121e2213b56865fd48e82f9b53177c975a2a899611b2228cd1bad" },
    { id: 3, name: "MAIN OS", attr: 0x40000400, size: null, sha: null },
    { id: 4, name: "updater", attr: 0x80000400, size: 31752, sha: "8215fd1050970a0d7c1c792fb911832374ca0a551f3ce9e523cb8e64a8810f0e" },
  ],
  firstSectionOff: 0x70,
  cyclesBootstrap: "16a99b5d1a686a4a458c774aa670b08bfdcc04517600c2b6585d642fa9c065f3",
  cyclesMeta: "a6bd80a4233e69fdd5cfad115d3023f5badd97682d183eb96d0f493815e9d768",
  samplesMain: "a351392c62ec1c6c3324a807baf46934690d54edfc76029a4b4882541cad1ab2",
  cyclesMain: "cc99d4f0175d34d1e91d046e6ec85a5e8ab58ab9edbb3c24406acd48cb99ee98",
  // official Cycles MAIN OS with its 32 key-constant bytes (0x401296b2) zeroed
  cyclesMainNoKey: "cbebef87c949b5cd4d194779eb52168fbf35dc4604b5f9852bab7787b93b30b9",
  // Model:Cycles OS 1.13 update verification (notes/41 §2): code and data it depends on
  cyclesCheckRegions: [
    { from: 0x40052750, to: 0x4005282e, what: "HMAC check 0x40052750", sha: "215917ebd44cf5480a0212145ccc3dcad98cb90d97601be463d3ed6a0c73aa12" },
    { from: 0x4005a0e4, to: 0x4005a128, what: "update check 0x4005a0e4", sha: "9fd1e6c78c736616bc2299b865e303d4730ec168e4e8905c6abcb7ea068647c6" },
    { from: 0x40081e26, to: 0x40081e60, what: "content checksum 0x40081e26", sha: "e9ef042eb0671aa5524b6adf5a30c14a2b010db7c431f9a67e70f6eb8082a4c2" },
    { from: 0x40129650, to: 0x4012965c, what: "key string \"REVERB SEND\"", sha: "164621c3d3ca52fcaa36047bb4a3fc03ccd44c58aae624fa857451d1b02dfcf2" },
  ],
  samplesOnCyclesSyx: "614d28cfe1100856aef7a67aa49003726e27e0e6eb3b6b05ecba6dc177e83911",
  known: {
    "e11859b68deb7e5e3fe86ab32581212093849c4be5d3950add011eac398a2ce8": "Official Model:Samples OS 1.13 (elektron.se)",
    "44fe586269631a0ca7da25a3383fc6733c314809505fc3cc52f1e0ed9800640c": "Official Model:Cycles OS 1.13 (elektron.se)",
    "c06c23f31e50fac6ad40cd0f633acd4a7da4f63c929dff563dae887b93105dd4": "Modded-Cycles: stock Cycles OS 1.13 for Model:Samples (crossflash --to samples)",
    "d63ce13dd1a5039d11b60d3f69d4e88e9d0f56fb2e7350c105ec641d32083680": "Modded-Cycles: Model:Samples OS 1.13 return file (crossflash --back-samples)",
    "614d28cfe1100856aef7a67aa49003726e27e0e6eb3b6b05ecba6dc177e83911": "Modded-Cycles: Model:Cycles → Samples OS (crossflash --to cycles)",
  },
};

const MAIN_BASE = 0x40000400;
const BOOT_INPUT = 0x40200000;              // the bootstrap copies the packed section 3 here
const BOOT_GAP = BOOT_INPUT - MAIN_BASE;    // 0x1ffc00
const CONTAINER_MAX = 0x1c0000;             // written at flash 0x20000, must end before 0x1e0000
const CYC_KEY_STR = 0x40129650, CYC_KEY_CONST = 0x401296b2;
const KEY_ANCHOR = Uint8Array.of(0xbe, 0xf9, 0xa3, 0xf7, 0xc6, 0x71, 0x78, 0xf2);

// ===========================================================================
// SysEx transport (mtlib/syx.py)
// ===========================================================================
const ELEKTRON = [0x00, 0x20, 0x3c];
const MSG_LEN = 128, PAYLOAD_OFF = 10, PAYLOAD_END = 126, CS_OFF = 126, BYTES_PER_MSG = 101;
// product id -> [name, device byte (also the packet checksum base)]
const PRODUCTS = { 0x11: ["Model:Cycles", 0x0c], 0x0f: ["Model:Samples", 0x0a] };
const OTHER_PRODUCTS = { 0x05: "Octatrack", 0x06: "Analog Four", 0x07: "Analog Rytm", 0x0a: "Digitakt",
  0x0d: "Digitone", 0x14: "Digitakt II", 0x15: "Digitone II", 0x16: "Syntakt" };

/* Packet checksum (elektron-firmware-tool, notes/02 §2): base = device byte of the start marker,
 * over bytes 7..125: (base + Σ m[7+i] ^ (base+i)) & 0x7f. mtlib's form (bytes 8..125, constants V/C0) is the same
 * whenever byte 7 is 0, but only this one is right for files numbering packets past 16,383 with byte 7. */
function msgChecksum(m, base) {
  let acc = 0;
  for (let i = 0; i < 119; i++) acc += m[7 + i] ^ (base + i);
  return (base + acc) & 0x7f;
}
function u21(b, o) { return (b[o] << 14) | (b[o + 1] << 7) | b[o + 2]; }

function unpack7Into(p, out, pos) {
  for (let i = 0; i < p.length; i += 8) {
    const hi = p[i];
    for (let k = 0; k < 7 && i + 1 + k < p.length; k++) out[pos++] = ((hi << (k + 1)) & 0x80) | p[i + 1 + k];
  }
  return pos;
}

// ===========================================================================
// aPLib variant (mtlib/aplib.py) with the bootstrap's in-place layout check
// ===========================================================================
const SECT_HDR = 8, OFFSET_BIAS = 767, REUSE_GAMMA = 2, FAR_THRESHOLD = 3328;

/* stream = stored section bytes, 8-byte header included. Returns
 * { data, consumed, overlap }: overlap = first output position that would overwrite still-unread input
 * when the bootstrap unpacks from BOOT_INPUT to MAIN_BASE (null if never), consumed = bytes read. */
function depack(stream, gap) {
  if (stream.length < SECT_HDR) throw new Error("section shorter than its 8-byte header");
  let ip = SECT_HDR, tag = 0;
  let out = new Uint8Array(Math.max(1 << 16, stream.length * 3)), n = 0;
  let overlap = null;
  const need = (k) => {
    if (n + k > out.length) { const o2 = new Uint8Array(Math.max(out.length * 2, n + k)); o2.set(out.subarray(0, n)); out = o2; }
  };
  const byte = () => {
    if (ip >= stream.length) throw new Error("stream ends before its end marker");
    return stream[ip++];
  };
  const bit = () => {
    tag <<= 1;
    if ((tag & 0xff) === 0) { const by = byte(); tag = (by << 1) | 1; return (by >> 7) & 1; }
    return (tag >> 8) & 1;
  };
  const gamma = () => {
    let v = 1;
    for (;;) {
      v = (v << 1) + bit();
      if (bit()) return v;
      if (v > 0x02000000) throw new Error("corrupt stream (gamma overflow)");
    }
  };
  const guard = (end) => { if (gap != null && overlap === null && end > gap + ip) overlap = n; };
  let lastOff = 1;
  for (;;) {
    if (bit()) { const v = byte(); guard(n + 1); need(1); out[n++] = v; continue; }
    const g = gamma();
    let off;
    if (g === REUSE_GAMMA) off = lastOff;
    else {
      off = (((g << 8) >>> 0) + byte()) >>> 0;
      if (off === OFFSET_BIAS) break;
      off -= OFFSET_BIAS;
      lastOff = off;
    }
    const sl = 2 * bit() + bit();
    let L = sl ? sl : gamma() + 2;
    if (off > FAR_THRESHOLD) L += 1;
    const cnt = L + 1;
    if (off === 0 || off > n) throw new Error("corrupt stream (match offset before the start of the output)");
    if (n + cnt > 0x4000000) throw new Error("corrupt stream (output beyond 64 MB)");
    guard(n + cnt);
    need(cnt);
    const src = n - off;
    for (let k = 0; k < cnt; k++) out[n + k] = out[src + k];
    n += cnt;
  }
  return { data: out.slice(0, n), consumed: ip, overlap };
}

/* Key material right after the SHA-256 table anchor: string s, NUL, 32-byte constant C.
 * key = sha256(s) ^ sha256(reverse(s)) ^ C. Returns the list of candidate keys. */
function keyCandidates(buf) {
  const keys = [];
  let i = indexOfSub(buf, KEY_ANCHOR, 0);
  while (i >= 0) {
    const s = i + KEY_ANCHOR.length;
    let p = s;
    while (p < buf.length && buf[p] >= 0x20 && buf[p] < 0x7f && p - s < 64) p++;
    if (p > s && p < buf.length && buf[p] === 0 && p + 33 <= buf.length) {
      const text = buf.subarray(s, p);
      keys.push(deriveKey(text, buf.subarray(p + 1, p + 33)));
    }
    i = indexOfSub(buf, KEY_ANCHOR, i + 1);
  }
  return keys;
}
function deriveKey(text, konst) {
  const h = sha256(text), hr = sha256(Uint8Array.from(text).reverse());
  const key = new Uint8Array(32);
  for (let k = 0; k < 32; k++) key[k] = h[k] ^ hr[k] ^ konst[k];
  return key;
}

// ===========================================================================
// The check
// ===========================================================================
/* Status of one check: pass, info, warn, fail (refused / won't boot, recoverable),
 * critical (touches what the recovery path depends on: brick risk). */
const RANK = { pass: 0, info: 0, skip: 0, warn: 1, fail: 2, critical: 3 };

function check(raw, fileName) {
  raw = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const checks = [];
  const add = (group, status, title, detail) => { checks.push({ group, status, title, detail: detail || "" }); return status; };
  const facts = { fileName: fileName || "", size: raw.length, sha256: hex(sha256(raw)) };
  facts.known = REF.known[facts.sha256] || null;
  const result = { checks, facts };
  if (facts.sha256 === REF.samplesOnCyclesSyx) return revertFile(result);

  const G1 = "SysEx transport", G2 = "Container", G3 = "Protected sections (must be Elektron's)",
        G4 = "Signature", G5 = "MAIN OS (section 3)";

  // ---- 1. SysEx messages -------------------------------------------------
  if (raw.length === 0) { add(G1, "fail", "File is empty"); return finish(result); }
  const msgs = [];
  let junk = 0, i = 0, unterminated = false;
  while (i < raw.length) {
    const a = raw.indexOf(0xf0, i);
    if (a < 0) { junk += raw.length - i; break; }
    junk += a - i;
    let b = a + 1;
    while (b < raw.length && raw[b] !== 0xf7 && raw[b] !== 0xf0) b++;
    if (b >= raw.length || raw[b] === 0xf0) { unterminated = true; i = b; if (b >= raw.length) break; continue; }
    msgs.push(raw.subarray(a, b + 1));
    i = b + 1;
  }
  if (unterminated) add(G1, "fail", "A SysEx message is not terminated", "An F0 without its F7: the file is truncated or corrupted.");
  if (msgs.length < 3) { add(G1, "fail", "Not an Elektron OS file", `Only ${msgs.length} SysEx message(s) found.`); return finish(result); }
  facts.messages = msgs.length;

  const head = msgs[0], tail = msgs[msgs.length - 1], data = msgs.slice(1, -1);
  const isElek = (m) => m.length > 4 && m[1] === ELEKTRON[0] && m[2] === ELEKTRON[1] && m[3] === ELEKTRON[2];
  if (!isElek(head) || !isElek(tail)) { add(G1, "fail", "Not an Elektron SysEx file", "Manufacturer id is not 00 20 3C."); return finish(result); }
  const prod = head[4];
  facts.product = prod;
  if (!(prod in PRODUCTS)) {
    const nm = OTHER_PRODUCTS[prod] ? `an ${OTHER_PRODUCTS[prod]}` : `product 0x${prod.toString(16)}`;
    add(G1, "fail", "Not a Model:Samples / Model:Cycles firmware", `This file is for ${nm}.`);
    return finish(result);
  }
  const [prodName, devByte] = PRODUCTS[prod];
  facts.transport = prod === 0x0f ? "samples" : "cycles";
  add(G1, "info", `Transport: ${prodName} (product 0x${prod.toString(16).padStart(2, "0")}, device byte 0x${devByte.toString(16).padStart(2, "0")})`,
    prod === 0x0f
      ? "Accepted by a Model:Samples running its own OS (USB / Elektron Transfer) and by its STARTUP MENU over MIDI IN."
      : "Only a Model:Samples already running a Cycles OS packed for it (Samples key) takes this over USB. Its STARTUP MENU ignores it.");

  const markerOk = (m, kind) => m.length === 16 && m[4] === prod && m[5] === 0x00 && m[6] === 0x7f && m[7] === kind && m[8] === devByte;
  if (!markerOk(head, 0x01) || !markerOk(tail, 0x02))
    add(G1, "fail", "Start / end markers malformed", `Expected F0 00 20 3C ${prod.toString(16)} 00 7F 01|02 ${devByte.toString(16).padStart(2, "0")} … F7.`);
  else if (!eq(head.subarray(9, 15), tail.subarray(9, 15)))
    add(G1, "fail", "Start and end markers disagree", "They should announce the same start sequence and packet count.");
  else add(G1, "pass", "Start and end markers well formed");

  const startSeq = u21(head, 9), count = u21(head, 12);
  facts.startSeq = startSeq;
  if (count !== data.length) add(G1, "fail", "Packet count mismatch", `The start marker announces ${fmt(count)} packets, the file has ${fmt(data.length)}.`);
  else add(G1, "pass", `Packet count matches (${fmt(count)} packets)`);

  let badLen = 0, badHdr = 0, badSeq = 0, badCs = 0, highBit = 0, firstBad = null, seqHigh = 0, firstSeqHigh = null;
  const stream = new Uint8Array(data.length * BYTES_PER_MSG);
  let sp = 0;
  for (let n = 0; n < data.length; n++) {
    const m = data[n];
    const note = (what) => { if (firstBad === null) firstBad = `packet ${n + 1}: ${what}`; };
    if (m.length !== MSG_LEN) { badLen++; note(`length ${m.length}`); continue; }
    for (let k = 1; k < MSG_LEN - 1; k++) if (k !== 8 && (m[k] & 0x80)) { highBit++; note(`byte ${k} ≥ 0x80`); break; }
    if (m[4] !== prod || m[5] !== 0 || m[6] !== 0x7e) { badHdr++; note("header"); }
    const seq = startSeq + n;
    // mtlib writes seq >> 7 in byte 8 unmasked and 0 in byte 7; a 14-bit block (byte 7 = high) is accepted too
    const mt = m[7] === 0 && m[8] === (seq >> 7) && m[9] === (seq & 0x7f);
    const blk = m[7] === (seq >> 14) && m[8] === ((seq >> 7) & 0x7f) && m[9] === (seq & 0x7f);
    if (!mt && !blk) { badSeq++; note(`sequence ${(m[7] << 14) | ((m[8] & 0x7f) << 7) | m[9]}, expected ${seq}`); }
    else if (m[8] & 0x80) { seqHigh++; if (firstSeqHigh === null) firstSeqHigh = n + 1; }
    if (m[CS_OFF] !== msgChecksum(m, devByte)) { badCs++; note("checksum"); }
    sp = unpack7Into(m.subarray(PAYLOAD_OFF, PAYLOAD_END), stream, sp);
  }
  const transportBad = badLen + badHdr + badSeq + badCs + highBit;
  if (transportBad === 0) add(G1, "pass", "Every packet: length, header, sequence and checksum OK");
  else {
    const parts = [];
    if (badCs) parts.push(`${fmt(badCs)} bad checksum(s)`);
    if (badSeq) parts.push(`${fmt(badSeq)} out-of-sequence`);
    if (badLen) parts.push(`${fmt(badLen)} wrong length`);
    if (badHdr) parts.push(`${fmt(badHdr)} bad header`);
    if (highBit) parts.push(`${fmt(highBit)} with a byte ≥ 0x80`);
    add(G1, "fail", "Corrupted packets", `${parts.join(", ")}. First: ${firstBad}. The device would stop on RECEIVING… or refuse it.`);
  }
  facts.seqHigh = seqHigh;
  if (seqHigh) add(G1, "warn", "Packet numbers above 16,383 use a byte ≥ 0x80",
    `${fmt(seqHigh)} packet(s) from #${fmt(firstSeqHigh)} carry their sequence high byte unmasked (mtlib encoding). Sent over USB this has worked on hardware; over a MIDI DIN/TRS cable (STARTUP MENU via MIDI IN) a byte ≥ 0x80 ends the SysEx message and the transfer fails (harmless: power-cycle and retry another way).`);
  if (junk) add(G1, "warn", "Bytes outside SysEx messages", `${fmt(junk)} byte(s) between or after messages (ignored by most senders, but not expected).`);
  if (badLen || unterminated) return finish(result);

  // ---- 2. Container --------------------------------------------------------
  if (sp < 8 + 0x20) { add(G2, "fail", "Decoded stream too short"); return finish(result); }
  const declared = be32(stream, 0);
  if (declared < 0x40 || 8 + declared > sp) {
    add(G2, "fail", "Container length invalid", `Preamble declares ${fmt(declared)} bytes, the stream has ${fmt(sp - 8)}.`);
    return finish(result);
  }
  const blob = stream.subarray(8, 8 + declared);
  facts.containerSize = declared;
  let pad = 0;
  for (let k = 8 + declared; k < sp; k++) if (stream[k]) pad++;
  const slack = sp - 8 - declared;
  if (pad) add(G2, "warn", "Non-zero bytes after the container", `${fmt(pad)} byte(s) of the last packet's padding are not zero.`);
  else if (slack >= BYTES_PER_MSG) add(G2, "warn", "Extra empty packets", `${fmt(slack)} padding bytes after the container (expected under ${BYTES_PER_MSG}).`);

  let cs = 0;
  for (let k = 0; k < (blob.length >> 2); k++) cs = (cs + (((k + 1) ^ be32(blob, 4 * k)) >>> 0)) >>> 0;
  if (cs !== be32(stream, 4)) add(G2, "fail", "Content checksum mismatch", `Preamble ${hx(be32(stream, 4))}, computed ${hx(cs)}. The device refuses the update (error 3).`);
  else add(G2, "pass", "Content checksum OK");

  if (!(blob[0] === 0x45 && blob[1] === 0x4c && blob[2] === 0x45 && blob[3] === 0x33)) {
    add(G2, "fail", "No ELE3 container", "This is not the firmware format of the Model:Samples / Model:Cycles.");
    return finish(result);
  }
  let ver = "";
  for (let k = 8; k < 0x1c && blob[k]; k++) ver += String.fromCharCode(blob[k]);
  facts.containerVersion = ver;
  const hdrSha = hex(sha256(blob.subarray(0, 0x20)));
  let isCyclesContainer = false;
  if (hdrSha === REF.samplesHeader) add(G2, "pass", "Container header = official Model:Samples OS 1.13", `Product byte 0x${blob[7].toString(16)}, version ${ver}.`);
  else if (hdrSha === REF.cyclesHeader) {
    isCyclesContainer = true;
    add(G2, "critical", "This is a Model:Cycles container, not a Model:Samples one",
      "Header, bootstrap and signature are the Model:Cycles'. A Cycles OS for a Model:Samples must be packed in the official Model:Samples container (Modded-Cycles: Mods tab → machine Model:Samples, or tools/mods_for_samples.py).");
  } else add(G2, "critical", "Container header differs from the official Model:Samples OS 1.13",
    `Product byte 0x${blob[7].toString(16)}, version text "${ver}", ${be32(blob, 0x1c)} section(s). Only section 3 may change.`);

  const nsec = be32(blob, 0x1c);
  if (nsec < 1 || nsec > 16) { add(G2, "fail", "Implausible section count", String(nsec)); return finish(result); }
  const secs = [];
  for (let s = 0; s < nsec; s++) {
    const e = 0x20 + 16 * s;
    if (e + 16 > blob.length) { add(G2, "fail", "Section table runs past the container"); return finish(result); }
    secs.push({ index: s, id: be32(blob, e), off: be32(blob, e + 4), size: be32(blob, e + 8), attr: be32(blob, e + 12) });
  }
  facts.sections = secs.map((s) => ({ id: s.id, off: s.off, size: s.size, attr: s.attr }));

  // table shape: same ids, same order, same attributes (attr of section 2 = bootstrap version gate)
  const tableIssues = [];
  let bootAttrChanged = false;
  if (nsec !== REF.samplesSections.length) tableIssues.push(`${nsec} sections instead of ${REF.samplesSections.length}`);
  REF.samplesSections.forEach((r, k) => {
    const s = secs[k];
    if (!s) return;
    if (s.id !== r.id) tableIssues.push(`entry ${k}: section ${s.id}, expected ${r.id} (${r.name})`);
    else if (s.attr !== r.attr) {
      tableIssues.push(`section ${r.id} (${r.name}): load/version field ${hx(s.attr)}, expected ${hx(r.attr)}`);
      if (r.id === 2) bootAttrChanged = true;
    } else if (r.size !== null && s.size !== r.size) tableIssues.push(`section ${r.id} (${r.name}): ${fmt(s.size)} bytes, expected ${fmt(r.size)}`);
  });
  if (tableIssues.length)
    add(G2, "critical", "Section table differs from the official Model:Samples OS",
      tableIssues.join("; ") + "." + (bootAttrChanged ? " A higher bootstrap version makes the device rewrite its bootstrap (STARTUP MENU) at the next start." : ""));
  else add(G2, "pass", "Section table = official (meta, bootstrap, MAIN OS, updater; same load addresses)");

  // layout: in bounds, 16-aligned, ordered, zero gaps, trailer
  const layout = [];
  const byOff = [...secs].sort((a, b) => a.off - b.off);
  let pos = 0x20 + 16 * nsec, end = pos;
  if (byOff.length && byOff[0].off !== REF.firstSectionOff) layout.push(`first section at ${hx(byOff[0].off, 4)}, expected ${hx(REF.firstSectionOff, 4)}`);
  for (const s of byOff) {
    if (s.off % 16) layout.push(`section ${s.id} not 16-byte aligned`);
    if (s.off < pos) layout.push(`section ${s.id} overlaps the previous one`);
    if (s.off + s.size > blob.length) { layout.push(`section ${s.id} runs past the container`); continue; }
    for (let k = pos; k < s.off; k++) if (blob[k]) { layout.push(`non-zero filler before section ${s.id}`); break; }
    pos = s.off + s.size; end = pos;
  }
  const hmacOff = (end + 4 + 15) & ~15;
  if (blob.length !== hmacOff + 32) layout.push(`container is ${fmt(blob.length)} bytes, expected ${fmt(hmacOff + 32)} (sections end + padding + 32-byte signature)`);
  else for (let k = end; k < hmacOff; k++) if (blob[k]) { layout.push("non-zero bytes before the signature"); break; }
  if (layout.length) add(G2, "fail", "Container layout invalid", layout.join("; ") + ".");
  else add(G2, "pass", "Container layout OK (alignment, padding, signature position)");

  if (blob.length > CONTAINER_MAX)
    add(G2, "critical", "Container too large for the flash",
      `${fmt(blob.length)} bytes; written at flash 0x20000 it must end before 0x1e0000 (max ${fmt(CONTAINER_MAX)} bytes). It would overwrite what lies beyond.`);
  else add(G2, "pass", `Fits in flash (${fmt(blob.length)} of ${fmt(CONTAINER_MAX)} bytes, ${(100 * blob.length / CONTAINER_MAX).toFixed(0)}%)`);

  // ---- 3. Protected sections ----------------------------------------------
  const stored = (s) => blob.subarray(s.off, Math.min(blob.length, s.off + s.size));
  const findSec = (id) => secs.find((s) => s.id === id);
  let bootOk = false;
  for (const r of REF.samplesSections) {
    if (r.sha === null) continue;
    const s = findSec(r.id);
    if (!s) { add(G3, "critical", `Section ${r.id} (${r.name}) missing`); continue; }
    const got = hex(sha256(stored(s)));
    if (got === r.sha) {
      if (r.id === 2) bootOk = true;
      add(G3, "pass", `Section ${r.id} ${r.name} = official Model:Samples`,
        r.id === 2 ? "The STARTUP MENU (FUNC + power on, TRIG 4, MIDI IN) stays Elektron's: your recovery path." : "");
    } else {
      let why = "";
      if (r.id === 2 && got === REF.cyclesBootstrap) why = " It is the Model:Cycles bootstrap.";
      if (r.id === 5 && got === REF.cyclesMeta) why = " It is the Model:Cycles meta.";
      add(G3, r.id === 5 ? "fail" : "critical", `Section ${r.id} ${r.name} MODIFIED`,
        (r.id === 2 ? "The bootstrap holds the STARTUP MENU, the only recovery path. Never flash a file that changes it." :
         r.id === 4 ? "The updater is not part of the OS. Only section 3 may change." :
         "Only section 3 may change.") + why);
    }
  }
  const extra = secs.filter((s) => !REF.samplesSections.some((r) => r.id === s.id));
  if (extra.length) add(G3, "critical", "Extra section(s) in the container", extra.map((s) => `id ${s.id}`).join(", "));

  // ---- 4. Signature ---------------------------------------------------------
  const body = blob.subarray(0, blob.length - 32), digest = blob.subarray(blob.length - 32);
  let smpKey = null;
  const boot = findSec(2);
  if (bootOk) {
    try {
      const bplain = depack(stored(boot), null).data;
      for (const k of keyCandidates(bplain)) if (eq(hmacSha256(k, body), digest)) { smpKey = k; break; }
      if (!smpKey) {
        const ks = keyCandidates(bplain);
        smpKey = ks.length ? ks[ks.length - 1] : null;
        add(G4, "fail", "HMAC signature invalid for the Model:Samples key",
          "The device refuses it (\"Upgrade Failed\", error 4): nothing is written. Rebuild the file with the Samples key.");
        facts.samplesKeyFound = !!smpKey;
      } else add(G4, "pass", "HMAC-SHA256 signature valid with the Model:Samples key",
        "Key derived from the file's own official bootstrap (not stored in this page). The Samples' OS and STARTUP MENU will accept it.");
    } catch (e) {
      add(G4, "fail", "Could not read the bootstrap to derive the key", e.message);
    }
  } else if (isCyclesContainer) {
    add(G4, "skip", "Signature not checked against the Samples key", "Not a Model:Samples container.");
  } else add(G4, "skip", "Signature not checked", "The bootstrap is not the official one, so its key cannot be trusted.");

  // ---- 5. MAIN OS -----------------------------------------------------------
  const s3 = findSec(3);
  if (!s3) { add(G5, "fail", "No MAIN OS (section 3)"); return finish(result); }
  const s3b = stored(s3);
  facts.mainPacked = s3b.length;
  let s3len = null;
  if (s3b.length >= 8) {
    const L = be32(s3b, 0), S = be32(s3b, 4);
    // Elektron's own packer leaves a few zero bytes after the stream, outside the declared length
    let sum = 0, tailNz = 0;
    if (L <= s3b.length - 8) {
      for (let k = 8; k < 8 + L; k++) sum = (sum + s3b[k]) >>> 0;
      for (let k = 8 + L; k < s3b.length; k++) if (s3b[k]) tailNz++;
    }
    s3len = L;
    if (L > s3b.length - 8 || S !== sum || tailNz || s3b.length - 8 - L > 15)
      add(G5, "fail", "Section 3 header inconsistent", `Header says ${fmt(L)} bytes / sum ${hx(S)}; stored ${fmt(s3b.length - 8)} bytes, sum of the declared range ${hx(sum)}.`);
    else add(G5, "pass", "Section 3 header (length, byte sum) OK");
  }
  let main = null;
  try {
    const r = depack(s3b, BOOT_GAP);
    main = r.data;
    facts.mainSize = main.length;
    facts.mainEnd = MAIN_BASE + main.length;
    facts.mainSha = hex(sha256(main));
    const tailBytes = (s3len !== null && s3len <= s3b.length - 8 ? 8 + s3len : s3b.length) - r.consumed;
    if (tailBytes > 0) add(G5, tailBytes < 0 ? "fail" : "warn", tailBytes < 0 ? "Compressed stream runs past its declared length" : "Bytes after the compressed stream's end marker", `${fmt(Math.abs(tailBytes))} byte(s).`);
    else add(G5, "pass", `MAIN OS unpacks cleanly (${fmt(main.length)} bytes, ${hx(MAIN_BASE)}–${hx(MAIN_BASE + main.length)})`);
    if (r.overlap !== null)
      add(G5, "fail", "MAIN OS would overwrite its own compressed input while booting",
        `The bootstrap reads section 3 at ${hx(BOOT_INPUT)} and unpacks it in place from ${hx(MAIN_BASE)}; output reaches unread input at ${hx(MAIN_BASE + r.overlap)}. The OS would not start (recover with the STARTUP MENU).`);
    else add(G5, "pass", "Safe for the bootstrap's in-place unpacking",
      main.length > BOOT_GAP
        ? `Larger than ${hx(BOOT_INPUT)} but output never overtakes unread input.`
        : `Ends below ${hx(BOOT_INPUT)}, where the bootstrap stages the compressed stream.`);
  } catch (e) {
    add(G5, "fail", "MAIN OS does not unpack", e.message + ". The OS would not start.");
  }

  if (main) {
    const at = (va, n) => (va - MAIN_BASE + n <= main.length ? main.subarray(va - MAIN_BASE, va - MAIN_BASE + n) : null);
    if (facts.mainSha === REF.samplesMain) {
      facts.os = "samples";
      add(G5, "info", "MAIN OS = official Model:Samples OS 1.13", "Unmodified Samples OS.");
    } else {
      // Is it a Model:Cycles OS 1.13 (stock or modded)? Its update-check code is at fixed addresses.
      const regs = REF.cyclesCheckRegions.map((r) => {
        const b = at(r.from, r.to - r.from);
        return { r, ok: !!b && hex(sha256(b)) === r.sha };
      });
      const nOk = regs.filter((x) => x.ok).length;
      if (nOk === 0) {
        facts.os = "unknown";
        add(G5, "warn", "MAIN OS not recognised as a Model:Cycles or Model:Samples OS 1.13",
          "It may still be fine, but this page cannot check that it keeps an update path over USB. The STARTUP MENU over MIDI IN remains your recovery.");
      } else {
        facts.os = "cycles";
        const z = Uint8Array.from(main);
        z.fill(0, CYC_KEY_CONST - MAIN_BASE, CYC_KEY_CONST - MAIN_BASE + 32);
        const stock = hex(sha256(z)) === REF.cyclesMainNoKey;
        facts.cyclesStock = stock;
        add(G5, "info", stock ? "MAIN OS = stock Model:Cycles OS 1.13 (no mods)" : "MAIN OS = modded Model:Cycles OS 1.13",
          stock ? "Only the 32 key bytes may differ from Elektron's Cycles OS." : `${fmt(main.length)} bytes, SHA-256 ${facts.mainSha.slice(0, 16)}…`);
        if (nOk === regs.length) add(G5, "pass", "OS update-check code intact", "Verification routine, content checksum and key string are unchanged.");
        else add(G5, "warn", "OS update-check code modified",
          "Changed: " + regs.filter((x) => !x.ok).map((x) => x.r.what).join(", ") + ". USB updates from this OS may not work; the STARTUP MENU over MIDI IN still does.");
        const text = at(CYC_KEY_STR, 11), konst = at(CYC_KEY_CONST, 32);
        if (text && konst && smpKey) {
          const k = deriveKey(text, konst);
          if (eq(k, smpKey)) {
            facts.keyfix = true;
            add(G5, "pass", "Installed OS will verify updates with the Model:Samples key",
              "The 32-byte key fix is present: the official Samples OS can come back over USB (Modded-Cycles \"back to its OS\"), and Model:Cycles firmwares are refused.");
          } else {
            facts.keyfix = false;
            add(G5, "warn", "Installed OS will NOT verify updates with the Model:Samples key",
              "The 32-byte key fix (0x401296b2) is missing. The OS boots, but the Model:Samples OS cannot come back over USB, and later USB updates need a Cycles-signed file. Go back through the STARTUP MENU over MIDI IN.");
          }
        } else if (!smpKey) add(G5, "skip", "Update key not checked", "The Samples key is not available (see Signature).");
      }
    }
  }
  return finish(result);
}

/* Where and when the file can be flashed. Rules (Modded-Cycles notes/41 §1–4, notes/57 §2):
 *  - over USB, only the OS that is RUNNING checks the update: it takes only its own transport (Samples OS: product
 *    0x0F; Cycles OS: 0x11) and checks the HMAC with its own key (Samples key, or Cycles key without the key fix);
 *  - the STARTUP MENU (Samples bootstrap) listens on MIDI IN only, takes product 0x0F, checks with the Samples key. */
function routes(f) {
  const smp = f.transport === "samples";
  const R = [];
  R.push({ where: "Model:Samples on its own Model:Samples OS", how: "USB: Elektron Transfer or the web flasher",
    ok: smp ? "yes" : "no",
    why: smp ? "The Samples OS takes the Model:Samples transport and the Samples signature." : "Ignored: the Samples OS only takes the Model:Samples transport (0x0F). Use the smp-os version." });
  R.push({ where: "Model:Samples already on a Cycles OS with the key fix (Modded-Cycles or a Modded-Cycles derivative; Transfer shows it as Model:Cycles)",
    how: "USB: Elektron Transfer or the web flasher", ok: smp ? "no" : "yes",
    why: smp ? "Ignored: a Cycles OS only takes the Model:Cycles transport (0x11). Use the cyc-os version, or the STARTUP MENU." : "The Cycles OS takes the 0x11 transport, and the key fix lets it accept the Samples signature. This is how to change mods later." });
  R.push({ where: "Model:Samples on a Cycles OS WITHOUT the key fix (e.g. an elektron-firmware-tool cross-flash)",
    how: "USB", ok: "no",
    why: smp ? "Ignored: wrong transport for a Cycles OS." : "Refused (\"Upgrade Failed\"): that OS checks with the Model:Cycles key. Nothing is written. Use the STARTUP MENU." });
  R.push({ where: "Model:Samples in any state, from its STARTUP MENU (hold FUNC while powering on, then TRIG 4, OS UPGRADE)",
    how: "MIDI IN through a MIDI interface (TRS or DIN with adapter). USB does not work in this menu.",
    ok: !smp ? "no" : f.seqHigh ? "risky" : "yes",
    why: !smp ? "Ignored: the STARTUP MENU only takes the Model:Samples transport (0x0F). Use the smp-os version."
      : f.seqHigh ? "Transport and signature are right, but packets past #16,383 carry a byte ≥ 0x80 that breaks SysEx on a MIDI cable. Expect the transfer to stall on RECEIVING… (harmless)."
      : "The recovery path: always available, whatever OS is installed. Slow (minutes at MIDI speed)." });
  R.push({ where: "A Model:Cycles (any OS)", how: "—", ok: "no",
    why: smp ? "Do not send it. A real Model:Cycles on its own OS ignores it, but a Model:Cycles running the Samples OS would install it and then refuse Model:Cycles firmwares over USB."
      : "Refused: a Model:Cycles checks with the Cycles key. Nothing is written." });
  return R;
}

function afterwards(f) {
  if (f.os === "samples")
    return { now: "The official Model:Samples OS.", next: "Update over USB with smp-os files (product 0x0F), or through the STARTUP MENU over MIDI IN." };
  if (f.os === "cycles" && f.keyfix)
    return { now: "A Model:Cycles OS that checks updates with the Model:Samples key. Transfer shows the device as Model:Cycles.",
      next: "Change mods over USB with cyc-os files. Go back to the Samples OS over USB with the \"Back to Samples OS\" tab (first way: Model:Samples: back to its OS), or with the official model-samples_OS1.13.syx through the STARTUP MENU over MIDI IN. Before going back, set tracks using added machines back to the original six." };
  if (f.os === "cycles")
    return { now: "A Model:Cycles OS that checks updates with the Model:Cycles key (no key fix).",
      next: "Over USB it only accepts Cycles-signed files, so cyc-os/smp-os Samples files are refused. Go back over USB with the \"Back to Samples OS\" tab (second way: Model:Cycles → Samples OS, then the official Samples OS as a clean-up), or through the STARTUP MENU over MIDI IN with the official model-samples_OS1.13.syx or an smp-os file." };
  return { now: "An OS this page does not recognise.", next: "Its USB update path is unknown. The STARTUP MENU over MIDI IN with the official model-samples_OS1.13.syx is the way back." };
}

/* Modded-Cycles' exact "Model:Cycles → Samples OS" file (crossflash --to cycles, its reference SHA-256): not a custom
 * OS for a Model:Samples, but a way back for one that runs a Cycles OS without the key fix (notes/41 §6, §8). */
function revertFile(result) {
  const G = "Recognised file";
  result.checks.push(
    { group: G, status: "info", title: "Modded-Cycles “Model:Cycles → Samples OS” reference file",
      detail: "The official Model:Samples OS 1.13 inside the official Model:Cycles container, signed with the Cycles key; byte-identical to Modded-Cycles' tested reference build." },
    { group: G, status: "warn", title: "Not a custom OS for the Model:Samples: a way back, for one case only",
      detail: "Use it only on a Model:Samples that runs a Cycles OS WITHOUT the key fix. That OS writes the Cycles container as-is, the Model:Samples bootstrap (never replaced: same version) starts the Samples OS from it, shown in emulation (Modded-Cycles notes/41 §8). Recommended clean-up afterwards: send the official model-samples_OS1.13.syx over USB to restore the official container. The \"Back to Samples OS\" tab does both." });
  result.verdict = "warn";
  const f = result.facts;
  f.transport = "cycles";
  f.routes = [
    { where: "Model:Samples on a Cycles OS WITHOUT the key fix (e.g. an elektron-firmware-tool cross-flash)", how: "USB: the \"Back to Samples OS\" tab, Elektron Transfer or the web flasher", ok: "yes",
      why: "That OS checks with the Model:Cycles key, which signs this file. The machine restarts on the Model:Samples OS." },
    { where: "Model:Samples on a Cycles OS with the key fix", how: "USB", ok: "no", why: "Refused (\"Upgrade Failed\"), nothing written. Use the first way back: Model:Samples: back to its OS." },
    { where: "Model:Samples on its own OS, or from its STARTUP MENU", how: "USB / MIDI IN", ok: "no", why: "Ignored: wrong transport (0x11). Nothing to bring back on the Samples OS; the STARTUP MENU takes the official model-samples_OS1.13.syx." },
    { where: "A real Model:Cycles", how: "USB", ok: "no", why: "Do not send it unless you want it: a Model:Cycles accepts it and switches to the Samples OS (Modded-Cycles' original use of this file)." },
  ];
  f.after = { now: "The official Model:Samples OS, started from a Model:Cycles container (Cycles meta and updater).",
    next: "Recommended clean-up: send the official model-samples_OS1.13.syx over USB (the Samples OS accepts it) so the flash is exactly as after an Elektron update." };
  f.delivery = f.routes[0].where;
  return result;
}

function finish(result) {
  const worst = result.checks.reduce((m, c) => Math.max(m, RANK[c.status]), 0);
  result.verdict = ["safe", "warn", "fail", "critical"][worst];
  const f = result.facts;
  if (result.verdict === "safe" || result.verdict === "warn") {
    f.routes = routes(f);
    f.after = afterwards(f);
    f.delivery = f.routes.filter((r) => r.ok !== "no").map((r) => `${r.where} via ${r.how}${r.ok === "risky" ? " (risky)" : ""}`).join(" | ");
  }
  return result;
}

function report(r) {
  const L = [];
  const V = { safe: "SAFE: only the OS (section 3) differs from Elektron's Model:Samples firmware",
    warn: "FLASHABLE WITH CAVEATS", fail: "DO NOT FLASH: the device would refuse it or not boot",
    critical: "DO NOT FLASH: touches the bootstrap / recovery path (brick risk)" };
  L.push(`Model:Samples firmware sanity check (Beta, still under testing)`);
  L.push(`File: ${r.facts.fileName}  (${fmt(r.facts.size)} bytes)`);
  L.push(`SHA-256: ${r.facts.sha256}`);
  if (r.facts.known) L.push(`Known file: ${r.facts.known}`);
  L.push(`Verdict: ${V[r.verdict]}`);
  if (r.facts.routes) {
    L.push("", "[Where and when it can be flashed]");
    for (const x of r.facts.routes) L.push(`  ${({ yes: "YES", no: "NO", risky: "RISKY" })[x.ok].padEnd(8)} ${x.where}${x.how !== "—" ? "\n           via " + x.how : ""}\n           ${x.why}`);
    L.push(`  After flashing: ${r.facts.after.now}`, `  Next updates / way back: ${r.facts.after.next}`);
  }
  let g = null;
  for (const c of r.checks) {
    if (c.group !== g) { g = c.group; L.push("", `[${g}]`); }
    L.push(`  ${c.status.toUpperCase().padEnd(8)} ${c.title}${c.detail ? "\n           " + c.detail : ""}`);
  }
  return L.join("\n");
}

const API = { check, report, sha256, hmacSha256, hex, REF };
if (typeof module !== "undefined" && module.exports) module.exports = API;
if (typeof window !== "undefined") window.SamplesSanity = API;
})(this);
