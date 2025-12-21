import {spawn} from 'node:child_process';
import {quote} from 'shell-quote';
import B from 'bluebird';
import _ from 'lodash';
import {formatEnoent} from './helpers';
import {CircularBuffer, MAX_BUFFER_SIZE} from './circular-buffer';
import type {
  TeenProcessExecOptions,
  TeenProcessExecResult,
  BufferProp,
  ExecError,
  StreamName
} from './types';


/**
 * Spawns a child process and collects its output.
 *
 * This is a promisified version of Node's spawn that collects stdout and stderr,
 * handles timeouts, and provides error context.
 *
 * @template T - The options type extending TeenProcessExecOptions
 * @param cmd - The command to execute
 * @param args - Array of arguments to pass to the command (default: [])
 * @param originalOpts - Execution options including timeout, encoding, environment, etc.
 * @returns Promise resolving to an object with stdout, stderr, and exit code
 *
 * @throws {ExecError} When the process exits with non-zero code or times out
 *
 * @example
 * ```typescript
 * // Simple execution
 * const {stdout, stderr, code} = await exec('ls', ['-la']);
 *
 * // With timeout and custom encoding
 * const result = await exec('long-running-cmd', [], {
 *   timeout: 5000,
 *   encoding: 'utf8',
 *   cwd: '/custom/path'
 * });
 *
 * // Return output as Buffer
 * const {stdout} = await exec('cat', ['image.png'], {isBuffer: true});
 * ```
 */
export async function exec<T extends TeenProcessExecOptions = TeenProcessExecOptions>(
  cmd: string,
  args: string[] = [],
  originalOpts: T = {} as T,
): Promise<TeenProcessExecResult<BufferProp<T>>> {
  // get a quoted representation of the command for error strings
  const rep = quote([cmd, ...args]);

  const defaults: TeenProcessExecOptions = {
    timeout: undefined,
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
  };

  const opts = _.defaults({}, originalOpts, defaults) as T;
  const isBuffer = Boolean(opts.isBuffer);

  return await new B<TeenProcessExecResult<BufferProp<T>>>((resolve, reject) => {
    const proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env, shell: opts.shell});
    const stdoutBuffer = new CircularBuffer(opts.maxStdoutBufferSize);
    const stderrBuffer = new CircularBuffer(opts.maxStderrBufferSize);
    let timer: NodeJS.Timeout | null = null;

    proc.on('error', async (err: NodeJS.ErrnoException) => {
      let error = err;
      if (error.code === 'ENOENT') {
        error = await formatEnoent(error, cmd, opts.cwd?.toString());
      }
      reject(error);
    });

    if (proc.stdin) {
      proc.stdin.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
      });
    }

    const handleStream = (streamType: StreamName, buffer: CircularBuffer) => {
      const stream = proc[streamType];
      if (!stream) {
        return;
      }

      stream.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`${_.capitalize(streamType)} '${err.syscall}' error: ${err.stack}`));
      });

      if (opts.ignoreOutput) {
        // https://github.com/nodejs/node/issues/4236
        stream.on('data', () => {});
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        buffer.add(chunk);
        if (opts.logger?.debug && _.isFunction(opts.logger.debug)) {
          opts.logger.debug(chunk.toString());
        }
      });
    };

    handleStream('stdout', stdoutBuffer);
    handleStream('stderr', stderrBuffer);

    function getStdio<U extends boolean>(
      wantBuffer: U,
    ): U extends true ? {stdout: Buffer; stderr: Buffer} : {stdout: string; stderr: string} {
      const stdout = wantBuffer ? stdoutBuffer.value() : stdoutBuffer.value().toString(opts.encoding);
      const stderr = wantBuffer ? stderrBuffer.value() : stderrBuffer.value().toString(opts.encoding);
      return {stdout, stderr} as U extends true
        ? {stdout: Buffer; stderr: Buffer}
        : {stdout: string; stderr: string};
    }

    proc.on('close', (code: number | null) => {
      if (timer) {
        clearTimeout(timer);
      }
      const {stdout, stderr} = getStdio(isBuffer);
      if (code === 0) {
        resolve({stdout, stderr, code} as TeenProcessExecResult<BufferProp<T>>);
      } else {
        const err = Object.assign(new Error(`Command '${rep}' exited with code ${code}`), {
          stdout,
          stderr,
          code,
        }) as ExecError;
        reject(err);
      }
    });

    if (opts.timeout) {
      timer = setTimeout(() => {
        const {stdout, stderr} = getStdio(isBuffer);
        const err = Object.assign(
          new Error(`Command '${rep}' timed out after ${opts.timeout}ms`),
          {stdout, stderr, code: null},
        ) as ExecError;
        reject(err);
        proc.kill(opts.killSignal ?? 'SIGTERM');
      }, opts.timeout);
    }
  });
}
