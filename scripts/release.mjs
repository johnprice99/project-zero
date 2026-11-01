// Builds a release into dist/: the disk image the website links to, and the signed
// update that installed copies download. Attach every file in dist/ to a GitHub
// release tagged with the version (e.g. 1.0.0, no “v”). Run with `npm run dist`.
//
// The update is signed with ~/.config/project-zero/update-key (never in the repo).
// Installed copies only install updates signed with it; the public half is in
// src-tauri/tauri.conf.json (plugins › updater › pubkey).

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'johnprice99/project-zero';
// Fixed names, so the website's link (the newest release's disk image) keeps working.
const NAME = 'Project-Zero-mac-arm64';
const KEY = process.env.PROJECT_ZERO_UPDATE_KEY || join(homedir(), '.config', 'project-zero', 'update-key');
const OUT = join(ROOT, 'dist');
const BUNDLE = join(ROOT, 'src-tauri', 'target', 'release', 'bundle');

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8'))?.[1];
if (cargoVersion !== version) {
  console.error(`\n✖  package.json is ${version} but src-tauri/Cargo.toml is ${cargoVersion}. Set both to the same version.\n`);
  process.exit(1);
}

const signing = existsSync(KEY);
if (!signing) {
  console.warn(`\n⚠  No update signing key at ${KEY}.`);
  console.warn('   Building the disk image only: installed copies can’t update themselves to this release.');
  console.warn('   Restore the key from your backup, or make a new one with `npm run update-key`.\n');
}

rmSync(OUT, { recursive: true, force: true });
rmSync(BUNDLE, { recursive: true, force: true });
mkdirSync(OUT);

// CI skips arranging the disk image window in Finder (which needs Finder automation).
const env = { ...process.env, CI: 'true' };
const args = ['run', 'tauri', '--', 'build', '--bundles', 'app,dmg'];
if (signing) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY, 'utf8');
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '';
  args.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
}
execFileSync('npm', args, { cwd: ROOT, env, stdio: 'inherit' });

const app = join(BUNDLE, 'macos', 'Project Zero.app');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });

const dmgDir = join(BUNDLE, 'dmg');
const dmg = readdirSync(dmgDir).find(name => name.endsWith('.dmg'));
if (!dmg) throw new Error('The disk image was not built.');
copyFileSync(join(dmgDir, dmg), join(OUT, `${NAME}.dmg`));

if (signing) {
  copyFileSync(`${app}.tar.gz`, join(OUT, `${NAME}.app.tar.gz`));
  copyFileSync(`${app}.tar.gz.sig`, join(OUT, `${NAME}.app.tar.gz.sig`));
  const manifest = {
    version,
    pub_date: new Date().toISOString(),
    platforms: {
      'darwin-aarch64': {
        signature: readFileSync(`${app}.tar.gz.sig`, 'utf8').trim(),
        url: `https://github.com/${REPO}/releases/download/${version}/${NAME}.app.tar.gz`,
      },
    },
  };
  writeFileSync(join(OUT, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

const mb = path => `${(statSync(path).size / 1048576).toFixed(1)} MB`;
console.log(`\nProject Zero ${version} is ready in dist/:`);
for (const name of readdirSync(OUT)) console.log(`  ${name.padEnd(36)} ${mb(join(OUT, name))}`);
console.log(`\nNext: a GitHub release tagged ${version}, attaching every file above, marked as the latest release.\n`);
