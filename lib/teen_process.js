import { spawn } from 'child_process';
import { quote } from 'shell-quote';
import events from 'events';
import through from 'through';
const { EventEmitter } = events;

function exec (cmd, args = [], opts = {}) {
  // get a quoted representation of the command for error strings
  let rep = quote([cmd].concat(args));

  // extend default options; we're basically re-implementing exec's options
  // for use here with spawn under the hood
  opts = Object.assign({
    timeout: null,
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    cwd: undefined,
    env: process.env,
    ignoreOutput: false,
    stdio: "inherit",
  }, opts);

  // this is an async function, so return a promise
  return new Promise((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    let proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env});
    let stdout = "", stderr = "", timer = null;

    // if the process errors out, reject the promise
    proc.on('error', (err) => {
      let msg = `Command '${rep}' errored out: ${err.stack}`;
      if (err.errno === 'ENOENT') {
        msg = `Command '${cmd}' not found. Is it installed?`;
      }
      reject(new Error(msg));
    });
    proc.stdin.on('error', (err) => {
      reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
    });
    proc.stdout.on('error', (err) => {
      reject(new Error(`Standard output '${err.syscall}' error: ${err.stack}`));
    });
    proc.stderr.on('error', (err) => {
      reject(new Error(`Standard error '${err.syscall}' error: ${err.stack}`));
    });

    // keep track of stdout/stderr if we haven't said not to
    if (!opts.ignoreOutput) {
      proc.stdout.on('data', (data) => {
        stdout += data;
      });
      proc.stderr.on('data', (data) => {
        stderr += data;
      });
    }

    // if the process ends, either resolve or reject the promise based on the
    // exit code of the process. either way, attach stdout, stderr, and code.
    // Also clean up the timer if it exists
    proc.on('close', (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      stdout = stdout.toString(opts.encoding);
      stderr = stderr.toString(opts.encoding);
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
        stdout = stdout.toString(opts.encoding);
        stderr = stderr.toString(opts.encoding);
        let err = new Error(`Command '${rep}' timed out after ${opts.timeout}` +
                            `ms`);
        err = Object.assign(err, {stdout, stderr, code: null});
        reject(err);
        // reject and THEN kill to avoid race conditions with the handlers
        // above
        proc.kill(opts.killSignal);
      }, opts.timeout);
    }
  });
}

class SubProcess extends EventEmitter {
  constructor (cmd, args = [], opts = {}) {
    super();
    if (!cmd) throw new Error("Command is required");
    if (typeof cmd !== "string") throw new Error("Command must be a string");
    if (!(args instanceof Array)) throw new Error("Args must be an array");
    this.cmd = cmd;
    this.args = args;
    this.proc = null;
    this.opts = opts;
  }

  get isRunning () {
    // presence of `proc` means we have connected and started
    return !!this.proc;
  }

  // spawn the subprocess and return control whenever we deem that it has fully
  // "started"
  async start (startDetector = null, timeoutMs = null) {
    let startDelay = 10;

    // the default start detector simply returns true when we get any output
    if (startDetector === null) {
      startDetector = (stdout, stderr) => {
        return stdout || stderr;
      };
    }

    // if the user passes a number, then we simply delay a certain amount of
    // time before returning control, rather than waiting for a condition
    if (typeof startDetector === 'number') {
      startDelay = startDetector;
      startDetector = null;
    }

    // return a promise so we can wrap the async behavior
    return new Promise((resolve, reject) => {
      try {
        // actually spawn the subproc
        this.proc = spawn(this.cmd, this.args, this.opts);
      } catch (e) {
        reject(e);
      }
      if (this.proc.stdout) {
        this.proc.stdout.setEncoding(this.opts.encoding || 'utf8');
      }
      if (this.proc.stderr) {
        this.proc.stderr.setEncoding(this.opts.encoding || 'utf8');
      }
      this.lastLinePortion = {stdout: "", stderr: ""};

      // this function handles output that we collect from the subproc
      const handleOutput = (data) => {
        // if we have a startDetector, run it on the output so we can resolve/
        // reject and move on from start
        try {
          if (startDetector && startDetector(data.stdout, data.stderr)) {
            startDetector = null;
            resolve();
          }
        } catch (e) {
          reject(e);
        }

        // emit the actual output for whomever's listening
        this.emit('output', data.stdout, data.stderr);

        // we also want to emit lines, but it's more complex since output
        // comes in chunks and a line could come in two different chunks, so
        // we have logic to handle that case (using this.lastLinePortion to
        // remember a line that started but did not finish in the last chunk)
        for (let stream of ['stdout', 'stderr']) {
          if (!data[stream]) continue;
          let lines = data[stream].split("\n");
          if (lines.length > 1) {
            let retLines = lines.slice(0, -1);
            retLines[0] = this.lastLinePortion[stream] + retLines[0];
            this.lastLinePortion[stream] = lines[lines.length - 1];
            this.emit(`lines-${stream}`, retLines);
          } else {
            this.lastLinePortion[stream] += lines[0];
          }
        }
      };

      // if we get an error spawning the proc, reject and clean up the proc
      this.proc.on('error', err => {
        this.proc.removeAllListeners('exit');
        this.proc.kill('SIGINT');

        if (err.errno === 'ENOENT') {
          err = new Error(`Command '${this.cmd}' not found. Is it installed?`);
        }
        reject(err);
      });

      this.proc.stdout.pipe(through(stdout => {
        handleOutput({stdout, stderr: ''});
      }));

      this.proc.stderr.pipe(through(stderr => {
        handleOutput({stdout: '', stderr});
      }));

      // when the proc exits, we might still have a buffer of lines we were
      // waiting on more chunks to complete. Go ahead and emit those, then
      // re-emit the exit so a listener can handle the possibly-unexpected exit
      this.proc.on('exit', (code, signal) => {
        this.handleLastLines();
        this.emit('exit', code, signal);
        this.proc = null;
      });

      // if the user hasn't given us a startDetector, instead just resolve
      // when startDelay ms have passed
      if (!startDetector) {
        setTimeout(() => {
          resolve();
        }, startDelay);
      }

      // if the user has given us a timeout, start the clock for rejecting
      // the promise if we take too long to start
      if (typeof timeoutMs === "number") {
        setTimeout(() => {
          reject(new Error("The process did not start in the allotted time " +
                           `(${timeoutMs}ms)`));
        }, timeoutMs);
      }
    });
  }

  handleLastLines () {
    for (let stream of ['stdout', 'stderr']) {
      if (this.lastLinePortion[stream]) {
        this.emit(`lines-${stream}`, [this.lastLinePortion[stream]]);
        this.lastLinePortion[stream] = '';
      }
    }
  }

  async stop (signal = 'SIGTERM', timeout = 10000) {
    if (!this.isRunning) {
      throw new Error(`Can't stop process; it's not currently running (cmd: '${this.cmd}')`);
    }
    // make sure to emit any data in our lines buffer whenever we're done with
    // the proc
    this.handleLastLines();
    return new Promise((resolve, reject) => {
      this.proc.on('close', resolve);
      this.proc.kill(signal);
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms`));
      }, timeout);
    });
  }

  async join (allowedExitCodes = [0]) {
    if (!this.isRunning) {
      throw new Error("Can't join process; it's not currently running");
    }

    return new Promise((resolve, reject) => {
      this.proc.on('exit', (code) => {
        if (allowedExitCodes.indexOf(code) === -1) {
          reject(new Error(`Process ended with exitcode ${code}`));
        } else {
          resolve(code);
        }
      });
    });
  }
}

export { exec, spawn, SubProcess };
