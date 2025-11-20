import { CircularBuffer } from '../lib/circular-buffer';
import { use as chaiUse, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chaiUse(chaiAsPromised);

describe('CircularBuffer', function () {
  it('should properly rotate', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    expect(buffer.count).to.equal(0);
    expect(buffer.size).to.equal(0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    expect(buffer.count).to.equal(1);
    expect(buffer.size).to.equal(maxSize);
    expect(buffer.value()).to.eql(Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize)));
    expect(buffer.count).to.equal(1);
    expect(buffer.size).to.equal(85);
    expect(buffer.value()).to.eql(Buffer.from('y'.repeat(85)));
  });

  it('should properly rotate if the incoming value is too large', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    expect(buffer.count).to.equal(0);
    expect(buffer.size).to.equal(0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    expect(buffer.count).to.equal(1);
    expect(buffer.size).to.equal(maxSize);
    expect(buffer.value()).to.eql(Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize + 10)));
    expect(buffer.count).to.equal(1);
    expect(buffer.size).to.equal(85);
    expect(buffer.value()).to.eql(Buffer.from('y'.repeat(85)));
  });
});

