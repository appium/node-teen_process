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
    ignoreOutput: false
  }, opts);

  // this is an async function, so return a promise
  return new Promise((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    let proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env});
    let stdout = "", stderr = "", timer = null;

    // if the process errors out, reject the promise
    proc.on('error', (err) => {
      reject(new Error(`Command '${rep}' errored out: ${err.stack}`));
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
  constructor (cmd, args = []) {
    super();
    if (!cmd) throw new Error("Command is required");
    if (typeof cmd !== "string") throw new Error("Command must be a string");
    if (!(args instanceof Array)) throw new Error("Args must be an array");
    this.cmd = cmd;
    this.args = args;
    this.proc = null;
  }

  async start (startDetector = null) {
    let startDelay = 10;

    // the default start detector is that we get any output
    if (startDetector === null) {
      startDetector = (stdout, stderr) => {
        return stdout || stderr;
      };
    }

    // if the user passes a number, then we simply delay a certain amount of
    // time before returning control
    if (typeof startDetector === 'number') {
      startDelay = startDetector;
      startDetector = null;
    }

    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn(this.cmd, this.args);
      } catch (e) {
        reject(e);
      }
      this.proc.stdout.setEncoding('utf8');
      this.proc.stderr.setEncoding('utf8');
      this.lastLinePortion = {stdout: "", stderr: ""};

      const handleOutput = (data) => {
        try {
          if (startDetector && startDetector(data.stdout, data.stderr)) {
            resolve();
          }
        } catch (e) {
          reject(e);
        }
        this.emit('output', data.stdout, data.stderr);
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

      this.proc.on('error', err => {
        this.proc.removeAllListeners('exit');
        this.proc.kill('SIGINT');
        reject(err);
      });

      this.proc.stdout.pipe(through(stdout => {
        handleOutput({stdout, stderr: ''});
      }));

      this.proc.stderr.pipe(through(stderr => {
        handleOutput({stdout: '', stderr});
      }));

      this.proc.on('exit', (code, signal) => {
        this.handleLastLines();
        this.emit('exit', code, signal);
        this.proc = null;
      });

      if (!startDetector) {
        setTimeout(() => {
          resolve();
        }, startDelay);
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
    if (!this.proc) {
      throw new Error("Can't stop process; it's not currently running");
    }
    this.handleLastLines();
    return new Promise((resolve, reject) => {
      this.proc.on('close', resolve);
      this.proc.kill(signal);
      setTimeout(() => {
        reject(new Error(`Process didn't end after ${timeout}ms`));
      }, timeout);
    });
  }
}

export { exec, spawn, SubProcess };
