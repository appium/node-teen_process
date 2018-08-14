/* eslint-disable promise/prefer-await-to-callbacks */

import { spawn } from 'child_process';
import { quote } from 'shell-quote';
import B from 'bluebird';


function exec (cmd, args = [], opts = {}) {
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
    stdio: "inherit",
    isBuffer: false,
    shell: undefined,
  }, opts);

  // this is an async function, so return a promise
  return new B((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    let proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env, shell: opts.shell});
    let stdoutArr = [], stderrArr = [], timer = null;

    // if the process errors out, reject the promise
    proc.on('error', (err) => {
      let msg = `Command '${rep}' errored out: ${err.stack}`;
      if (err.errno === 'ENOENT') {
        msg = `Command '${cmd}' not found. Is it installed?`;
      }
      reject(new Error(msg));
    });
    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
      });
    }
    if (proc.stdout) {
      proc.stdout.on('error', (err) => {
        reject(new Error(`Standard output '${err.syscall}' error: ${err.stack}`));
      });
    }
    if (proc.stderr) {
      proc.stderr.on('error', (err) => {
        reject(new Error(`Standard error '${err.syscall}' error: ${err.stack}`));
      });
    }

    // keep track of stdout/stderr if we haven't said not to
    if (!opts.ignoreOutput) {
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdoutArr.push(data);
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderrArr.push(data);
        });
      }
    }

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
