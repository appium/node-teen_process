// eslint-disable-next-line import/no-unresolved
import { CircularBuffer } from '../lib/circular-buffer';


describe('CircularBuffer', function () {
  let chai;

  before(async function() {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  it('should properly rotate', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    buffer.count.should.equal(0);
    buffer.size.should.equal(0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    buffer.count.should.equal(1);
    buffer.size.should.equal(maxSize);
    buffer.value().should.eql(Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize)));
    buffer.count.should.equal(1);
    buffer.size.should.equal(85);
    buffer.value().should.eql(Buffer.from('y'.repeat(85)));
  });

  it('should properly rotate if the incoming value is too large', function () {
    const maxSize = 100;
    const buffer = new CircularBuffer(maxSize);
    buffer.count.should.equal(0);
    buffer.size.should.equal(0);
    buffer.add(Buffer.from('x'.repeat(maxSize)));
    buffer.count.should.equal(1);
    buffer.size.should.equal(maxSize);
    buffer.value().should.eql(Buffer.from('x'.repeat(maxSize)));
    buffer.add(Buffer.from('y'.repeat(maxSize + 10)));
    buffer.count.should.equal(1);
    buffer.size.should.equal(85);
    buffer.value().should.eql(Buffer.from('y'.repeat(85)));
  });

});
