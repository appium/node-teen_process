import {mkdirSync, writeFileSync} from 'node:fs';

for (const [dir, type] of [
  ['build/esm', 'module'],
  ['build/cjs', 'commonjs'],
]) {
  mkdirSync(dir, {recursive: true});
  writeFileSync(`${dir}/package.json`, `${JSON.stringify({type}, null, 2)}\n`);
}
