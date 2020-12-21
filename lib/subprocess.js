/* eslint-disable promise/prefer-await-to-callbacks */

import { spawn } from 'child_process';
import events from 'events';
const { EventEmitter } = events;
import B from 'bluebird';
import { quote } from 'shell-quote';
import _ from 'lodash';
import { formatEnoent } from './helpers';


// This is needed to avoid memory leaks
// when the process output is too long and contains
// no line breaks
const MAX_LINE_PORTION_LENGTH = 0xFFFF;

function cutSuffix (str, suffixLength) {
  return str.length > suffixLength
    // https://bugs.chromium.org/p/v8/issues/detail?id=2869
    ? ` ${str.substr(str.length - suffixLength)}`.substr(1)
    : str;
}


class SubProcess extends EventEmitter {
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

  emitLines (stream, lines) {
    for (let line of lines) {
      this.emit('stream-line', `[${stream.toUpperCase()}] ${line}`);
    }
  }

  // spawn the subprocess and return control whenever we deem that it has fully
  // "started"
  async start (startDetector = null, timeoutMs = null, detach = false) {
    let startDelay = 10;

    const genericStartDetector = function genericStartDetector (stdout, stderr) {
      return stdout || stderr;
    };

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
      this.lastLinePortion = {stdout: '', stderr: ''};

      // this function handles output that we collect from the subproc
      const handleOutput = (streams) => {
        const {stdout, stderr} = streams;
        // if we have a startDetector, run it on the output so we can resolve/
        // reject and move on from start
        try {
          if (startDetector && startDetector(stdout, stderr)) {
            startDetector = null;
            resolve();
          }
        } catch (e) {
          reject(e);
        }

        // emit the actual output for whomever's listening
        this.emit('output', stdout, stderr);

        // we also want to emit lines, but it's more complex since output
        // comes in chunks and a line could come in two different chunks, so
        // we have logic to handle that case (using this.lastLinePortion to
        // remember a line that started but did not finish in the last chunk)
        for (const [streamName, streamData] of _.toPairs(streams)) {
          if (!streamData) continue; // eslint-disable-line curly
          const lines = streamData.split('\n')
            // https://bugs.chromium.org/p/v8/issues/detail?id=2869
            .map((x) => ` ${x}`.substr(1));
          if (lines.length > 1) {
            lines[0] = this.lastLinePortion[streamName] + lines[0];
            this.lastLinePortion[streamName] = cutSuffix(_.last(lines), MAX_LINE_PORTION_LENGTH);
            const resultLines = lines.slice(0, -1);
            this.emit(`lines-${streamName}`, resultLines);
            this.emitLines(streamName, resultLines);
          } else {
            const currentPortion = cutSuffix(lines[0], MAX_LINE_PORTION_LENGTH);
            if (this.lastLinePortion[streamName].length + currentPortion.length > MAX_LINE_PORTION_LENGTH) {
              this.lastLinePortion[streamName] = currentPortion;
            } else {
              this.lastLinePortion[streamName] += currentPortion;
            }
          }
        }
      };

      // if we get an error spawning the proc, reject and clean up the proc
      this.proc.on('error', (err) => {
        this.proc.removeAllListeners('exit');
        this.proc.kill('SIGINT');

        if (err.errno === 'ENOENT') {
          err = formatEnoent(err, this.cmd, this.opts?.cwd);
        }
        reject(err);
      });

      if (this.proc.stdout) {
        this.proc.stdout.on('data', (chunk) => handleOutput({stdout: chunk.toString(), stderr: ''}));
      }

      if (this.proc.stderr) {
        this.proc.stderr.on('data', (chunk) => handleOutput({stdout: '', stderr: chunk.toString()}));
      }

      // when the proc exits, we might still have a buffer of lines we were
      // waiting on more chunks to complete. Go ahead and emit those, then
      // re-emit the exit so a listener can handle the possibly-unexpected exit
      this.proc.on('exit', (code, signal) => {
        this.handleLastLines();

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

  handleLastLines () {
    for (let stream of ['stdout', 'stderr']) {
      if (this.lastLinePortion[stream]) {
        const lastLines = [this.lastLinePortion[stream]];
        this.emit(`lines-${stream}`, lastLines);
        this.emitLines(stream, lastLines);
        this.lastLinePortion[stream] = '';
      }
    }
  }

  async stop (signal = 'SIGTERM', timeout = 10000) {
    if (!this.isRunning) {
      throw new Error(`Can't stop process; it's not currently running (cmd: '${this.rep}')`);
    }
    // make sure to emit any data in our lines buffer whenever we're done with
    // the proc
    this.handleLastLines();
    return await new B((resolve, reject) => {
      this.proc.on('close', resolve);
      this.expectingExit = true;
      this.proc.kill(signal);
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms (cmd: '${this.rep}')`));
      }, timeout);
    });
  }

  async join (allowedExitCodes = [0]) {
    if (!this.isRunning) {
      throw new Error(`Cannot join process; it is not currently running (cmd: '${this.rep}')`);
    }

    return await new B((resolve, reject) => {
      this.proc.on('exit', (code) => {
        if (allowedExitCodes.indexOf(code) === -1) {
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
