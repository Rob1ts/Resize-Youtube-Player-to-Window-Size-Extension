import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const src = path.join(root, 'src');
const chromiumDir = path.join(root, 'Chromium');
const firefoxDir = path.join(root, 'Firefox');
const release = path.join(root, 'release');

const commonFiles = [
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.css',
  'popup.js'
];
const iconFiles = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (_) {
    return false;
  }
}

async function copyBuild(target, manifestName) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.join(target, 'icons'), { recursive: true });

  for (const file of commonFiles) {
    await cp(path.join(src, file), path.join(target, file));
  }
  await cp(path.join(root, 'LICENSE'), path.join(target, 'LICENSE'));
  await cp(path.join(root, 'THIRD-PARTY-NOTICES.md'), path.join(target, 'THIRD-PARTY-NOTICES.md'));
  for (const icon of iconFiles) {
    await cp(path.join(src, 'icons', icon), path.join(target, 'icons', icon));
  }

  const manifest = JSON.parse(await readFile(path.join(src, manifestName), 'utf8'));
  await writeFile(
    path.join(target, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
}

async function zipDirectory(source, destination) {
  const sevenZip = process.platform === 'win32' ? '7z.exe' : '7z';
  try {
    execFileSync(sevenZip, ['a', '-tzip', '-mx=9', '-y', destination, '*'], {
      cwd: source,
      stdio: 'pipe'
    });
    return;
  } catch (_) {
    // Fall through to the platform's built-in zip implementation.
  }

  if (process.platform === 'win32') {
    const escapedSource = source.replace(/'/g, "''");
    const escapedDestination = destination.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -Force`
      ],
      { stdio: 'pipe' }
    );
    return;
  }

  execFileSync('zip', ['-r', '-9', destination, '.'], { cwd: source, stdio: 'pipe' });
}

async function main() {
  await rm(chromiumDir, { recursive: true, force: true });
  await rm(firefoxDir, { recursive: true, force: true });
  await rm(release, { recursive: true, force: true });
  await mkdir(release, { recursive: true });

  await copyBuild(chromiumDir, 'manifest.chrome.json');
  await copyBuild(firefoxDir, 'manifest.firefox.json');

  const chromeZip = path.join(release, 'youtube-window-player-chromium.zip');
  await zipDirectory(chromiumDir, chromeZip);

  // Firefox requires the .xpi extension; build the zip in a temporary folder
  // so release/ only contains the packages we publish.
  const staging = await mkdtemp(path.join(os.tmpdir(), 'ytw-build-'));
  const firefoxZip = path.join(staging, 'youtube-window-player-firefox.zip');
  try {
    await zipDirectory(firefoxDir, firefoxZip);
    await cp(firefoxZip, path.join(release, 'youtube-window-player-firefox.xpi'));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  const required = [
    path.join(chromiumDir, 'manifest.json'),
    path.join(firefoxDir, 'manifest.json'),
    chromeZip,
    path.join(release, 'youtube-window-player-firefox.xpi')
  ];
  for (const file of required) {
    if (!(await exists(file))) throw new Error(`Build output missing: ${file}`);
  }

  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  console.log(`Built YouTube Window Player v${pkg.version}`);
  console.log('  Chromium/');
  console.log('  Firefox/');
  console.log('  release/youtube-window-player-chromium.zip');
  console.log('  release/youtube-window-player-firefox.xpi');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
