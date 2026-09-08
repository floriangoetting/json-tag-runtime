import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] || process.env.RELEASE_TAG;
if (tag !== `v${version}`) {
  throw new Error(`Release tag must match package.json: v${version}`);
}
console.log(`Release URL after tag publication: https://cdn.jsdelivr.net/gh/floriangoetting/json-tag-runtime@${tag}/cdn/browser.iife.min.js`);
