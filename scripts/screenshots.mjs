// Takes the website's screenshots (docs/images) from the browser preview, using a made-up
// board in a throwaway browser profile, so it never touches your own board or settings.
// Run with `npm run screenshots`. WebKit is the engine the desktop app uses.
// Also copies the app icon to the website, so a new icon only needs replacing in the app.

import { webkit } from 'playwright';
import { build, preview } from 'vite';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');

const projects = [
  { id: 'work', name: 'Work', color: 'sky' },
  { id: 'home', name: 'Home', color: 'sage' },
  { id: 'lisbon', name: 'Trip to Lisbon', color: 'coral' },
  { id: 'garden', name: 'Garden', color: 'sand' },
];
// [project, column, title, description, today, blocked]
const rows = [
  ['work', 'doing', 'Draft the quarterly update', 'Numbers from finance are in the shared folder.', true, false],
  ['work', 'doing', 'Review Sam’s design proposal', '', true, false],
  ['work', 'todo', 'Book the team offsite venue', 'Waiting for budget sign-off.', false, true],
  ['work', 'todo', 'Plan the next sprint', '', false, false],
  ['work', 'done', 'Send onboarding notes to Priya', '', false, false],
  ['home', 'todo', 'Renew the car insurance', 'Current policy ends on the 14th.', true, false],
  ['home', 'todo', 'Fix the dripping kitchen tap', '', false, false],
  ['home', 'doing', 'Sort out the spare room', '', false, false],
  ['home', 'done', 'Book the boiler service', '', false, false],
  ['lisbon', 'todo', 'Book flights', '', true, false],
  ['lisbon', 'todo', 'Find somewhere to stay near Alfama', '', false, false],
  ['lisbon', 'doing', 'Make a list of restaurants', 'Ask Ana for her favourites.', false, false],
  ['lisbon', 'done', 'Renew passport', '', false, false],
  ['garden', 'todo', 'Plant the spring bulbs', '', false, false],
  ['garden', 'todo', 'Order compost', '', false, false],
  ['garden', 'done', 'Clear the leaves', '', false, false],
];
const order = {};
const tasks = rows.map(([projectId, status, title, notes, today, blocked], i) => {
  const lane = `${projectId}-${status}`;
  order[lane] = (order[lane] ?? -1) + 1;
  return { id: `shot-${i}`, title, projectId, status, blocked, today, order: order[lane], todayOrder: i, notes, checklist: [] };
});
const board = {
  schema: 1,
  completedColumnId: 'done',
  collapsedProjects: [],
  columns: [
    { id: 'todo', name: 'To do' },
    { id: 'doing', name: 'Doing' },
    { id: 'done', name: 'Done' },
  ],
  projects,
  tasks,
};
const storage = {
  'project-zero.board': JSON.stringify({ revision: 1, savedAt: Date.now(), board }),
  'project-zero.used-commands': JSON.stringify(['new-task', 'move-column', 'add-today']),
};

const outDir = mkdtempSync(join(tmpdir(), 'project-zero-screenshots-'));
await build({ root: ROOT, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({
  root: ROOT,
  logLevel: 'warn',
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
const browser = await webkit.launch();
mkdirSync(OUT, { recursive: true });

async function shot(name, { dark = false, act = async () => {} } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(values => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, storage);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4174/`);
  await page.waitForSelector('.task-card');
  await act(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await context.close();
  console.log(`docs/images/${name}.png`);
}

try {
  await shot('board-light');
  await shot('board-dark', { dark: true });
  await shot('today', { act: page => page.click('button[aria-label="Today"]') });
  await shot('palette', {
    act: async page => {
      await page.keyboard.press('Meta+Shift+P');
      await page.waitForSelector('.command-dialog');
    },
  });
  await shot('editor', {
    dark: true,
    act: async page => {
      await page.click('button[aria-label="Edit Draft the quarterly update"]');
      await page.waitForSelector('.task-dialog');
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    },
  });
  copyFileSync(join(ROOT, 'src', 'assets', 'icon-light.png'), join(OUT, 'icon.png'));
  copyFileSync(join(ROOT, 'src-tauri', 'icons', '64x64.png'), join(OUT, 'favicon.png'));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  rmSync(outDir, { recursive: true, force: true });
}
