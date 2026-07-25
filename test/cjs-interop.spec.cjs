const assert = require('node:assert/strict');
const {test} = require('node:test');
const teenProcess = require('../build/cjs/lib/index.js');

test('require() interop with the CJS build', async () => {
  assert.equal(typeof teenProcess.exec, 'function');
  assert.equal(typeof teenProcess.SubProcess, 'function');
  const {code} = await teenProcess.exec('true');
  assert.equal(code, 0);
});
