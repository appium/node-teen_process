// transpile:mocha

import B from 'bluebird';
import path from 'path';
import { SubProcess } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import { getFixture } from './helpers';

const should = chai.should();
chai.use(chaiAsPromised);

describe('SubProcess', () => {
  it('should throw an error if initialized without a command', () => {
    should.throw(() => {
      new SubProcess();
    });
  });
  it('should throw an error if initialized with a bad command', () => {
    should.throw(() => {
      new SubProcess({lol: true});
    });
    should.throw(() => {
      new SubProcess(1);
    });
  });
  it('should throw an error if initialized with bad args', () => {
    should.throw(() => {
      new SubProcess('ls', 'foo');
    });
    should.throw(() => {
      new SubProcess('ls', 1);
    });
    should.throw(() => {
      new SubProcess('ls', {});
    });
  });
  it('should default args list to []', () => {
    let x = new SubProcess('ls');
    x.args.should.eql([]);
  });

  describe('#start', () => {
    it('should throw an error if command fails on startup', async () => {
      let s = new SubProcess('blargimarg');
      await s.start().should.eventually.be.rejectedWith(/ENOENT/);
    });
    it('should have a default startDetector of waiting for output', async () => {
      let hasData = false;
      let s = new SubProcess('ls');
      s.on('output', (stdout) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start();
      hasData.should.be.true;
    });
    it('should interpret a numeric startDetector as a start timeout', async () => {
      let hasData = false;
      let s = new SubProcess(getFixture('sleepyproc.sh'), ['ls']);
      s.on('output', (stdout) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(0);
      hasData.should.be.false;
      await B.delay(1200);
      hasData.should.be.true;
    });
    it('should fail even with a start timeout of 0 when command is bad', async () => {
      let s = new SubProcess('blargimarg');
      await s.start(0).should.eventually.be.rejectedWith(/ENOENT/);
    });
    it('should be able to provide a custom startDetector function', async () => {
      let sd = (stdout) => { return stdout; };
      let hasData = false;
      let s = new SubProcess('ls');
      s.on('output', (stdout) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(sd);
      hasData.should.be.true;
    });
    it('should pass on custom errors from startDetector', async () => {
      let sd = () => { throw new Error('foo'); };
      let s = new SubProcess('ls');
      await s.start(sd).should.eventually.be.rejectedWith(/foo/);
    });
    it('should time out starts that take longer than specified ms', async () => {
      let sd = (stdout) => { return stdout.indexOf('nothere') !== -1; };
      let s = new SubProcess('ls');
      let start = Date.now();
      await s.start(sd, 500).should.eventually.be.rejectedWith(/did not start.+time/i);
      (Date.now() - start).should.be.below(600);
    });
  });

  describe('listening for data', () => {
    let subproc;
    it('should get output as params', async () => {
      await new Promise(async (resolve) => {
        subproc = new SubProcess(getFixture('sleepyproc.sh'),
                                 ['ls', path.resolve(__dirname)]);
        subproc.on('output', (stdout) => {
          if (stdout && stdout.indexOf('subproc-specs') !== -1) {
            resolve();
          }
        });
        await subproc.start();
      });
      await subproc.stop();

      await new Promise(async (resolve) => {
        subproc = new SubProcess(getFixture('echo.sh'), ['foo', 'bar']);
        subproc.on('output', (stdout, stderr) => {
          if (stderr && stderr.indexOf('bar') !== -1) {
            resolve();
          }
        });
        await subproc.start();
      });
      await subproc.stop();
    });

    it('should get output by lines', async () => {
      subproc = new SubProcess('ls', [path.resolve(__dirname)]);
      let lines = [];
      subproc.on('lines-stdout', (newLines) => {
        lines = lines.concat(newLines);
      });
      await subproc.start(0);
      await B.delay(50);
      lines.should.eql(['exec-specs.js', 'fixtures', 'helpers.js',
                        'subproc-specs.js']);
    });
  });

  describe('#stop', () => {
    it('should send the right signal to stop a proc', async () => {
      return new Promise(async (resolve, reject) => {
        let subproc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
        await subproc.start();
        subproc.on('exit', (code, signal) => {
          try {
            signal.should.equal('SIGHUP');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        await subproc.stop('SIGHUP');
      });
    });

    it('should time out if stop doesnt complete fast enough', async () => {
      let subproc = new SubProcess(getFixture('traphup.sh'),
                                   ['tail', '-f', path.resolve(__filename)]);
      await subproc.start();
      await subproc.stop('SIGHUP', 10)
              .should.eventually.be.rejectedWith(/Process didn't end/);
    });

    it('should error if there is no process to stop', async () => {
      let subproc = new SubProcess('ls');
      await subproc.stop().should.eventually.be.rejectedWith(/Can't stop/);
      await subproc.start();
      await B.delay(10);
      await subproc.stop().should.eventually.be.rejectedWith(/Can't stop/);
    });
  });
});
