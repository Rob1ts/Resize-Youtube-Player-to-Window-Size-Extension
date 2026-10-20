/*
 * YouTube Window Player - CRX packer
 *
 * Packs Chromium/ into release/youtube-window-player-chromium.crx with Chrome's
 * built-in --pack-extension. The signing key is kept out of version control at
 * keys/youtube-window-player.pem (override with CRX_KEY_PATH); it is generated
 * on first use and must be preserved if you publish updates under the same ID.
 *
 * Usage:
 *   node tools/pack-crx.mjs
 *   CHROME_PATH="/path/to/chrome" node tools/pack-crx.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'Chromium');
const releaseDir = path.join(root, 'release');
const keysDir = path.join(root, 'keys');
const keyPath = process.env.CRX_KEY_PATH
  ? path.resolve(process.env.CRX_KEY_PATH)
  : path.join(keysDir, 'youtube-window-player.pem');
const output = path.join(releaseDir, 'youtube-window-player-chromium.crx');

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('Could not find Chrome or Edge. Set CHROME_PATH to the browser executable.');
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error('Chromium/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(path.dirname(keyPath), { recursive: true });

const args = [`--pack-extension=${source}`, '--no-message-box'];
if (fs.existsSync(keyPath)) args.push(`--pack-extension-key=${keyPath}`);

console.log(`Packing with ${chrome}`);
execFileSync(chrome, args, { stdio: 'inherit' });

const generatedCrx = `${source}.crx`;
const generatedKey = `${source}.pem`;
if (!fs.existsSync(generatedCrx)) {
  console.error('Chrome did not produce a CRX file.');
  process.exit(1);
}
if (!fs.existsSync(keyPath) && fs.existsSync(generatedKey)) {
  fs.copyFileSync(generatedKey, keyPath);
  fs.rmSync(generatedKey, { force: true });
  console.log(`Stored signing key at ${path.relative(root, keyPath)}`);
}
fs.copyFileSync(generatedCrx, output);
fs.rmSync(generatedCrx, { force: true });

console.log(`Packed ${path.relative(root, output)} (${fs.statSync(output).size} bytes)`);
