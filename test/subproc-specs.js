import B from 'bluebird';
import path from 'path';
import {exec, SubProcess} from '..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {getFixture} from './helpers';

const should = chai.should();
chai.use(chaiAsPromised);

// Windows doesn't understand SIGHUP
const stopSignal = process.platform === 'win32' ? 'SIGTERM' : 'SIGHUP';

describe('SubProcess', function () {
  it('should throw an error if initialized without a command', function () {
    should.throw(() => {
      // @ts-expect-error
      new SubProcess();
    });
  });
  it('should throw an error if initialized with a bad command', function () {
    should.throw(() => {
      // @ts-expect-error
      new SubProcess({lol: true});
    });
    should.throw(() => {
      // @ts-expect-error
      new SubProcess(1);
    });
  });
  it('should throw an error if initialized with bad args', function () {
    should.throw(() => {
      // @ts-expect-error
      new SubProcess('ls', 'foo');
    });
    should.throw(() => {
      // @ts-expect-error
      new SubProcess('ls', 1);
    });
    should.throw(() => {
      // @ts-expect-error
      new SubProcess('ls', {});
    });
  });
  it('should default args list to []', function () {
    let x = new SubProcess('ls');
    x.args.should.eql([]);
  });
  it('should default opts dict to {}', function () {
    let x = new SubProcess('ls');
    x.opts.should.eql({});
  });
  it('should pass opts to spawn', async function () {
    const cwd = path.resolve(getFixture('.'));
    const subproc = new SubProcess('ls', [], {cwd});
    let lines = [];
    subproc.on('lines-stdout', (newLines) => {
      lines = lines.concat(newLines);
    });
    await subproc.start(0);
    await B.delay(50);
    lines.should.include('bad_exit.sh');
    lines.should.contain('bigbuffer.js');
    lines.should.contain('echo.sh');
    try {
      // possible, but unlikely, that this is still running
      await subproc.stop();
    } catch {}
  });

  describe('#start', function () {
    /** @type {SubProcess?} */
    let s;

    beforeEach(function() {
      s = null;
    });

    afterEach(async function () {
      if (s) {
        try {
          await s.stop();
        } catch {}
      }
    });

    it('should throw an error if command fails on startup', async function () {
      s = new SubProcess('blargimarg');
      await s.start().should.be.rejectedWith(/not found/i);
    });
    it('should have a default startDetector of waiting for output', async function () {
      let hasData = false;
      s = new SubProcess('ls');
      s.on('output', (stdout) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start();
      hasData.should.be.true;
    });
    it('should interpret a numeric startDetector as a start timeout', async function () {
      let hasData = false;
      s = new SubProcess(getFixture('sleepyproc'), ['ls']);
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
    it('should fail even with a start timeout of 0 when command is bad', async function () {
      s = new SubProcess('blargimarg');
      await s.start(0).should.be.rejected;
    });
    it('should be able to provide a custom startDetector function', async function () {
      let sd = (stdout) => stdout;
      let hasData = false;
      s = new SubProcess('ls');
      s.on('output', (stdout) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(sd);
      hasData.should.be.true;
    });
    it('should pass on custom errors from startDetector', async function () {
      let sd = () => {
        throw new Error('foo');
      };
      s = new SubProcess('ls');
      await s.start(sd).should.be.rejectedWith(/foo/);
    });
    it('should time out starts that take longer than specified ms', async function () {
      let sd = (stdout) => stdout.indexOf('nothere') !== -1;
      s = new SubProcess('ls');
      let start = Date.now();
      await s
        .start(sd, 500)
        .should.be.rejectedWith(/process did not start within/i);
      (Date.now() - start).should.be.below(600);
    });
  });

  describe('listening for data', function () {
    let subproc;
    afterEach(async function () {
      try {
        await subproc.stop();
      } catch (ign) {}
    });
    it('should get output as params', async function () {
      await new B(async (resolve, reject) => {
        subproc = new SubProcess(getFixture('sleepyproc'), [
          'ls',
          path.resolve(__dirname),
        ]);
        subproc.on('output', (stdout) => {
          if (stdout && stdout.indexOf('subproc-specs') === -1) {
            reject();
          } else {
            resolve();
          }
        });
        await subproc.start();
      }).should.eventually.not.be.rejected;
    });
    it('should get output as params', async function () {
      await new B(async (resolve, reject) => {
        subproc = new SubProcess(getFixture('echo'), ['foo', 'bar']);
        // @ts-ignore
        subproc.on('output', (stdout, stderr) => {
          if (stderr && stderr.indexOf('bar') === -1) {
            reject();
          } else {
            resolve();
          }
        });
        await subproc.start();
      });
    });

    it('should get output by lines', async function () {
      subproc = new SubProcess('ls', [path.resolve(__dirname)]);
      let lines = [];
      subproc.on('lines-stdout', (newLines) => {
        lines = lines.concat(newLines);
      });
      await subproc.start(0);
      await B.delay(50);
      lines.should.eql([
        'exec-specs.js',
        'fixtures',
        'helpers.js',
        'subproc-specs.js',
      ]);
    });
  });

  describe('#stop', function () {
    it('should send the right signal to stop a proc', async function () {
      return await new B(async (resolve, reject) => {
        let subproc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
        await subproc.start();
        // @ts-ignore
        subproc.on('exit', (code, signal) => {
          try {
            signal.should.equal(stopSignal);
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        await subproc.stop(stopSignal);
      });
    });

    it('should time out if stop doesnt complete fast enough', async function () {
      let subproc = new SubProcess(getFixture('traphup'), [
        'tail',
        '-f',
        path.resolve(__filename),
      ]);
      await subproc.start();
      await subproc
        .stop(stopSignal, 1)
        .should.eventually.be.rejectedWith(/Process didn't end/);

      // need to kill the process
      // 1 for the trap, 1 for the tail
      try {
        await exec('kill', ['-9', String(/** @type {number} */(/** @type {NonNullable<SubProcess['proc']>} */(subproc.proc).pid) + 1)]);
      } catch (ign) {}
      try {
        await exec('kill', ['-9', String(/** @type {NonNullable<SubProcess['proc']>} */(subproc.proc).pid)]);
      } catch (ign) {}
    });

    it('should error if there is no process to stop', async function () {
      let subproc = new SubProcess('ls');
      await subproc.stop().should.eventually.be.rejectedWith(/Can't stop/);
      await subproc.start();
      await B.delay(10);
      await subproc.stop().should.eventually.be.rejectedWith(/Can't stop/);
    });
  });

  describe('#join', function () {
    it('should fail if the #start has not yet been called', async function () {
      const proc = new SubProcess(getFixture('sleepyproc.sh'), ['ls']);
      await proc.join().should.eventually.be.rejectedWith(/Cannot join/);
    });

    it('should wait until the process has been finished', async function () {
      const proc = new SubProcess(getFixture('sleepyproc'), ['ls']);
      const now = Date.now();
      await proc.start(0);
      await proc.join();
      const diff = Date.now() - now;
      diff.should.be.above(1000);
    });

    it('should throw if process ends with a invalid exitcode', async function () {
      const proc = new SubProcess(getFixture('bad_exit'));
      await proc.start(0);
      await proc
        .join()
        .should.eventually.be.rejectedWith(/Process ended with exitcode/);
    });

    it('should NOT throw if process ends with a custom allowed exitcode', async function () {
      const proc = new SubProcess(getFixture('bad_exit'));
      await proc.start(0);
      await proc.join([1]).should.eventually.be.become(1);
    });
  });

  describe('#emitLines', function () {
    it('should emit single lines with stream in front', async function () {
      const proc = new SubProcess(getFixture('sleepyproc.sh'), ['ls']);
      let lines = [];
      proc.on('stream-line', lines.push.bind(lines));
      await proc.start();
      await proc.stop();
      lines.length.should.be.above(5);
      lines[0].slice(0, 8).should.eql('[STDOUT]');
    });
  });

  describe('on exit / die', function () {
    it('should emit exit/end and no stop/die in normal exits', async function () {
      const proc = new SubProcess(getFixture('sleepyproc'), ['ls']);
      let exitCaught = [];
      let dieCaught = false;
      let stopCaught = false;
      let endCaught = false;
      proc.on('exit', (code, signal) => {
        exitCaught = [code, signal];
      });
      proc.on('die', () => {
        dieCaught = true;
      });
      proc.on('stop', () => {
        stopCaught = true;
      });
      proc.on('end', () => {
        endCaught = true;
      });
      await proc.start();
      await proc.join();
      exitCaught.should.eql([0, null]);
      dieCaught.should.be.false;
      stopCaught.should.be.false;
      endCaught.should.be.true;
    });

    it('should emit exit/stop and no end/die when we stop a proc', async function () {
      const proc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      let exitCaught = [];
      let dieCaught = false;
      let stopCaught = [];
      let endCaught = false;
      proc.on('exit', (code, signal) => {
        exitCaught = [code, signal];
      });
      proc.on('stop', (code, signal) => {
        stopCaught = [code, signal];
      });
      proc.on('die', () => {
        dieCaught = true;
      });
      proc.on('end', () => {
        endCaught = true;
      });
      await proc.start();
      await proc.stop();
      exitCaught.should.eql([null, 'SIGTERM']);
      stopCaught.should.eql(exitCaught);
      dieCaught.should.be.false;
      endCaught.should.be.false;
    });

    it('should emit exit/die and no stop/end when a proc is killed externally', async function () {
      const proc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      let exitCaught = [];
      let dieCaught = [];
      let stopCaught = false;
      let endCaught = false;
      proc.on('exit', (code, signal) => {
        exitCaught = [code, signal];
      });
      proc.on('die', (code, signal) => {
        dieCaught = [code, signal];
      });
      proc.on('stop', () => {
        stopCaught = true;
      });
      proc.on('end', () => {
        endCaught = true;
      });
      await proc.start();
      await exec('pkill', ['-f', `tail -f ${path.resolve(__filename)}`]);
      try {
        await proc.join();
      } catch (ign) {}
      exitCaught.should.eql([null, 'SIGTERM']);
      dieCaught.should.eql(exitCaught);
      stopCaught.should.be.false;
      endCaught.should.be.false;
    });
  });

  describe('#detachProcess', function () {
    /** @type {SubProcess?} */
    let s;
    beforeEach(function() {
      s = null;
    });

    afterEach(async function () {
      if (s) {
        try {
          await s.stop();
        } catch {
        }
      }
    });

    it('should work when process started detached', async function () {
      s = new SubProcess('tail', ['-f', path.resolve(__filename)], {
        detached: true,
      });
      await s.start();
      s.detachProcess();
    });

    it('should throw error if called when process not started detached', async function () {
      s = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      await s.start();
      (() => s?.detachProcess()).should.throw(
        /Unable to detach process that is not started with 'detached' option/,
      );
    });
  });
});

/**
 * @typedef {import('../lib/subprocess').SubProcess} SubProcess
 */
