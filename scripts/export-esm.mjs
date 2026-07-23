import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const browserTargetArgument = process.argv[2];
const nodeTargetArgument = process.argv[3];

if (!browserTargetArgument || !nodeTargetArgument) {
  throw new Error(
    'Usage: npm run export:esm -- /path/to/browser.js /path/to/node.js',
  );
}

const browserTarget = resolve(browserTargetArgument);
const nodeTarget = resolve(nodeTargetArgument);

await mkdir(dirname(browserTarget), { recursive: true });
await mkdir(dirname(nodeTarget), { recursive: true });
await copyFile(
  new URL('../dist/browser/index.js', import.meta.url),
  browserTarget,
);
await copyFile(
  new URL('../dist/node/index.js', import.meta.url),
  nodeTarget,
);
