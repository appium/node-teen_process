import {spawn, type SpawnOptions} from 'node:child_process';
import {quote} from 'shell-quote';
import B from 'bluebird';
import _ from 'lodash';
import {formatEnoent} from './helpers';
import {CircularBuffer, MAX_BUFFER_SIZE} from './circular-buffer';

export type TeenProcessLogger = {
  debug: (...args: any[]) => void;
};

interface TeenProcessProps {
  ignoreOutput?: boolean;
  isBuffer?: boolean;
  logger?: TeenProcessLogger;
  maxStdoutBufferSize?: number;
  maxStderrBufferSize?: number;
  encoding?: BufferEncoding;
}

export type TeenProcessExecOptions = SpawnOptions & TeenProcessProps;

export type TeenProcessExecStringResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type TeenProcessExecBufferResult = {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
};

export type TeenProcessExecErrorProps = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type TeenProcessExecError = Error & TeenProcessExecErrorProps;

export type BufferProp<T extends {isBuffer?: boolean}> = T['isBuffer'];

type ExecResult<T extends boolean | undefined> = T extends true
  ? TeenProcessExecBufferResult
  : TeenProcessExecStringResult;

type StreamName = 'stdout' | 'stderr';

/**
 * Spawn a process and collect its output.
 */
export async function exec<T extends TeenProcessExecOptions = TeenProcessExecOptions>(
  cmd: string,
  args: string[] = [],
  originalOpts: T = {} as T,
): Promise<ExecResult<BufferProp<T>>> {
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

  return await new B<ExecResult<BufferProp<T>>>((resolve, reject) => {
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
        resolve({stdout, stderr, code} as ExecResult<BufferProp<T>>);
      } else {
        const err = Object.assign(new Error(`Command '${rep}' exited with code ${code}`), {
          stdout,
          stderr,
          code,
        }) as TeenProcessExecError;
        reject(err);
      }
    });

    if (opts.timeout) {
      timer = setTimeout(() => {
        const {stdout, stderr} = getStdio(isBuffer);
        const err = Object.assign(
          new Error(`Command '${rep}' timed out after ${opts.timeout}ms`),
          {stdout, stderr, code: null},
        ) as TeenProcessExecError;
        reject(err);
        proc.kill(opts.killSignal ?? 'SIGTERM');
      }, opts.timeout);
    }
  });
}

export default exec;
