import { mkdir, readFile, writeFile } from 'node:fs/promises';

const banner = '/* Generated from src/browser/index.ts by npm run build:cdn. Do not edit. SPDX-License-Identifier: Apache-2.0 */\n';
await mkdir(new URL('../cdn/', import.meta.url), { recursive: true });
for (const filename of ['browser.iife.js', 'browser.iife.min.js', 'browser.iife.es5.min.js']) {
  const source = await readFile(new URL(`../dist/${filename}`, import.meta.url), 'utf8');
  await writeFile(new URL(`../cdn/${filename}`, import.meta.url), banner + source);
}
