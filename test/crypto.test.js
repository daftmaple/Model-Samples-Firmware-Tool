// SHA-256 and HMAC-SHA256 (sanity.js carries its own, synchronous): published vectors, then Node's crypto.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const S = require("../sanity.js");

const enc = (s) => new TextEncoder().encode(s);
const sha = (b) => S.hex(S.sha256(b));
const hmac = (k, m) => S.hex(S.hmacSha256(k, m));
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

test("SHA-256: FIPS 180-2 vectors", () => {
  assert.equal(sha(enc("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha(enc("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(sha(new Uint8Array(1000000).fill(0x61)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

test("SHA-256: every length around the 64-byte block and padding boundaries matches Node", () => {
  const buf = crypto.randomBytes(200);
  for (let n = 0; n <= 200; n++) {
    const b = new Uint8Array(buf.subarray(0, n));
    assert.equal(sha(b), crypto.createHash("sha256").update(b).digest("hex"), `length ${n}`);
  }
});

test("HMAC-SHA256: RFC 4231 test cases", () => {
  // 1: short key
  assert.equal(hmac(new Uint8Array(20).fill(0x0b), enc("Hi There")),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  // 2: key shorter than the output
  assert.equal(hmac(enc("Jefe"), enc("what do ya want for nothing?")),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  // 6: key longer than the block size (hashed first)
  assert.equal(hmac(new Uint8Array(131).fill(0xaa), enc("Test Using Larger Than Block-Size Key - Hash Key First")),
    "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
});

test("HMAC-SHA256: 32-byte keys (the firmware key size) match Node", () => {
  for (let i = 0; i < 20; i++) {
    const key = new Uint8Array(crypto.randomBytes(32)), msg = new Uint8Array(crypto.randomBytes(i * 37));
    assert.equal(hmac(key, msg), crypto.createHmac("sha256", key).update(msg).digest("hex"));
  }
});

test("hex() is lower case and zero-padded", () => {
  assert.equal(S.hex(fromHex("000aff10")), "000aff10");
});
