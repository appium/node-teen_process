import { spawn } from 'child_process';
import { quote } from 'shell-quote';
import B from 'bluebird';
import _ from 'lodash';
import { formatEnoent } from './helpers';
import { CircularBuffer, MAX_BUFFER_SIZE } from './circular-buffer';

/**
 * Spawns a process
 * @template {TeenProcessExecOptions} T
 * @param {string} cmd - Program to execute
 * @param {string[]} [args] - Arguments to pass to the program
 * @param {T} [originalOpts] - Options
 * @returns {Promise<BufferProp<T> extends true ? TeenProcessExecBufferResult : TeenProcessExecStringResult>}
 */
async function exec (cmd, args = [], originalOpts = /** @type {T} */({})) {
  // get a quoted representation of the command for error strings
  const rep = quote([cmd, ...args]);

  // extend default options; we're basically re-implementing exec's options
  // for use here with spawn under the hood
  const opts = /** @type {T} */(_.defaults(originalOpts, {
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
  }));

  const isBuffer = Boolean(opts.isBuffer);

  // this is an async function, so return a promise
  return await new B((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    const proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env, shell: opts.shell});
    const stdoutBuffer = new CircularBuffer(opts.maxStdoutBufferSize);
    const stderrBuffer = new CircularBuffer(opts.maxStderrBufferSize);
    let timer = null;

    // if the process errors out, reject the promise
    proc.on('error', /** @param {NodeJS.ErrnoException} err */ async (err) => {
      if (err.code === 'ENOENT') {
        err = await formatEnoent(err, cmd, opts.cwd?.toString());
      }
      reject(err);
    });
    if (proc.stdin) {
      proc.stdin.on('error', /** @param {NodeJS.ErrnoException} err */(err) => {
        reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
      });
    }
    const handleStream = (/** @type {string} */ streamType, /** @type {CircularBuffer} */ buffer) => {
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
      proc[streamType].on('data', (/** @type {Buffer} */ chunk) => {
        buffer.add(chunk);
        if (opts.logger && _.isFunction(opts.logger.debug)) {
          opts.logger.debug(chunk.toString());
        }
      });
    };
    handleStream('stdout', stdoutBuffer);
    handleStream('stderr', stderrBuffer);

    /**
     * @template {boolean} U
     * @param {U} isBuffer
     * @returns {U extends true ? {stdout: Buffer, stderr: Buffer} : {stdout: string, stderr: string}}
     */
    function getStdio (isBuffer) {
      const stdout = isBuffer ? stdoutBuffer.value() : stdoutBuffer.value().toString(opts.encoding);
      const stderr = isBuffer ? stderrBuffer.value() : stderrBuffer.value().toString(opts.encoding);
      return /** @type {U extends true ? {stdout: Buffer, stderr: Buffer} : {stdout: string, stderr: string}} */(
        {stdout, stderr}
      );
    }

    // if the process ends, either resolve or reject the promise based on the
    // exit code of the process. either way, attach stdout, stderr, and code.
    // Also clean up the timer if it exists
    proc.on('close', (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      const {stdout, stderr} = getStdio(isBuffer);
      if (code === 0) {
        resolve(/** @type {BufferProp<T> extends true ? TeenProcessExecBufferResult : TeenProcessExecStringResult} */({stdout, stderr, code}));
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
        const {stdout, stderr} = getStdio(isBuffer);
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

/**
 * Options on top of `SpawnOptions`, unique to `teen_process.`
 * @typedef {Object} TeenProcessProps
 * @property {boolean} [ignoreOutput] - Ignore & discard all output
 * @property {boolean} [isBuffer] - Return output as a Buffer
 * @property {TeenProcessLogger} [logger] - Logger to use for debugging
 * @property {number} [maxStdoutBufferSize] - Maximum size of `stdout` buffer
 * @property {number} [maxStderrBufferSize] - Maximum size of `stderr` buffer
 * @property {BufferEncoding} [encoding='utf8'] - Encoding to use for output
 */

/**
 * A logger object understood by {@link exec teen_process.exec}.
 * @typedef {Object} TeenProcessLogger
 * @property {(...args: any[]) => void} debug
 */

/**
 * Options for {@link exec teen_process.exec}.
 * @typedef {import('child_process').SpawnOptions & TeenProcessProps} TeenProcessExecOptions
 */

/**
 * The value {@link exec teen_process.exec} resolves to when `isBuffer` is `false`
 * @typedef {Object} TeenProcessExecStringResult
 * @property {string} stdout - Stdout
 * @property {string} stderr - Stderr
 * @property {number?} code - Exit code
 */

/**
 * The value {@link exec teen_process.exec} resolves to when `isBuffer` is `true`
 * @typedef {Object} TeenProcessExecBufferResult
 * @property {Buffer} stdout - Stdout
 * @property {Buffer} stderr - Stderr
 * @property {number?} code - Exit code
 */

/**
 * Extra props {@link exec teen_process.exec} adds to its error objects
 * @typedef {Object} TeenProcessExecErrorProps
 * @property {string} stdout - STDOUT
 * @property {string} stderr - STDERR
 * @property {number?} code - Exit code
 */

/**
 * Error thrown by {@link exec teen_process.exec}
 * @typedef {Error & TeenProcessExecErrorProps} TeenProcessExecError
 */

/**
 * @template {{isBuffer?: boolean}} MaybeBuffer
 * @typedef {MaybeBuffer['isBuffer']} BufferProp
 * @private
 */
