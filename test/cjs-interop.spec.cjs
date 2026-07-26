const assert = require('node:assert/strict');
const {test} = require('node:test');
// Requires the package by name (rather than a build path) so this exercises the same
// "exports"/"main" resolution real CommonJS consumers go through.
const teenProcess = require('teen_process');

test('require() interop with the CJS build', async () => {
  assert.equal(typeof teenProcess.exec, 'function');
  assert.equal(typeof teenProcess.SubProcess, 'function');
  const {code} = await teenProcess.exec('true');
  assert.equal(code, 0);
});
