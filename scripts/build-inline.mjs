import { readFile, writeFile } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import { transform } from 'esbuild';
import { parse } from 'acorn';

const source = await readFile(new URL('../dist/browser.iife.js', import.meta.url), 'utf8');
const compiled = await transformAsync(source, {
  babelrc: false, configFile: false, sourceType: 'script', comments: false,
  presets: [[presetEnv, { targets: { ie: '11' }, modules: false }]],
});
const { code } = await transform(compiled.code, { minify: true, target: 'es5', legalComments: 'none' });
parse(code, { ecmaVersion: 5 });
await writeFile(new URL('../dist/browser.iife.es5.min.js', import.meta.url), code);
