import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exec, SubProcess} from '../lib/index.js';
import {getFixture} from './helpers.js';
import {describe, it, beforeEach, afterEach} from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Windows doesn't understand SIGHUP
const stopSignal = process.platform === 'win32' ? 'SIGTERM' : 'SIGHUP';

describe('SubProcess', function () {
  it('should throw an error if initialized without a command', function () {
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess();
    });
  });
  it('should throw an error if initialized with a bad command', function () {
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess({lol: true});
    });
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess(1);
    });
  });
  it('should throw an error if initialized with bad args', function () {
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', 'foo');
    });
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', 1);
    });
    assert.throws(() => {
      // @ts-expect-error - testing invalid input
      new SubProcess('ls', {});
    });
  });
  it('should default args list to []', function () {
    const x = new SubProcess('ls');
    assert.deepStrictEqual((x as any).args, []);
  });
  it('should default opts dict to {}', function () {
    const x = new SubProcess('ls');
    assert.deepStrictEqual((x as any).opts, {});
  });
  it('should pass opts to spawn', async function () {
    const cwd = path.resolve(await getFixture('.'));
    const subproc = new SubProcess('ls', [], {cwd});
    let lines: string[] = [];
    subproc.on('lines-stdout', (newLines: string[]) => {
      lines = lines.concat(newLines);
    });
    await subproc.start(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(lines.includes('bad_exit.sh'));
    assert.ok(lines.includes('bigbuffer.js'));
    assert.ok(lines.includes('echo.sh'));
    try {
      // possible, but unlikely, that this is still running
      await subproc.stop();
    } catch {}
  });

  describe('#start', function () {
    let s: InstanceType<typeof SubProcess> | null;

    beforeEach(function () {
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
      await assert.rejects(s.start(), /not found/i);
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
      assert.strictEqual(hasData, true);
    });
    it('should interpret a numeric startDetector as a start timeout', async function () {
      let hasData = false;
      s = new SubProcess(await getFixture('sleepyproc'), ['ls']);
      s.on('output', (stdout: string | Buffer) => {
        if (stdout) {
          hasData = true;
        }
      });
      await s.start(0);
      assert.strictEqual(hasData, false);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      assert.strictEqual(hasData, true);
    });
    it('should fail even with a start timeout of 0 when command is bad', async function () {
      s = new SubProcess('blargimarg');
      await assert.rejects(s.start(0));
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
      assert.strictEqual(hasData, true);
    });
    it('should pass on custom errors from startDetector', async function () {
      const sd = () => {
        throw new Error('foo');
      };
      s = new SubProcess('ls');
      await assert.rejects(s.start(sd), /foo/);
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
      await assert.rejects(s.start(sd, 500), /process did not start within/i);
      assert.ok(Date.now() - start < 600);
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
      subproc = new SubProcess(await getFixture('sleepyproc'), ['ls', path.resolve(__dirname)]);
      const output: (string | Buffer)[] = [];
      subproc.on('output', (stdout: string | Buffer) => {
        output.push(stdout);
      });
      await subproc.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(typeof output[0], 'string');
      assert.ok((output[0] as string).includes('subproc.spec'));
    });
    it('should get output as params with args', async function () {
      subproc = new SubProcess(await getFixture('echo'), ['foo', 'bar']);
      const outputs: Array<{stdout: string | Buffer; stderr: string | Buffer}> = [];
      subproc.on('output', (stdout: string | Buffer, stderr: string | Buffer) => {
        // We expect two invocations, one with stdout and one with stderr
        outputs.push({stdout, stderr});
      });
      await subproc.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(outputs.length > 0);
      assert.strictEqual(
        outputs.some((o) => o.stdout?.toString().trim() === 'foo'),
        true,
      );
      assert.strictEqual(
        outputs.some((o) => o.stderr?.toString().trim() === 'bar'),
        true,
      );
    });
    it('should get output as buffer', async function () {
      subproc = new SubProcess(await getFixture('echo'), ['foo'], {isBuffer: true});
      const output: (string | Buffer)[] = [];
      subproc.on('output', (stdout: string | Buffer) => {
        output.push(stdout);
      });
      await subproc.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(output[0] instanceof Buffer);
      assert.strictEqual(output[0].toString().trim(), 'foo');
    });
    it('should get output by lines', async function () {
      subproc = new SubProcess('ls', [path.resolve(__dirname)]);
      let lines: string[] = [];
      subproc.on('lines-stdout', (newLines: string[]) => {
        lines = lines.concat(newLines);
      });
      await subproc.start(0);
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const name of [
        'circular-buffer.spec',
        'exec.spec',
        'fixtures',
        'helpers',
        'subproc.spec',
      ]) {
        assert.strictEqual(
          lines.some((line) => line.includes(name)),
          true,
        );
      }
    });
  });

  describe('#stop', function () {
    it('should send the right signal to stop a proc', async function () {
      const subproc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      let exitSignal: string | null;
      subproc.on('exit', (code: number | null, signal: string | null) => {
        exitSignal = signal;
      });
      await subproc.start();
      await subproc.stop(stopSignal);
      assert.strictEqual(exitSignal!, stopSignal);
    });

    it('should time out if stop doesnt complete fast enough', async function () {
      const subproc = new SubProcess(await getFixture('traphup'), [
        'tail',
        '-f',
        path.resolve(__filename),
      ]);
      await subproc.start();
      await assert.rejects(subproc.stop(stopSignal, 1), /Process didn't end/);

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
      await assert.rejects(subproc.stop(), /Can't stop/);
      await subproc.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await assert.rejects(subproc.stop(), /Can't stop/);
    });
  });

  describe('#join', function () {
    it('should fail if the #start has not yet been called', async function () {
      const proc = new SubProcess(await getFixture('sleepyproc.sh'), ['ls']);
      await assert.rejects(proc.join(), /Cannot join/);
    });

    it('should wait until the process has been finished', async function () {
      const proc = new SubProcess(await getFixture('sleepyproc'), ['ls']);
      const now = Date.now();
      await proc.start(0);
      await proc.join();
      const diff = Date.now() - now;
      assert.ok(diff > 1000);
    });

    it('should throw if process ends with a invalid exitcode', async function () {
      const proc = new SubProcess(await getFixture('bad_exit'));
      await proc.start(0);
      await assert.rejects(proc.join(), /Process ended with exitcode/);
    });

    it('should NOT throw if process ends with a custom allowed exitcode', async function () {
      const proc = new SubProcess(await getFixture('bad_exit'));
      await proc.start(0);
      assert.strictEqual(await proc.join([1]), 1);
    });
  });

  describe('#emitLines', function () {
    it('should emit single lines with stream in front', async function () {
      const proc = new SubProcess(await getFixture('sleepyproc.sh'), ['ls']);
      const lines: string[] = [];
      proc.on('stream-line', lines.push.bind(lines));
      await proc.start();
      await proc.stop();
      assert.ok(lines.length > 5);
      assert.strictEqual(lines[0].slice(0, 8), '[STDOUT]');
    });
  });

  describe('on exit / die', function () {
    it('should emit exit/end and no stop/die in normal exits', async function () {
      const proc = new SubProcess(await getFixture('sleepyproc'), ['ls']);
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
      assert.deepStrictEqual(exitCaught, [0, null]);
      assert.strictEqual(dieCaught, false);
      assert.strictEqual(stopCaught, false);
      assert.strictEqual(endCaught, true);
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
      assert.deepStrictEqual(exitCaught, [null, 'SIGTERM']);
      assert.deepStrictEqual(stopCaught, exitCaught);
      assert.strictEqual(dieCaught, false);
      assert.strictEqual(endCaught, false);
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
      assert.deepStrictEqual(exitCaught, [null, 'SIGTERM']);
      assert.deepStrictEqual(dieCaught, exitCaught);
      assert.strictEqual(stopCaught, false);
      assert.strictEqual(endCaught, false);
    });
  });

  describe('#detachProcess', function () {
    let s: SubProcess | null;
    beforeEach(function () {
      s = null;
    });

    afterEach(async function () {
      try {
        await s?.stop();
      } catch {}
    });

    it('should throw error if called when process not started detached', async function () {
      const proc = new SubProcess('tail', ['-f', path.resolve(__filename)]);
      s = proc;
      await proc.start();
      assert.throws(
        () => proc.detachProcess(),
        /Unable to detach process that is not started with 'detached' option/,
      );
    });
  });
});
