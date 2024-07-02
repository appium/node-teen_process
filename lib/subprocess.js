import { spawn } from 'child_process';
import events from 'events';
const { EventEmitter } = events;
import B from 'bluebird';
import { quote } from 'shell-quote';
import _ from 'lodash';
import { formatEnoent } from './helpers';
import { createInterface } from 'node:readline';

class SubProcess extends EventEmitter {

  /** @type {import('child_process').ChildProcess?} */
  proc;

  /** @type {string[]} */
  args;

  /**
   * @type {string}
   */
  cmd;

  /**
   * @type {any}
  */
  opts;

  /**
   * @type {boolean}
   */
  expectingExit;

  /**
   * @type {string}
   */
  rep;

  /**
   * @param {string} cmd
   * @param {string[]} [args]
   * @param {any} [opts]
   */
  constructor (cmd, args = [], opts = {}) {
    super();
    if (!cmd) throw new Error('Command is required'); // eslint-disable-line curly
    if (!_.isString(cmd)) throw new Error('Command must be a string'); // eslint-disable-line curly
    if (!_.isArray(args)) throw new Error('Args must be an array'); // eslint-disable-line curly

    this.cmd = cmd;
    this.args = args;
    this.proc = null;
    this.opts = opts;
    this.expectingExit = false;

    // get a quoted representation of the command for error strings
    this.rep = quote([cmd, ...args]);
  }

  get isRunning () {
    // presence of `proc` means we have connected and started
    return !!this.proc;
  }

  /**
   *
   * @param {string} streamName
   * @param {Iterable<string>|string} lines
   */
  emitLines (streamName, lines) {
    const doEmit = (/** @type {string} */ line) => this.emit('stream-line', `[${streamName.toUpperCase()}] ${line}`);

    if (_.isString(lines)) {
      doEmit(lines);
    } else {
      for (const line of lines) {
        doEmit(line);
      }
    }
  }

  /**
   * spawn the subprocess and return control whenever we deem that it has fully
   * "started"
   *
   * @param {StartDetector|number?} startDetector
   * @param {number?} timeoutMs
   * @param {boolean} detach
   * @returns {Promise<void>}
   */
  async start (startDetector = null, timeoutMs = null, detach = false) {
    let startDelay = 10;

    const genericStartDetector = /** @type {StartDetector} */(function genericStartDetector (stdout, stderr) {
      return stdout || stderr;
    });

    // the default start detector simply returns true when we get any output
    if (startDetector === null) {
      startDetector = genericStartDetector;
    }

    // if the user passes a number, then we simply delay a certain amount of
    // time before returning control, rather than waiting for a condition
    if (_.isNumber(startDetector)) {
      startDelay = startDetector;
      startDetector = null;
    }

    // if the user passes in a boolean as one of the arguments, use it for `detach`
    if (_.isBoolean(startDetector) && startDetector) {
      if (!this.opts.detached) {
        throw new Error(`Unable to detach process that is not started with 'detached' option`);
      }
      detach = true;
      startDetector = genericStartDetector;
    } else if (_.isBoolean(timeoutMs) && timeoutMs) {
      if (!this.opts.detached) {
        throw new Error(`Unable to detach process that is not started with 'detached' option`);
      }
      detach = true;
      timeoutMs = null;
    }

    // return a promise so we can wrap the async behavior
    return await new B((resolve, reject) => {
      // actually spawn the subproc
      this.proc = spawn(this.cmd, this.args, this.opts);

      if (this.proc.stdout) {
        this.proc.stdout.setEncoding(this.opts.encoding || 'utf8');
      }
      if (this.proc.stderr) {
        this.proc.stderr.setEncoding(this.opts.encoding || 'utf8');
      }

      // this function handles output that we collect from the subproc
      /**
       *
       * @param { {stdout: string, stderr: string} } streams
       */
      const handleOutput = (streams) => {
        const {stdout, stderr} = streams;
        // if we have a startDetector, run it on the output so we can resolve/
        // reject and move on from start
        try {
          if (_.isFunction(startDetector) && startDetector(stdout, stderr)) {
            startDetector = null;
            resolve();
          }
        } catch (e) {
          reject(e);
        }

        // emit the actual output for whomever's listening
        this.emit('output', stdout, stderr);
      };

      // if we get an error spawning the proc, reject and clean up the proc
      this.proc.on('error', /** @param {NodeJS.ErrnoException} err */ async (err) => {
        this.proc?.removeAllListeners('exit');
        this.proc?.kill('SIGINT');

        if (err.code === 'ENOENT') {
          err = await formatEnoent(err, this.cmd, this.opts?.cwd);
        }
        reject(err);

        this.proc?.unref();
        this.proc = null;
      });

      const handleStreamLines = (/** @type {string} */ streamName, /** @type {import('stream').Readable} */ input) => {
        const rl = createInterface({input});
        rl.on('line', (line) => {
          // This event is a legacy one
          // It always produces a single-item array
          if (this.listenerCount(`lines-${streamName}`)) {
            this.emit(`lines-${streamName}`, [line]);
          }
          this.emit(`line-${streamName}`, line);
          if (this.listenerCount('stream-line')) {
            this.emitLines(streamName, line);
          }
        });
      };

      if (this.proc.stdout) {
        this.proc.stdout.on('data', (chunk) => handleOutput({stdout: chunk.toString(), stderr: ''}));
        handleStreamLines('stdout', this.proc.stdout);
      }

      if (this.proc.stderr) {
        this.proc.stderr.on('data', (chunk) => handleOutput({stdout: '', stderr: chunk.toString()}));
        handleStreamLines('stderr', this.proc.stderr);
      }

      // when the proc exits, we might still have a buffer of lines we were
      // waiting on more chunks to complete. Go ahead and emit those, then
      // re-emit the exit so a listener can handle the possibly-unexpected exit
      this.proc.on('exit', (code, signal) => {
        this.emit('exit', code, signal);

        // in addition to the bare exit event, also emit one of three other
        // events that contain more helpful information:
        // 'stop': we stopped this
        // 'die': the process ended out of our control with a non-zero exit
        // 'end': the process ended out of our control with a zero exit
        let event = this.expectingExit ? 'stop' : 'die';
        if (!this.expectingExit && code === 0) {
          event = 'end';
        }
        this.emit(event, code, signal);

        // finally clean up the proc and make sure to reset our exit
        // expectations
        this.proc = null;
        this.expectingExit = false;
      });

      // if the user hasn't given us a startDetector, instead just resolve
      // when startDelay ms have passed
      if (!startDetector) {
        setTimeout(() => { resolve(); }, startDelay);
      }

      // if the user has given us a timeout, start the clock for rejecting
      // the promise if we take too long to start
      if (_.isNumber(timeoutMs)) {
        setTimeout(() => {
          reject(new Error(`The process did not start within ${timeoutMs}ms ` +
            `(cmd: '${this.rep}')`));
        }, timeoutMs);
      }
    }).finally(() => {
      if (detach && this.proc) {
        this.proc.unref();
      }
    });
  }

  /**
   * @deprecated This method is deprecated and will be removed
   */
  handleLastLines () {
    // TODO: THis is a noop left for backward compatibility.
    // TODO: Remove it after the major version bump
  }

  /**
   *
   * @param {NodeJS.Signals} signal
   * @param {number} timeout
   * @returns {Promise<void>}
   */
  async stop (signal = 'SIGTERM', timeout = 10000) {
    if (!this.isRunning) {
      throw new Error(`Can't stop process; it's not currently running (cmd: '${this.rep}')`);
    }
    return await new B((resolve, reject) => {
      this.proc?.on('close', resolve);
      this.expectingExit = true;
      this.proc?.kill(signal);
      // this timeout needs unref() or node will wait for the timeout to fire before
      // exiting the process.
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms (cmd: '${this.rep}')`));
      }, timeout).unref();
    });
  }

  async join (allowedExitCodes = [0]) {
    if (!this.isRunning) {
      throw new Error(`Cannot join process; it is not currently running (cmd: '${this.rep}')`);
    }

    return await new B((resolve, reject) => {
      this.proc?.on('exit', (code) => {
        if (code !== null && allowedExitCodes.indexOf(code) === -1) {
          reject(new Error(`Process ended with exitcode ${code} (cmd: '${this.rep}')`));
        } else {
          resolve(code);
        }
      });
    });
  }

  /*
   * This will only work if the process is created with the `detached` option
   */
  detachProcess () {
    if (!this.opts.detached) {
      // this means that there is a misconfiguration in the calling code
      throw new Error(`Unable to detach process that is not started with 'detached' option`);
    }
    if (this.proc) {
      this.proc.unref();
    }
  }

  get pid () {
    return this.proc ? this.proc.pid : null;
  }
}

export { SubProcess };
export default SubProcess;

/**
 * @callback StartDetector
 * @param {string} stdout
 * @param {string} [stderr]
 * @returns {any}
 */
