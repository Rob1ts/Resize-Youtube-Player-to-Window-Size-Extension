/*
 * Pack Chromium/ into a signed CRX3 package (no Chrome required).
 *
 * CRX3 layout:
 *   "Cr24" | version u32LE (3) | header_len u32LE | CrxFileHeader protobuf | ZIP
 *
 * CrxFileHeader (protobuf):
 *   repeated AsymmetricKeyProof sha256_with_rsa = 2;   // proof over the ZIP
 *   bytes                        signed_header_data = 10000;  // CrxId proof
 *
 * AsymmetricKeyProof: public_key = 1 (DER SPKI), signature = 2 (RSA-SHA256)
 * CrxId:               crx_id = 1 (first 16 bytes of SHA-256 of the SPKI)
 *
 * NOTE: the Chrome Web Store wants the ZIP, not the CRX -- Google signs it for
 * you. The CRX + key here only matter for sideloading your own build.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// The repo root is wherever this script lives, so the packer works from any
// checkout and no contributor's local absolute path is baked into the source.
const ROOT = __dirname;
const SRC = path.join(ROOT, 'Chromium');
const OUT_CRX = path.join(ROOT, 'resize_yt_to_window_size.crx');
const KEYINFO = path.join(ROOT, 'crx-signing-key.info.txt');

// The private signing key deliberately lives OUTSIDE the repository. Keeping it
// in the working tree means a stray `git add -f`, a folder zip, or a cloud-sync
// client can leak it, and anyone holding it can sign updates that impersonate
// the extension. Override the location with the CRX_KEY_PATH environment
// variable; the default is a per-user directory outside any checkout.
const KEY_PEM = process.env.CRX_KEY_PATH
  ? path.resolve(process.env.CRX_KEY_PATH)
  : path.join(os.homedir(), '.crx-keys', 'resize-yt-to-window-size.pem');

// ---------- minimal protobuf writer ---------------------------------------
function varint(n) {
  const out = [];
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return Buffer.from(out);
}
const lenField = (fieldNo, buf) =>
  Buffer.concat([varint((fieldNo << 3) | 2), varint(buf.length), buf]);

// ---------- zip the source tree deterministically --------------------------
function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}
const files = walk(SRC);
const zipTmp = path.join(ROOT, '.crx-payload.zip');
if (fs.existsSync(zipTmp)) fs.rmSync(zipTmp);
execFileSync('tar.exe', ['-a', '-c', '-f', zipTmp, '-C', SRC, ...files], { stdio: 'ignore' });
const zip = fs.readFileSync(zipTmp);
fs.rmSync(zipTmp);

// The same payload is both the Chrome Web Store upload and the CRX body, so the
// two can never drift apart.
const OUT_ZIP = path.join(ROOT, 'resize_yt_to_window_size.zip');
fs.writeFileSync(OUT_ZIP, zip);
console.log('zip         : ' + OUT_ZIP + '  (' + zip.length + ' bytes, ' + files.length + ' entries)');

// ---------- key ------------------------------------------------------------
let key;
if (fs.existsSync(KEY_PEM)) {
  key = crypto.createPrivateKey(fs.readFileSync(KEY_PEM));
  console.log('signing key : reusing existing ' + KEY_PEM);
} else {
  fs.mkdirSync(path.dirname(KEY_PEM), { recursive: true, mode: 0o700 });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = privateKey;
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  fs.writeFileSync(KEY_PEM, pem, { mode: 0o600 });
  console.log('signing key : generated new RSA-2048 -> ' + KEY_PEM);
}
const spki = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });

// ---------- CrxId + proofs -------------------------------------------------
const crxId = crypto.createHash('sha256').update(spki).digest().subarray(0, 16);
const crxIdProto = lenField(1, crxId);

// Each proof carries the public key plus an RSA-SHA256 signature over the data
// that the corresponding field is meant to bind.
const mkProof = (dataToSign) => Buffer.concat([
  lenField(1, spki),
  lenField(2, crypto.sign('sha256', dataToSign, key)),
]);

const header = Buffer.concat([
  lenField(2, mkProof(zip)),      // sha256_with_rsa over the ZIP payload
  lenField(10000, mkProof(crxIdProto)), // signed_header_data (CrxId)
]);

const crx = Buffer.concat([
  Buffer.from('Cr24', 'ascii'),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(3, 0); return b; })(),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(header.length, 0); return b; })(),
  header,
  zip,
]);
fs.writeFileSync(OUT_CRX, crx);

// Chrome extension ID = a-p encoding of the first 16 bytes of SHA-256(pubkey)
const extId = [...crxId].map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');

// ---------- self-verify ----------------------------------------------------
const raw = fs.readFileSync(OUT_CRX);
const okMagic = raw.subarray(0, 4).toString() === 'Cr24';
const hlen = raw.readUInt32LE(8);
const zipBack = raw.subarray(12 + hlen);
const spkiBack = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
const idBack = crypto.createHash('sha256').update(spkiBack).digest().subarray(0, 16);

const info = [
  'CRX3 signing key for "Resize YT To Window Size"',
  '',
  'Generated for local/sideloaded builds only.',
  'Chrome Web Store submissions upload resize_yt_to_window_size.zip -- Google',
  'signs those itself, and this key is NOT used for that.',
  '',
  'KEEP THIS FILE SAFE AND OUT OF VERSION CONTROL.',
  'Anyone holding it can ship updates that impersonate this extension.',
  '',
  'Extension ID: ' + extId,
  'Public key SHA-256 (crx_id): ' + crxId.toString('hex'),
  'Private key: stored OUTSIDE the repository. Default:',
  '  ~/.crx-keys/resize-yt-to-window-size.pem',
  '  Override the location with the CRX_KEY_PATH environment variable.',
  '',
  'To rebuild after changing Chromium/:',
  '  node build-crx.js',
].join('\n');
fs.writeFileSync(KEYINFO, info);

console.log('zip payload : ' + zip.length + ' bytes, ' + files.length + ' entries');
console.log('crx_id      : ' + crxId.toString('hex'));
console.log('extension ID: ' + extId);
console.log('header_len  : ' + hlen);
console.log('crx         : ' + OUT_CRX + '  (' + crx.length + ' bytes)');
console.log('');
console.log('self-check  : magic=' + okMagic + '  crx_id stable=' + (crxId.equals(idBack)) +
            '  payload sha256=' + crypto.createHash('sha256').update(zipBack).digest('hex').slice(0, 16));
