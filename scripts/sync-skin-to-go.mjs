import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const targetRepository = resolve(process.argv[2] ?? '../s2go/skin_to_go');
const targetDirectory = resolve(
  targetRepository,
  'src/vendor/json-tag-runtime',
);

await mkdir(targetDirectory, { recursive: true });
await copyFile(
  new URL('../dist/browser/index.js', import.meta.url),
  resolve(targetDirectory, 'browser.js'),
);
