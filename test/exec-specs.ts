import path from 'path';
import { exec } from '../lib';
import { getFixture } from './helpers';
import _ from 'lodash';
import { use as chaiUse, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chaiUse(chaiAsPromised);

describe('exec', function () {
  it('should work with arguments like spawn', async function () {
    const cmd = 'ls';
    const args = [__dirname];
    const {stdout, stderr, code} = await exec(cmd, args);
    expect(stdout).to.contain('exec-specs');
    expect(stderr).to.equal('');
    expect(code).to.equal(0);
  });

  it('should throw an error if command does not exist', async function () {
    await expect(exec('doesnoteexist')).to.eventually.be.rejected;
  });

  it('should throw an error with a bad exit code', async function () {
    const cmd = getFixture('bad_exit');
    let err: any;
    try {
      await exec(cmd);
    } catch (e) {
      err = e;
    }
    expect(err).to.exist;
    expect(err.stdout.trim()).to.equal('foo');
    expect(err.stderr.trim()).to.equal('bar');
    expect(err.code).to.equal(1);
  });

  it('should work with spaces in arguments', async function () {
    const cmd = getFixture('echo');
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    expect(stdout.trim()).to.equal(echo1);
    expect(stderr.trim()).to.equal(echo2);
    expect(code).to.equal(0);
  });

  it('should work with backslashes in arguments', async function () {
    const cmd = getFixture('echo');
    const echo1 = 'my\\ name\\ is\\ bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    expect(stdout.trim()).to.equal(echo1);
    expect(stderr.trim()).to.equal(echo2);
    expect(code).to.equal(0);
  });

  it('should work with spaces in commands', async function () {
    const cmd = getFixture('echo with space');
    const echo1 = 'bobbob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    expect(stdout.trim()).to.equal(echo1);
    expect(stderr.trim()).to.equal(echo2);
    expect(code).to.equal(0);
  });

  it('should work with spaces in commands and arguments', async function () {
    const cmd = getFixture('echo with space');
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    expect(stdout.trim()).to.equal(echo1);
    expect(stderr.trim()).to.equal(echo2);
    expect(code).to.equal(0);
  });

  it('should respect cwd', async function () {
    const cmd = process.platform === 'win32' ? 'echo.bat' : './echo.sh';
    const echo1 = 'my name is bob';
    const echo2 = 'lol';
    const cwd = path.dirname(getFixture('echo'));
    const {stdout, stderr, code} = await exec(cmd, [echo1, echo2], {cwd});
    expect(stdout.trim()).to.equal(echo1);
    expect(stderr.trim()).to.equal(echo2);
    expect(code).to.equal(0);
  });

  it('should respect env', async function () {
    const cmd = getFixture('env');
    const env = {FOO: 'lolol'};
    const {stdout, code} = await exec(cmd, [], {env});
    expect(stdout.trim()).to.equal(`${env.FOO} ${env.FOO}`);
    expect(code).to.equal(0);
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
    expect(err).to.exist;
    expect(err.message).to.contain('timed out');
    expect(err.message).to.contain(cmd);
  });

  it('should allow large amounts of output', async function () {
    this.timeout(24000);
    const {stdout} = await exec(getFixture('bigbuffer.js'));
    expect(stdout.length).to.be.above(512 * 1024);
  });

  it('should ignore output if requested', async function () {
    const cmd = getFixture('echo.sh');
    const echo1 = 'my name is bob';
    const {stdout, code} = await exec(cmd, [echo1], {ignoreOutput: true});
    expect(stdout).to.equal('');
    expect(code).to.equal(0);
  });

  it('should return a Buffer if requested', async function () {
    const cmd = getFixture('echo.sh');
    const echo1 = 'my name is bob';
    const {stdout, stderr, code} = await exec(cmd, [echo1], {isBuffer: true});
    expect(_.isString(stdout)).to.be.false;
    expect(_.isBuffer(stdout)).to.be.true;
    expect(_.isString(stderr)).to.be.false;
    expect(_.isBuffer(stderr)).to.be.true;
    expect(code).to.equal(0);
  });

  describe('binary output', function () {
    const PNG_MAGIC = '89504e47';
    const PNG_MAGIC_LENGTH = 4;

    it('should allow binary output', async function () {
      const {stdout} = await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary'});
      expect(_.isString(stdout)).to.be.true;
      expect(_.isBuffer(stdout)).to.be.false;
      const signature = Buffer.from(stdout, 'binary').toString('hex', 0, PNG_MAGIC_LENGTH);
      expect(signature).to.eql(PNG_MAGIC);
    });

    it('should allow binary output as Buffer', async function () {
      const {stdout} = await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', isBuffer: true});
      expect(_.isString(stdout)).to.be.false;
      expect(_.isBuffer(stdout)).to.be.true;
      const signature = stdout.toString('hex', 0, PNG_MAGIC_LENGTH);
      expect(signature).to.eql(PNG_MAGIC);
    });

    it('should allow binary output from timeout', async function () {
      try {
        await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', timeout: 1});
      } catch (err: any) {
        const stdout = err.stdout;
        expect(_.isString(stdout)).to.be.true;
        expect(_.isBuffer(stdout)).to.be.false;
      }
    });

    it('should allow binary output as Buffer from timeout', async function () {
      try {
        await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', timeout: 1, isBuffer: true});
      } catch (err: any) {
        const stdout = err.stdout;
        expect(_.isString(stdout)).to.be.false;
        expect(_.isBuffer(stdout)).to.be.true;
      }
    });
  });
});
