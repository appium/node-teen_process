import assert from 'node:assert/strict';
import {CircularBuffer} from '../lib/circular-buffer';
import {describe, it} from 'node:test';

describe('CircularBuffer', function () {
  it('should properly rotate', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    assert.strictEqual(buffer.count, 0);
    assert.strictEqual(buffer.size, 0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    assert.strictEqual(buffer.count, 1);
    assert.strictEqual(buffer.size, maxSize);
    assert.deepStrictEqual(buffer.value(), Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize)));
    assert.strictEqual(buffer.count, 1);
    assert.strictEqual(buffer.size, 85);
    assert.deepStrictEqual(buffer.value(), Buffer.from('y'.repeat(85)));
  });

  it('should properly rotate if the incoming value is too large', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    assert.strictEqual(buffer.count, 0);
    assert.strictEqual(buffer.size, 0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    assert.strictEqual(buffer.count, 1);
    assert.strictEqual(buffer.size, maxSize);
    assert.deepStrictEqual(buffer.value(), Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize + 10)));
    assert.strictEqual(buffer.count, 1);
    assert.strictEqual(buffer.size, 85);
    assert.deepStrictEqual(buffer.value(), Buffer.from('y'.repeat(85)));
  });
});
