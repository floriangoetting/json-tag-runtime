import { mkdir, readFile, writeFile } from 'node:fs/promises';

const banner = '/* Generated from src/browser/index.ts by npm run build:cdn. Do not edit. SPDX-License-Identifier: Apache-2.0 */\n';
const source = await readFile(new URL('../dist/browser.iife.js', import.meta.url), 'utf8');
await mkdir(new URL('../cdn/', import.meta.url), { recursive: true });
await writeFile(new URL('../cdn/browser.iife.js', import.meta.url), banner + source);
