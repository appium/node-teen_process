import B from 'bluebird';
import path from 'path';
import {exec, SubProcess} from '../lib';
import {getFixture} from './helpers';
import _ from 'lodash';
import { use as chaiUse, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chaiUse(chaiAsPromised);

// Windows doesn't understand SIGHUP
const stopSignal = process.platform === 'win32' ? 'SIGTERM' : 'SIGHUP';

describe('SubProcess', function () {
  it('should throw an error if initialized without a command', function () {
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess();
    }).to.throw();
  });
  it('should throw an error if initialized with a bad command', function () {
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess({lol: true});
    }).to.throw();
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess(1);
    }).to.throw();
  });
  it('should throw an error if initialized with bad args', function () {
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', 'foo');
    }).to.throw();
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', 1);
    }).to.throw();
    expect(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', {});
    }).to.throw();
  });
  it('should default args list to []', function () {
    const x = new SubProcess('ls');
    expect((x as any).args).to.eql([]);
  });
  it('should default opts dict to {}', function () {
    const x = new SubProcess('ls');
    expect((x as any).opts).to.eql({});
  });
  it('should pass opts to spawn', async function () {
    const cwd = path.resolve(getFixture('.'));
    const subproc = new SubProcess('ls', [], {cwd});
    let lines: string[] = [];
    subproc.on('lines-stdout', (newLines: string[]) => {
      lines = lines.concat(newLines);
    });
    await subproc.start(0);
    await B.delay(50);
    expect(lines).to.include('bad_exit.sh');
    expect(lines).to.contain('bigbuffer.js');
    expect(lines).to.contain('echo.sh');
    try {
      // possible, but unlikely, that this is still running
      await subproc.stop();
    } catch {}
  });

  describe('#start', function () {
    let s: InstanceType<typeof SubProcess> | null;

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
      await expect(s.start()).to.eventually.be.rejectedWith(/not found/i);
    });
    it('should have a default startDetector of waiting for output', async function () {
      let hasData = false;
      s = new SubProcess('ls');
      s.on('output', (stdout: string | Buffer) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start();
      expect(hasData).to.be.true;
    });
    it('should interpret a numeric startDetector as a start timeout', async function () {
      let hasData = false;
      s = new SubProcess(getFixture('sleepyproc'), ['ls']);
      s.on('output', (stdout: string | Buffer) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(0);
      expect(hasData).to.be.false;
      await B.delay(1200);
      expect(hasData).to.be.true;
    });
    it('should fail even with a start timeout of 0 when command is bad', async function () {
      s = new SubProcess('blargimarg');
      await expect(s.start(0)).to.eventually.be.rejected;
    });
    it('should be able to provide a custom startDetector function', async function () {
      const sd = (stdout: string | Buffer) => stdout;
      let hasData = false;
      s = new SubProcess('ls');
      s.on('output', (stdout: string | Buffer) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(sd);
      expect(hasData).to.be.true;
    });
    it('should pass on custom errors from startDetector', async function () {
      const sd = () => {
        throw new Error('foo');
      };
      s = new SubProcess('ls');
      await expect(s.start(sd)).to.eventually.be.rejectedWith(/foo/);
    });
    it('should time out starts that take longer than specified ms', async function () {
      const sd = (stdout: string | Buffer) => {
        if (typeof stdout === 'string') {
          return stdout.includes('nothere');
        }
        return false;
      };
      s = new SubProcess('ls');
      const start = Date.now();
      await expect(s
        .start(sd, 500))
        .to.eventually.be.rejectedWith(/process did not start within/i);
      expect(Date.now() - start).to.be.below(600);
    });
  });

  describe('listening for data', function () {
    let subproc: InstanceType<typeof SubProcess> | undefined;
    afterEach(async function () {
      try {
        if (subproc) {
          await subproc.stop();
        }
      } catch {}
    });
    it('should get output as params', async function () {
      await expect(new B(async (resolve, reject) => {
        subproc = new SubProcess(getFixture('sleepyproc'), [
          'ls',
          path.resolve(__dirname),
        ]);
        subproc.on('output', (stdout: string | Buffer) => {
          if (stdout && typeof stdout === 'string' && !stdout.includes('subproc-specs')) {
            reject();
          } else {
            resolve(undefined);
          }
        });
        await subproc.start();
      })).to.eventually.not.be.rejected;
    });
    it('should get output as params with args', async function () {
      await new B(async (resolve, reject) => {
        subproc = new SubProcess(getFixture('echo'), ['foo', 'bar']);
        subproc.on('output', (stdout: string | Buffer, stderr?: string | Buffer) => {
          if (stderr && typeof stderr === 'string' && !stderr.includes('bar')) {
            reject();
          } else {
            resolve(undefined);
          }
        });
        await subproc.start();
      });
    });
    it('should get output as buffer', async function () {
      const stdout = await new B<Buffer>(async (resolve) => {
        subproc = new SubProcess(getFixture('echo'), ['foo'], {isBuffer: true});
        subproc.on('output', resolve);
        await subproc.start();
      });
      expect(_.isString(stdout)).to.be.false;
      expect(_.isBuffer(stdout)).to.be.true;

      expect(stdout.toString().trim()).to.eql('foo');
    });

    it('should get output by lines', async function () {
      subproc = new SubProcess('ls', [path.resolve(__dirname)]);
      let lines: string[] = [];
      subproc.on('lines-stdout', (newLines: string[]) => {
        lines = lines.concat(newLines);
      });
      await subproc.start(0);
      await B.delay(50);
      expect(lines).to.eql([
        'circular-buffer-specs.ts',
        'exec-specs.ts',
        'fixtures',
        'helpers.ts',
        'subproc-specs.ts',
      ]);
    });
  });

  describe('#stop', function () {
    it('should send the right signal to stop a proc', async function () {
      return await new B(async (resolve, reject) => {
        const subproc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
        await subproc.start();
        subproc.on('exit', (code: number | null, signal: string | null) => {
          try {
            expect(signal).to.equal(stopSignal);
            resolve(undefined);
          } catch (e) {
            reject(e);
          }
        });

        await subproc.stop(stopSignal);
      });
    });

    it('should time out if stop doesnt complete fast enough', async function () {
      const subproc = new SubProcess(getFixture('traphup'), [
        'tail',
        '-f',
        path.resolve(__filename),
      ]);
      await subproc.start();
      await expect(subproc
        .stop(stopSignal, 1))
        .to.eventually.be.rejectedWith(/Process didn't end/);

      // need to kill the process
      // 1 for the trap, 1 for the tail
      if (subproc.isRunning) {
        try {
          await exec('kill', ['-9', String(subproc.pid! + 1)]);
        } catch {}
        try {
          await exec('kill', ['-9', String(subproc.pid!)]);
        } catch {}
      }
    });

    it('should error if there is no process to stop', async function () {
      const subproc = new SubProcess('ls');
      await expect(subproc.stop()).to.eventually.be.rejectedWith(/Can't stop/);
      await subproc.start();
      await B.delay(10);
      await expect(subproc.stop()).to.eventually.be.rejectedWith(/Can't stop/);
    });
  });

  describe('#join', function () {
    it('should fail if the #start has not yet been called', async function () {
      const proc = new SubProcess(getFixture('sleepyproc.sh'), ['ls']);
      await expect(proc.join()).to.eventually.be.rejectedWith(/Cannot join/);
    });

    it('should wait until the process has been finished', async function () {
      const proc = new SubProcess(getFixture('sleepyproc'), ['ls']);
      const now = Date.now();
      await proc.start(0);
      await proc.join();
      const diff = Date.now() - now;
      expect(diff).to.be.above(1000);
    });

    it('should throw if process ends with a invalid exitcode', async function () {
      const proc = new SubProcess(getFixture('bad_exit'));
      await proc.start(0);
      await expect(proc
        .join())
        .to.eventually.be.rejectedWith(/Process ended with exitcode/);
    });

    it('should NOT throw if process ends with a custom allowed exitcode', async function () {
      const proc = new SubProcess(getFixture('bad_exit'));
      await proc.start(0);
      await expect(proc.join([1])).to.eventually.become(1);
    });
  });

  describe('#emitLines', function () {
    it('should emit single lines with stream in front', async function () {
      const proc = new SubProcess(getFixture('sleepyproc.sh'), ['ls']);
      const lines: string[] = [];
      proc.on('stream-line', lines.push.bind(lines));
      await proc.start();
      await proc.stop();
      expect(lines.length).to.be.above(5);
      expect(lines[0].slice(0, 8)).to.eql('[STDOUT]');
    });
  });

  describe('on exit / die', function () {
    it('should emit exit/end and no stop/die in normal exits', async function () {
      const proc = new SubProcess(getFixture('sleepyproc'), ['ls']);
      let exitCaught: [number | null, string | null] = [null, null];
      let dieCaught = false;
      let stopCaught = false;
      let endCaught = false;
      proc.on('exit', (code: number | null, signal: string | null) => {
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
      expect(exitCaught).to.eql([0, null]);
      expect(dieCaught).to.be.false;
      expect(stopCaught).to.be.false;
      expect(endCaught).to.be.true;
    });

    it('should emit exit/stop and no end/die when we stop a proc', async function () {
      const proc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      let exitCaught: [number | null, string | null] = [null, null];
      let dieCaught = false;
      let stopCaught: [number | null, string | null] = [null, null];
      let endCaught = false;
      proc.on('exit', (code: number | null, signal: string | null) => {
        exitCaught = [code, signal];
      });
      proc.on('stop', (code: number | null, signal: string | null) => {
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
      expect(exitCaught).to.eql([null, 'SIGTERM']);
      expect(stopCaught).to.eql(exitCaught);
      expect(dieCaught).to.be.false;
      expect(endCaught).to.be.false;
    });

    it('should emit exit/die and no stop/end when a proc is killed externally', async function () {
      const proc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      let exitCaught: [number | null, string | null] = [null, null];
      let dieCaught: [number | null, string | null] = [null, null];
      let stopCaught = false;
      let endCaught = false;
      proc.on('exit', (code: number | null, signal: string | null) => {
        exitCaught = [code, signal];
      });
      proc.on('die', (code: number | null, signal: string | null) => {
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
      } catch {}
      expect(exitCaught).to.eql([null, 'SIGTERM']);
      expect(dieCaught).to.eql(exitCaught);
      expect(stopCaught).to.be.false;
      expect(endCaught).to.be.false;
    });
  });

  describe('#detachProcess', function () {
    let s: InstanceType<typeof SubProcess> | null;
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
      expect(() => s?.detachProcess()).to.throw(
        /Unable to detach process that is not started with 'detached' option/,
      );
    });
  });
});
