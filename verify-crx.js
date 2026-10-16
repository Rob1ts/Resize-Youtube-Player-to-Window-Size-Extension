/*
 * Independent CRX3 verifier.
 * Re-parses the file from scratch, validates both RSA signatures against the
 * embedded public key, confirms the extension ID derivation, and compares every
 * payload entry to the on-disk source. Deliberately does not reuse the packer's
 * code paths, so a bug in the packer cannot validate itself.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Repo root is wherever this script lives, so no absolute local path is baked
// into the committed source.
const ROOT = __dirname;
const CRX = path.join(ROOT, 'resize_yt_to_window_size.crx');
const SRC = path.join(ROOT, 'Chromium');

const raw = fs.readFileSync(CRX);

// ---- protobuf reader ------------------------------------------------------
function readVarint(b, i) {
  let shift = 0, val = 0;
  for (;;) {
    const c = b[i++]; val |= (c & 0x7f) << shift;
    if (!(c & 0x80)) return [val, i];
    shift += 7;
    if (shift > 63) throw new Error('varint overflow');
  }
}
function parse(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    const [key, j] = readVarint(b, i); i = j;
    const no = key >>> 3, wt = key & 7;
    if (wt === 2) { const [len, k] = readVarint(b, i); i = k; out.push([no, b.subarray(i, i + len)]); i += len; }
    else if (wt === 0) { const [v, k] = readVarint(b, i); i = k; out.push([no, v]); }
    else throw new Error('unexpected wire type ' + wt);
  }
  return out;
}
const fail = [];
const ok = (cond, msg) => { console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${msg}`); if (!cond) fail.push(msg); };

// ---- container -----------------------------------------------------------
console.log('CONTAINER');
ok(raw.subarray(0, 4).toString('ascii') === 'Cr24', "magic == 'Cr24'");
const version = raw.readUInt32LE(4);
ok(version === 3, `version == 3 (got ${version})`);
const hlen = raw.readUInt32LE(8);
const header = raw.subarray(12, 12 + hlen);
const zip = raw.subarray(12 + hlen);
ok(hlen > 0 && 12 + hlen <= raw.length, `header_len=${hlen} fits in file`);

const fields = parse(header);
const proofs = fields.filter(f => f[0] === 2).map(f => f[1]);
const signedData = fields.find(f => f[0] === 10000);
ok(proofs.length >= 1, `sha256_with_rsa proofs present (${proofs.length})`);
ok(!!signedData, 'signed_header_data present (field 10000)');

// ---- proof 1: signature over the ZIP payload -----------------------------
console.log('\nSIGNATURE OVER PAYLOAD (sha256_with_rsa)');
const p1 = parse(proofs[0]);
const spki = Buffer.from(p1.find(f => f[0] === 1)[1]);
const sig1 = Buffer.from(p1.find(f => f[0] === 2)[1]);
const pub = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
ok(crypto.verify('sha256', zip, pub, sig1), 'RSA signature validates against embedded public key');
ok(pub.asymmetricKeyType === 'rsa', `key type is ${pub.asymmetricKeyType}`);
ok(pub.asymmetricKeyDetails && pub.asymmetricKeyDetails.modulusLength === 2048,
   `RSA key size ${pub.asymmetricKeyDetails && pub.asymmetricKeyDetails.modulusLength}`);

// ---- proof 2: CrxId binding ---------------------------------------------
console.log('\nCRXID BINDING (signed_header_data)');
const p2 = parse(signedData[1]);
const pub2 = Buffer.from(p2.find(f => f[0] === 1)[1]);
const sig2 = Buffer.from(p2.find(f => f[0] === 2)[1]);
const pub2key = crypto.createPublicKey({ key: pub2, format: 'der', type: 'spki' });
ok(pub2.equals(spki), 'same public key in both proofs');

const crxId = crypto.createHash('sha256').update(spki).digest().subarray(0, 16);

// Reconstruct the CrxId protobuf the packer must have signed, then check the
// signature against it. This is what binds the key to the extension ID.
function lenField(fieldNo, buf) {
  const v = []; let n = buf.length;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; v.push(b); } while (n);
  const tg = []; let t = (fieldNo << 3) | 2;
  do { let b = t & 0x7f; t >>>= 7; if (t) b |= 0x80; tg.push(b); } while (t);
  return Buffer.concat([Buffer.from(tg), Buffer.from(v), buf]);
}
const crxIdProto = lenField(1, crxId);
ok(crxId.length === 16, 'crx_id is 16 bytes');
ok(crypto.verify('sha256', crxIdProto, pub2key, sig2), 'CrxId signature validates');
const extId = [...crxId].map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
console.log(`  extension ID: ${extId}`);

// ---- payload == source ---------------------------------------------------
console.log('\nPAYLOAD vs Chromium/ SOURCE');
const { execFileSync } = require('child_process');
const tmp = path.join(ROOT, '.verify-payload');
if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
fs.mkdirSync(tmp);
execFileSync('tar.exe', ['-xf', CRX, '-C', tmp], { stdio: 'ignore' });

function walk(d, base = d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, base, acc); else acc.push(path.relative(base, p));
  }
  return acc;
}
const srcFiles = walk(SRC).sort();
const outFiles = walk(tmp).sort();
ok(JSON.stringify(srcFiles) === JSON.stringify(outFiles),
   `same file list (${srcFiles.length} files)`);
let same = true;
for (const f of srcFiles) {
  const a = crypto.createHash('sha256').update(fs.readFileSync(path.join(SRC, f))).digest('hex');
  const b = crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, f))).digest('hex');
  if (a !== b) { same = false; console.log(`    DIFFERS: ${f}`); }
}
ok(same, 'every payload file byte-identical to source');
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (fail.length ? `RESULT: ${fail.length} FAILURE(S)` : 'RESULT: CRX3 fully valid'));
