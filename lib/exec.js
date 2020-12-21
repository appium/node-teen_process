/* eslint-disable promise/prefer-await-to-callbacks */

import { spawn } from 'child_process';
import { quote } from 'shell-quote';
import B from 'bluebird';
import _ from 'lodash';
import { formatEnoent } from './helpers';

const MAX_BUFFER_SIZE = 100 * 1024 * 1024;

async function exec (cmd, args = [], opts = {}) {
  // get a quoted representation of the command for error strings
  const rep = quote([cmd, ...args]);

  // extend default options; we're basically re-implementing exec's options
  // for use here with spawn under the hood
  opts = Object.assign({
    timeout: null,
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    cwd: undefined,
    env: process.env,
    ignoreOutput: false,
    stdio: 'inherit',
    isBuffer: false,
    shell: undefined,
    logger: undefined,
    maxStdoutBufferSize: MAX_BUFFER_SIZE,
    maxStderrBufferSize: MAX_BUFFER_SIZE,
  }, opts);

  // this is an async function, so return a promise
  return await new B((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    let proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env, shell: opts.shell});
    let stdoutArr = [], stderrArr = [], timer = null;

    // if the process errors out, reject the promise
    proc.on('error', (err) => {
      if (err.errno === 'ENOENT') {
        err = formatEnoent(err, cmd, opts.cwd);
      }
      reject(err);
    });
    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
      });
    }
    const handleStream = (streamType, streamProps) => {
      if (!proc[streamType]) {
        return;
      }

      proc[streamType].on('error', (err) => {
        reject(new Error(`${_.capitalize(streamType)} '${err.syscall}' error: ${err.stack}`));
      });

      if (opts.ignoreOutput) {
        // https://github.com/nodejs/node/issues/4236
        proc[streamType].on('data', () => {});
        return;
      }

      // keep track of the stream if we don't want to ignore it
      const {chunks, maxSize} = streamProps;
      let size = 0;
      proc[streamType].on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        while (chunks.length > 1 && size >= maxSize) {
          size -= chunks[0].length;
          chunks.shift();
        }
        if (opts.logger && _.isFunction(opts.logger.debug)) {
          opts.logger.debug(chunk.toString());
        }
      });
    };
    handleStream('stdout', {
      maxSize: opts.maxStdoutBufferSize,
      chunks: stdoutArr,
    });
    handleStream('stderr', {
      maxSize: opts.maxStderrBufferSize,
      chunks: stderrArr,
    });

    function getStdio (isBuffer) {
      let stdout, stderr;
      if (isBuffer) {
        stdout = Buffer.concat(stdoutArr);
        stderr = Buffer.concat(stderrArr);
      } else {
        stdout = Buffer.concat(stdoutArr).toString(opts.encoding);
        stderr = Buffer.concat(stderrArr).toString(opts.encoding);
      }
      return {stdout, stderr};
    }

    // if the process ends, either resolve or reject the promise based on the
    // exit code of the process. either way, attach stdout, stderr, and code.
    // Also clean up the timer if it exists
    proc.on('close', (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      let {stdout, stderr} = getStdio(opts.isBuffer);
      if (code === 0) {
        resolve({stdout, stderr, code});
      } else {
        let err = new Error(`Command '${rep}' exited with code ${code}`);
        err = Object.assign(err, {stdout, stderr, code});
        reject(err);
      }
    });

    // if we set a timeout on the child process, cut into the execution and
    // reject if the timeout is reached. Attach the stdout/stderr we currently
    // have in case it's helpful in debugging
    if (opts.timeout) {
      timer = setTimeout(() => {
        let {stdout, stderr} = getStdio(opts.isBuffer);
        let err = new Error(`Command '${rep}' timed out after ${opts.timeout}ms`);
        err = Object.assign(err, {stdout, stderr, code: null});
        reject(err);
        // reject and THEN kill to avoid race conditions with the handlers
        // above
        proc.kill(opts.killSignal);
      }, opts.timeout);
    }
  });
}

export { exec };
export default exec;
