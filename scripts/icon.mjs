// Builds every app icon from the artwork in src-tauri/icons/. Run with `npm run icon`.
//
// Like Typr's, the app icon is an Icon Composer icon (src-tauri/icons/ProjectZero.icon): macOS 26 and
// later show its light, dark, tinted or clear version to match the user's icon style, and
// older macOS uses the icon.icns fallback. The mark and gradient layers are made from the
// artwork; ProjectZero.icon/icon.json says how they combine and can be edited in
// Icon Composer.
//
// Needs Xcode 26 or later (actool and ictool). Everything it makes is committed, so building
// and releasing the app doesn't need Xcode.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTWORK = join(ROOT, 'src-tauri', 'icons', 'artwork');
const ICON = join(ROOT, 'src-tauri', 'icons', 'ProjectZero.icon');
const XCODE = process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer';
const ICTOOL = join(dirname(XCODE), 'Applications', 'Icon Composer.app', 'Contents', 'Executables', 'ictool');
const run = (command, args) =>
  execFileSync(command, args, { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, DEVELOPER_DIR: XCODE } });

// 1. The layers: the white mark, and the light and dark gradients. icon.json's base fill
// (under the gradient layer) follows the artwork's middle colour.
mkdirSync(join(ICON, 'Assets'), { recursive: true });
const middle = JSON.parse(
  run('swift', [
    join(ROOT, 'scripts', 'icon-layers.swift'),
    `${ARTWORK}.png`,
    `${ARTWORK}-dark.png`,
    join(ICON, 'Assets'),
  ]).toString(),
);
const json = JSON.parse(readFileSync(join(ICON, 'icon.json'), 'utf8'));
json['fill-specializations'] = [{ value: { solid: middle.light } }, { appearance: 'dark', value: { solid: middle.dark } }];
writeFileSync(join(ICON, 'icon.json'), JSON.stringify(json, null, 2) + '\n');

// 2. The asset catalog macOS 26 and later read the icon from, and the fallback for older macOS.
const work = mkdtempSync(join(tmpdir(), 'project-zero-icon-'));
try {
  execFileSync('cp', ['-R', ICON, join(work, 'Icon.icon')]);
  mkdirSync(join(work, 'out'));
  // actool reports problems on stdout.
  execFileSync(
    'xcrun',
    [
      'actool',
      join(work, 'Icon.icon'),
      '--compile',
      join(work, 'out'),
      '--output-format',
      'human-readable-text',
      '--notices',
      '--warnings',
      '--output-partial-info-plist',
      join(work, 'out', 'partial.plist'),
      '--app-icon',
      'Icon',
      '--include-all-app-icons',
      '--enable-on-demand-resources',
      'NO',
      '--development-region',
      'en',
      '--target-device',
      'mac',
      '--minimum-deployment-target',
      '26.0',
      '--platform',
      'macosx',
    ],
    { stdio: 'inherit', env: { ...process.env, DEVELOPER_DIR: XCODE } },
  );
  copyFileSync(join(work, 'out', 'Assets.car'), join(ROOT, 'src-tauri', 'icons', 'Assets.car'));
  // The fallback for macOS before 26. Like Typr's it stops at 256 px, which keeps the app small.
  copyFileSync(join(work, 'out', 'Icon.icns'), join(ROOT, 'src-tauri', 'icons', 'icon.icns'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 3. Pictures of the finished icon: the About panel (light and dark), favicons, and the website.
const exportImage = (rendition, size, out) =>
  run(ICTOOL, [
    ICON,
    '--export-image',
    '--output-file',
    resolve(ROOT, out),
    '--platform',
    'macOS',
    '--rendition',
    rendition,
    '--width',
    String(size),
    '--height',
    String(size),
    '--scale',
    '1',
  ]);
// Tauri builds this into the program as the window icon, which a Mac app shows only when run
// with `tauri dev`. It is stored uncompressed, so it is kept small.
exportImage('Default', 128, 'src-tauri/icons/icon.png');
exportImage('Default', 256, 'src/assets/icon-light.png');
exportImage('Dark', 256, 'src/assets/icon-dark.png');
exportImage('Default', 64, 'src/assets/favicon.png');
exportImage('Default', 256, 'docs/images/icon.png');
exportImage('Default', 64, 'docs/images/favicon.png');
console.log('Icons updated: src-tauri/icons, src/assets, docs/images.');
