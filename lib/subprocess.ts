import {spawn, type ChildProcess, type SpawnOptionsWithoutStdio} from 'node:child_process';
import {EventEmitter} from 'node:events';
import B from 'bluebird';
import {quote} from 'shell-quote';
import _ from 'lodash';
import {formatEnoent} from './helpers';
import {createInterface} from 'node:readline';
import type {Readable} from 'node:stream';

type SubProcessCustomOptions = {
  isBuffer?: boolean;
  encoding?: BufferEncoding;
};

type SubProcessOptions = SubProcessCustomOptions & SpawnOptionsWithoutStdio;

type TIsBufferOpts = {
  isBuffer: true;
};

type StartDetector<T extends SubProcessOptions> = (
  stdout: T extends TIsBufferOpts ? Buffer : string,
  stderr?: T extends TIsBufferOpts ? Buffer : string,
) => unknown;

type StreamName = 'stdout' | 'stderr';

export class SubProcess<
  TSubProcessOptions extends SubProcessOptions = SubProcessOptions,
> extends EventEmitter {
  proc: ChildProcess | null;
  args: string[];
  cmd: string;
  opts: TSubProcessOptions;
  expectingExit: boolean;
  rep: string;

  constructor(cmd: string, args: string[] = [], opts?: TSubProcessOptions) {
    super();
    if (!cmd) {
        throw new Error('Command is required');
    };
    if (!_.isString(cmd)) {
        throw new Error('Command must be a string');
    };
    if (!_.isArray(args)) {
        throw new Error('Args must be an array');
    };

    this.cmd = cmd;
    this.args = args;
    this.proc = null;
    this.opts = opts ?? ({} as TSubProcessOptions);
    this.expectingExit = false;

    this.rep = quote([cmd, ...args]);
  }

  get isRunning(): boolean {
    return !!this.proc;
  }

  emitLines(streamName: StreamName, lines: Iterable<string> | string): void {
    const doEmit = (line: string) => this.emit('stream-line', `[${streamName.toUpperCase()}] ${line}`);

    if (_.isString(lines)) {
      doEmit(lines);
    } else {
      for (const line of lines) {
        doEmit(line);
      }
    }
  }

  async start(
    startDetector: StartDetector<TSubProcessOptions> | number | boolean | null = null,
    timeoutMs: number | boolean | null = null,
    detach = false,
  ): Promise<void> {
    let startDelay = 10;

    const genericStartDetector: StartDetector<TSubProcessOptions> = (stdout, stderr) => stdout || stderr;
    let detector: StartDetector<TSubProcessOptions> | null = null;

    if (startDetector === null) {
      detector = genericStartDetector;
    }

    if (_.isNumber(startDetector)) {
      startDelay = startDetector;
      detector = null;
    } else if (_.isFunction(startDetector)) {
      detector = startDetector;
    }

    if (_.isBoolean(startDetector) && startDetector) {
      if (!this.opts.detached) {
        throw new Error(`Unable to detach process that is not started with 'detached' option`);
      }
      detach = true;
      detector = genericStartDetector;
    } else if (_.isBoolean(timeoutMs) && timeoutMs) {
      if (!this.opts.detached) {
        throw new Error(`Unable to detach process that is not started with 'detached' option`);
      }
      detach = true;
      timeoutMs = null;
    }

    return await new B<void>((resolve, reject) => {
      this.proc = spawn(this.cmd, this.args, this.opts);

      const handleOutput = (streams: {
        stdout: TSubProcessOptions extends TIsBufferOpts ? Buffer : string;
        stderr: TSubProcessOptions extends TIsBufferOpts ? Buffer : string;
      }) => {
        const {stdout, stderr} = streams;

        try {
          if (detector && detector(stdout, stderr)) {
            detector = null;
            resolve();
          }
        } catch (e) {
          reject(e as Error);
        }

        this.emit('output', stdout, stderr);
      };

      this.proc.on('error', async (err: NodeJS.ErrnoException) => {
        this.proc?.removeAllListeners('exit');
        this.proc?.kill('SIGINT');

        let error = err;
        if (error.code === 'ENOENT') {
          error = await formatEnoent(error, this.cmd, this.opts?.cwd?.toString());
        }
        reject(error);

        this.proc?.unref();
        this.proc = null;
      });

      const handleStreamLines = (streamName: StreamName, input: Readable) => {
        const rl = createInterface({input});
        rl.on('line', (line) => {
          if (this.listenerCount(`lines-${streamName}`)) {
            this.emit(`lines-${streamName}`, [line]);
          }
          this.emit(`line-${streamName}`, line);
          if (this.listenerCount('stream-line')) {
            this.emitLines(streamName, line);
          }
        });
      };

      const isBuffer = Boolean(this.opts.isBuffer);
      const encoding = this.opts.encoding || 'utf8';

      if (this.proc.stdout) {
        this.proc.stdout.on('data', (chunk: Buffer) =>
          handleOutput({
            stdout: (isBuffer ? chunk : chunk.toString(encoding)) as TSubProcessOptions extends TIsBufferOpts
              ? Buffer
              : string,
            stderr: (isBuffer ? Buffer.alloc(0) : '') as TSubProcessOptions extends TIsBufferOpts ? Buffer : string,
          }),
        );
        handleStreamLines('stdout', this.proc.stdout);
      }

      if (this.proc.stderr) {
        this.proc.stderr.on('data', (chunk: Buffer) =>
          handleOutput({
            stdout: (isBuffer ? Buffer.alloc(0) : '') as TSubProcessOptions extends TIsBufferOpts ? Buffer : string,
            stderr: (isBuffer ? chunk : chunk.toString(encoding)) as TSubProcessOptions extends TIsBufferOpts
              ? Buffer
              : string,
          }),
        );
        handleStreamLines('stderr', this.proc.stderr);
      }

      this.proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.emit('exit', code, signal);

        let event: 'stop' | 'die' | 'end' = this.expectingExit ? 'stop' : 'die';
        if (!this.expectingExit && code === 0) {
          event = 'end';
        }
        this.emit(event, code, signal);

        this.proc = null;
        this.expectingExit = false;
      });

      if (!detector) {
        setTimeout(() => resolve(), startDelay);
      }

      if (_.isNumber(timeoutMs)) {
        setTimeout(() => {
          reject(new Error(`The process did not start within ${timeoutMs}ms (cmd: '${this.rep}')`));
        }, timeoutMs);
      }
    }).finally(() => {
      if (detach && this.proc) {
        this.proc.unref();
      }
    });
  }

  handleLastLines(): void {
    // noop for backward compatibility
  }

  async stop(signal: NodeJS.Signals = 'SIGTERM', timeout = 10000): Promise<void> {
    if (!this.isRunning) {
      throw new Error(`Can't stop process; it's not currently running (cmd: '${this.rep}')`);
    }
    return await new B<void>((resolve, reject) => {
      this.proc?.once('close', () => resolve());
      this.expectingExit = true;
      this.proc?.kill(signal);
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms (cmd: '${this.rep}')`));
      }, timeout).unref();
    });
  }

  async join(allowedExitCodes: number[] = [0]): Promise<number | null> {
    if (!this.isRunning) {
      throw new Error(`Cannot join process; it is not currently running (cmd: '${this.rep}')`);
    }

    return await new B<number | null>((resolve, reject) => {
      this.proc?.once('exit', (code: number | null) => {
        if (code !== null && allowedExitCodes.indexOf(code) === -1) {
          reject(new Error(`Process ended with exitcode ${code} (cmd: '${this.rep}')`));
        } else {
          resolve(code);
        }
      });
    });
  }

  detachProcess(): void {
    if (!this.opts.detached) {
      throw new Error(`Unable to detach process that is not started with 'detached' option`);
    }
    if (this.proc) {
      this.proc.unref();
    }
  }

  get pid(): number | null {
    return this.proc ? this.proc.pid || null : null;
  }
}

export default SubProcess;
export type {
  StartDetector,
  SubProcessCustomOptions,
  SubProcessOptions,
  TIsBufferOpts,
};
