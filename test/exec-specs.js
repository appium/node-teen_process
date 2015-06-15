// transpile:mocha

import path from 'path';
import { exec } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import { getFixture } from './helpers';

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

  it('should throw an error with a bad exit code', async () => {
    let cmd = getFixture("bad_exit.sh");
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
    let cmd = getFixture("echo.sh");
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should work with backslashes in arguments', async () => {
    let cmd = getFixture("echo.sh");
    let echo1 = "my\\ name\\ is\\ bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should work with spaces in commands', async () => {
    let cmd = getFixture("echo with space.sh");
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2]);
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should respect cwd', async () => {
    let cmd = "./echo.sh";
    let echo1 = "my name is bob";
    let echo2 = "lol";
    let cwd = path.dirname(getFixture("echo.sh"));
    let {stdout, stderr, code} = await exec(cmd, [echo1, echo2], {cwd});
    stdout.trim().should.equal(echo1);
    stderr.trim().should.equal(echo2);
    code.should.equal(0);
  });

  it('should respect env', async () => {
    let cmd = getFixture("env.sh");
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

  it('should allow large amounts of output', async () => {
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
});

