import assert from 'node:assert/strict';
import {test} from 'node:test';

// Import by package name (not a path) to exercise the "exports" resolution real consumers use.
import * as teenProcess from 'teen_process';

test('import of the package entry point resolves to the built ESM output', async () => {
  assert.equal(typeof teenProcess.exec, 'function');
  assert.equal(typeof teenProcess.SubProcess, 'function');
  const {code} = await teenProcess.exec('node', ['--version']);
  assert.equal(code, 0);
});
