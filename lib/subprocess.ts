import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {EventEmitter} from 'node:events';
import B from 'bluebird';
import {quote} from 'shell-quote';
import _ from 'lodash';
import {formatEnoent} from './helpers';
import {createInterface} from 'node:readline';
import type {Readable} from 'node:stream';
import type {
    SubProcessOptions,
    StartDetector,
    TIsBufferOpts,
    StreamName
} from './types';

/**
 * A wrapper around Node's spawn that provides event-driven process management.
 *
 * Extends EventEmitter to provide real-time output streaming and lifecycle events.
 *
 * @template TSubProcessOptions - Options type extending SubProcessOptions
 *
 * @fires SubProcess#output - Emitted when stdout or stderr receives data
 * @fires SubProcess#line-stdout - Emitted for each line of stdout
 * @fires SubProcess#line-stderr - Emitted for each line of stderr
 * @fires SubProcess#lines-stdout - Legacy event emitting stdout lines (deprecated)
 * @fires SubProcess#lines-stderr - Legacy event emitting stderr lines (deprecated)
 * @fires SubProcess#stream-line - Emitted for combined stdout/stderr lines
 * @fires SubProcess#exit - Emitted when process exits
 * @fires SubProcess#stop - Emitted when process is stopped intentionally
 * @fires SubProcess#die - Emitted when process dies unexpectedly with non-zero code
 * @fires SubProcess#end - Emitted when process ends normally with code 0
 *
 * @example
 * ```typescript
 * const proc = new SubProcess('tail', ['-f', 'logfile.txt']);
 *
 * proc.on('output', (stdout, stderr) => {
 *   console.log('Output:', stdout);
 * });
 *
 * proc.on('line-stdout', (line) => {
 *   console.log('Line:', line);
 * });
 *
 * await proc.start();
 * // ... later
 * await proc.stop();
 * ```
 */
export class SubProcess<
  TSubProcessOptions extends SubProcessOptions = SubProcessOptions,
> extends EventEmitter {
  proc: ChildProcess | null;
  private args: string[];
  private cmd: string;
  private opts: TSubProcessOptions;
  private expectingExit: boolean;
  readonly rep: string;

  constructor(cmd: string, args: string[] = [], opts?: TSubProcessOptions) {
    super();

    if (!cmd) {
      throw new Error('Command is required');
    }

    if (!_.isString(cmd)) {
      throw new Error('Command must be a string');
    }

    if (!_.isArray(args)) {
      throw new Error('Args must be an array');
    }

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

  /**
   * Starts the subprocess and waits for it to be ready.
   *
   * @param startDetector - Function to detect when process is ready, number for delay in ms,
   *                        boolean true to detach immediately, or null for default behavior
   * @param timeoutMs - Maximum time to wait for process to start (in ms), or boolean true to detach
   * @param detach - Whether to detach the process (requires 'detached' option)
   *
   * @throws {Error} When process fails to start or times out
   *
   * @example
   * ```typescript
   * // Wait for any output
   * await proc.start();
   *
   * // Wait 100ms then continue
   * await proc.start(100);
   *
   * // Wait for specific output
   * await proc.start((stdout) => stdout.includes('Server ready'));
   *
   * // With timeout
   * await proc.start(null, 5000);
   * ```
   */
  async start(
    startDetector: StartDetector<TSubProcessOptions> | number | boolean | null = null,
    timeoutMs: number | boolean | null = null,
    detach: boolean = false,
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

  /**
   * Stops the running subprocess by sending a signal.
   *
   * @param signal - Signal to send to the process (default: 'SIGTERM')
   * @param timeout - Maximum time to wait for process to exit in ms (default: 10000)
   *
   * @throws {Error} When process is not running or doesn't exit within timeout
   *
   * @example
   * ```typescript
   * // Graceful stop with SIGTERM
   * await proc.stop();
   *
   * // Force kill with SIGKILL
   * await proc.stop('SIGKILL');
   *
   * // Custom timeout
   * await proc.stop('SIGTERM', 5000);
   * ```
   */
  async stop(signal: NodeJS.Signals = 'SIGTERM', timeout = 10000): Promise<void> {
    if (!this.isRunning) {
      throw new Error(`Can't stop process; it's not currently running (cmd: '${this.rep}')`);
    }
    return await new B<void>((resolve, reject) => {
      this.proc?.on('close', () => resolve());
      this.expectingExit = true;
      this.proc?.kill(signal);
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms (cmd: '${this.rep}')`));
      }, timeout).unref();
    });
  }

  /**
   * Waits for the process to exit and validates its exit code.
   *
   * @param allowedExitCodes - Array of acceptable exit codes (default: [0])
   * @returns Promise resolving to the exit code
   *
   * @throws {Error} When process is not running or exits with disallowed code
   *
   * @example
   * ```typescript
   * // Wait for successful exit (code 0)
   * const code = await proc.join();
   *
   * // Allow multiple exit codes
   * const code = await proc.join([0, 1, 2]);
   * ```
   */
  async join(allowedExitCodes: number[] = [0]): Promise<number | null> {
    if (!this.isRunning) {
      throw new Error(`Cannot join process; it is not currently running (cmd: '${this.rep}')`);
    }

    return await new B<number | null>((resolve, reject) => {
      this.proc?.on('exit', (code: number | null) => {
        if (code !== null && !allowedExitCodes.includes(code)) {
          reject(new Error(`Process ended with exitcode ${code} (cmd: '${this.rep}')`));
        } else {
          resolve(code);
        }
      });
    });
  }

  /**
   * Detaches the process so it continues running independently.
   *
   * The process must have been created with the 'detached' option.
   * Once detached, the process will not be killed when the parent exits.
   *
   * @throws {Error} When process was not created with 'detached' option
   */
  detachProcess(): void {
    if (!this.opts.detached) {
      throw new Error(`Unable to detach process that is not started with 'detached' option`);
    }
    if (this.proc) {
      this.proc.unref();
    }
  }

  get pid(): number | null {
    return this.proc?.pid ?? null;
  }

  private emitLines(streamName: StreamName, lines: Iterable<string> | string): void {
    const doEmit = (line: string) => this.emit('stream-line', `[${streamName.toUpperCase()}] ${line}`);

    if (_.isString(lines)) {
      doEmit(lines);
    } else {
      for (const line of lines) {
        doEmit(line);
      }
    }
  }
}
