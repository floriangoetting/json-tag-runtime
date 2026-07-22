import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const targetRepository = resolve(process.argv[2] ?? '../json-tag');

await Promise.all([
  copyFile(
    new URL('../dist/jsonTagSendData.js', import.meta.url),
    resolve(targetRepository, 'dist/jsonTagSendData.js'),
  ),
  copyFile(
    new URL('../dist/jsonTagSendData-min.js', import.meta.url),
    resolve(targetRepository, 'dist/jsonTagSendData-min.js'),
  ),
]);
