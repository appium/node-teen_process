import assert from 'node:assert/strict';
import path from 'node:path';
import {exec} from '../lib';
import {getFixture} from './helpers';
import {describe, it, type TestContext} from 'node:test';

describe('exec', function () {
  it('should work with arguments like spawn', async function () {
    const cmd = 'ls';
    const args = [__dirname];
    const {stdout, stderr, code} = await exec(cmd, args);
    assert.ok(stdout.includes('exec.spec'));
    assert.strictEqual(stderr, '');
    assert.strictEqual(code, 0);
  });

  it('should throw an error if command does not exist', async function () {
    await assert.rejects(exec('doesnoteexist'));
  });

  it('should throw an error with a bad exit code', async function () {
    const cmd = await getFixture('bad_exit');
    let err: any;
    try {
      await exec(cmd);
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.strictEqual(err.stdout.trim(), 'foo');
    assert.strictEqual(err.stderr.trim(), 'bar');
    assert.strictEqual(err.code, 1);
  });

  it('should work with spaces in arguments', async function () {
    const cmd = await getFixture('echo');
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    assert.strictEqual(stdout.trim(), echo1);
    assert.strictEqual(stderr.trim(), echo2);
    assert.strictEqual(code, 0);
  });

  it('should work with backslashes in arguments', async function () {
    const cmd = await getFixture('echo');
    const echo1 = 'my\\ name\\ is\\ bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    assert.strictEqual(stdout.trim(), echo1);
    assert.strictEqual(stderr.trim(), echo2);
    assert.strictEqual(code, 0);
  });

  it('should work with spaces in commands', async function () {
    const cmd = await getFixture('echo with space');
    const echo1 = 'bobbob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    assert.strictEqual(stdout.trim(), echo1);
    assert.strictEqual(stderr.trim(), echo2);
    assert.strictEqual(code, 0);
  });

  it('should work with spaces in commands and arguments', async function () {
    const cmd = await getFixture('echo with space');
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    assert.strictEqual(stdout.trim(), echo1);
    assert.strictEqual(stderr.trim(), echo2);
    assert.strictEqual(code, 0);
  });

  it('should respect cwd', async function () {
    const cmd = process.platform === 'win32' ? 'echo.bat' : './echo.sh';
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const cwd = path.dirname(await getFixture('echo'));
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2], {cwd});
    assert.strictEqual(stdout.trim(), echo1);
    assert.strictEqual(stderr.trim(), echo2);
    assert.strictEqual(code, 0);
  });

  it('should respect env', async function () {
    const cmd = await getFixture('env');
    const env = {FOO: 'lolol'};
    const {stdout, code} = await exec(cmd, [], {env});
    assert.strictEqual(stdout.trim(), `${env.FOO} ${env.FOO}`);
    assert.strictEqual(code, 0);
  });

  it('should allow a timeout parameter', async function () {
    const cmd = 'sleep';
    const args = ['10'];
    let err: any;
    try {
      await exec(cmd, args, {timeout: 500});
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.ok(err.message.includes('timed out'));
    assert.ok(err.message.includes(cmd));
  });

  it('should allow large amounts of output', {timeout: 24000}, async function () {
    const {stdout} = await exec(await getFixture('bigbuffer.js'));
    assert.ok(stdout.length > 512 * 1024);
  });

  it('should ignore output if requested', async function () {
    const cmd = await getFixture('echo.sh');
    const echo1 = 'my name is bob';
    const {stdout, code} = await exec(cmd, [echo1], {ignoreOutput: true});
    assert.strictEqual(stdout, '');
    assert.strictEqual(code, 0);
  });

  it('should return a Buffer if requested', async function () {
    const cmd = await getFixture('echo.sh');
    const echo1 = 'my name is bob';
    const {stdout, stderr, code} = await exec(cmd, [echo1], {isBuffer: true});
    assert.ok(stdout instanceof Buffer);
    assert.ok(stderr instanceof Buffer);
    assert.strictEqual(code, 0);
  });

  describe('binary output', function () {
    const PNG_MAGIC = '89504e47';
    const PNG_MAGIC_LENGTH = 4;

    it('should allow binary output', async function () {
      const {stdout} = await exec('cat', [await getFixture('screenshot.png')], {
        encoding: 'binary',
      });
      assert.strictEqual(typeof stdout, 'string');
      const signature = Buffer.from(stdout, 'binary').toString('hex', 0, PNG_MAGIC_LENGTH);
      assert.deepStrictEqual(signature, PNG_MAGIC);
    });

    it('should allow binary output as Buffer', async function () {
      const {stdout} = await exec('cat', [await getFixture('screenshot.png')], {
        encoding: 'binary',
        isBuffer: true,
      });
      assert.ok(stdout instanceof Buffer);
      const signature = stdout.toString('hex', 0, PNG_MAGIC_LENGTH);
      assert.deepStrictEqual(signature, PNG_MAGIC);
    });

    it('should allow binary output from timeout', async function () {
      try {
        await exec('cat', [await getFixture('screenshot.png')], {encoding: 'binary', timeout: 1});
      } catch (err: any) {
        const stdout = err.stdout;
        assert.strictEqual(typeof stdout, 'string');
      }
    });

    it('should allow binary output as Buffer from timeout', async function () {
      try {
        await exec('cat', [await getFixture('screenshot.png')], {
          encoding: 'binary',
          timeout: 1,
          isBuffer: true,
        });
      } catch (err: any) {
        const stdout = err.stdout;
        assert.ok(stdout instanceof Buffer);
      }
    });
  });

  it(
    '[manual] should be able to run command as non-sudo user when parent runs as sudo',
    {skip: process.platform === 'win32' || process.env.CI},
    async function (ctx: TestContext) {
      if (!process.getuid || process.getuid() !== 0) {
        return ctx.skip();
      }

      const sudoUid = process.env.SUDO_UID;
      const sudoGid = process.env.SUDO_GID;
      if (!sudoUid || !sudoGid) {
        return ctx.skip();
      }

      const targetUid = Number(sudoUid);
      const targetGid = Number(sudoGid);
      const {stdout, code} = await exec('id', ['-u'], {
        uid: targetUid,
        gid: targetGid,
        stdio: 'pipe',
      });

      assert.strictEqual(code, 0);
      assert.strictEqual(stdout.trim(), String(targetUid));
      assert.notStrictEqual(targetUid, 0);
    },
  );
});
