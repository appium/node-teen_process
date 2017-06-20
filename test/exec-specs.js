// transpile:mocha

import path from 'path';
import { exec } from '..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getFixture } from './helpers';
import { system } from 'appium-support';
import _ from 'lodash';


const should = chai.should();
chai.use(chaiAsPromised);

describe('exec', () => {
  it('should work with arguments like spawn', async () => {
    let cmd = 'ls';
    let args = [__dirname];
    let {stdout, stderr, code} = await exec(cmd, args);
    stdout.should.contain("exec-specs.js");
    stderr.should.equal("");
    code.should.equal(0);
  });

  it('should throw an error if command does not exist', async () => {
    let cmd = 'doesnoteexist';
    let err;
    try {
      await exec(cmd);
    } catch (e) {
      err = e;
    }
    should.exist(err);
    err.message.should.include('not found');
  });

  it('should throw an error with a bad exit code', async () => {
    let cmd = getFixture("bad_exit");
    let err;
    try {
      await exec(cmd);
    } catch (e) {
      err = e;
    }
    should.exist(err);
    err.stdout.trim().should.equal("foo");
    err.stderr.trim().should.equal("bar");
    err.code.should.equal(1);
  });

  it('should work with spaces in arguments', async () => {
    let cmd = getFixture("echo");
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should work with backslashes in arguments', async () => {
    let cmd = getFixture("echo");
    let echo1 = "my\\ name\\ is\\ bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should work with spaces in commands', async () => {
    let cmd = getFixture("echo with space");
    let echo1 = "bobbob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should work with spaces in commands and arguments', async () => {
    let cmd = getFixture("echo with space");
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should respect cwd', async () => {
    let cmd = system.isWindows() ? "echo.bat" : "./echo.sh";
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let cwd = path.dirname(getFixture("echo"));
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2], {cwd});
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should respect env', async () => {
    let cmd = getFixture("env");
    let env = {FOO: "lolol"};
    let {stdout, code} = await exec(cmd, [], {env});
    stdout.trim().should.equal(`${env.FOO} ${env.FOO}`);
    code.should.equal(0);
  });

  it('should allow a timeout parameter', async () => {
    let cmd = "sleep";
    let args = ["10"];
    let err;
    try {
      await exec(cmd, args, {timeout: 500});
    } catch (e) {
      err = e;
    }
    should.exist(err);
    err.message.should.contain("timed out");
    err.message.should.contain(cmd);
  });

  it('should allow large amounts of output', async function () {
    this.timeout(10000);
    let {stdout} = await exec(getFixture("bigbuffer.js"));
    stdout.length.should.be.above(512 * 1024);
  });

  it('should ignore output if requested', async () => {
    let cmd = getFixture("echo.sh");
    let echo1 = "my name is bob";
    let {stdout, code} = await exec(cmd, [echo1], {ignoreOutput: true});
    stdout.should.equal("");
    code.should.equal(0);
  });

  it('should return a Buffer if requested', async () => {
    let cmd = getFixture("echo.sh");
    let echo1 = "my name is bob";
    let {stdout, stderr, code} = await exec(cmd, [echo1], {isBuffer: true});
    _.isString(stdout).should.be.false;
    _.isBuffer(stdout).should.be.true;
    _.isString(stderr).should.be.false;
    _.isBuffer(stderr).should.be.true;
    code.should.equal(0);
  });

  describe('binary output', function () {
    const PNG_MAGIC = '89504e47';
    const PNG_MAGIC_LENGTH = 4;

    it('should allow binary output', async () => {
      let {stdout} = await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary'});
      _.isString(stdout).should.be.true;
      _.isBuffer(stdout).should.be.false;
      const signature = new Buffer(stdout, 'binary').toString('hex', 0, PNG_MAGIC_LENGTH);
      signature.should.eql(PNG_MAGIC);
    });

    it('should allow binary output as Buffer', async () => {
      let {stdout} = await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', isBuffer: true});
      _.isString(stdout).should.be.false;
      _.isBuffer(stdout).should.be.true;
      const signature = stdout.toString('hex', 0, PNG_MAGIC_LENGTH);
      signature.should.eql(PNG_MAGIC);
    });

    it('should allow binary output from timeout', async () => {
      try {
        await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', timeout: 1});
      } catch (err) {
        let stdout = err.stdout;
        _.isString(stdout).should.be.true;
        _.isBuffer(stdout).should.be.false;
      }
    });

    it('should allow binary output as Buffer from timeout', async () => {
      try {
        await exec('cat', [getFixture('screenshot.png')], {encoding: 'binary', timeout: 1, isBuffer: true});
      } catch (err) {
        let stdout = err.stdout;
        _.isString(stdout).should.be.false;
        _.isBuffer(stdout).should.be.true;
      }
    });
  });
});
