import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.argv[2]) throw new Error('Usage: npm run export:dda -- /path/to/dda-app');
const target = resolve(process.argv[2]);
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const directory = join(target, 'src/static/vendor/json-tag-runtime', version);
await mkdir(directory, { recursive: true });
const manifest = { version, files: {} };
for (const [kind, filename] of [['browser', 'browser.iife.min.js'], ['gtm', 'browser.iife.es5.min.js']]) {
  const source = await readFile(new URL(`../cdn/${filename}`, import.meta.url));
  const sha256 = createHash('sha256').update(source).digest('hex');
  await writeFile(join(directory, filename), source);
  manifest.files[kind] = { url: `/vendor/json-tag-runtime/${version}/${filename}?sha256=${sha256}`, sha256 };
}
await copyFile(new URL('../LICENSE', import.meta.url), join(directory, 'LICENSE'));
await writeFile(join(target, 'src/platform/runtimeLibrary.json'), JSON.stringify(manifest, null, 2) + '\n');
