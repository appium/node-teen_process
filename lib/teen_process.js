import cp from 'child_process';
import { quote } from 'shell-quote';

const spawn = cp.spawn; // just alias and pass through for now

function cmdRep (cmd, args) {
  return quote([cmd].concat(args));
}

function exec (cmd, args = [], opts = {}) {
  // get a quoted representation of the command for error strings
  let rep = cmdRep(cmd, args);

  // extend default options; we're basically re-implementing exec's options
  // for use here with spawn under the hood
  opts = Object.assign({
    timeout: null,
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    cwd: undefined,
    env: process.env
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

    // keep track of stdout/stderr
    proc.stdout.on('data', (data) => {
      stdout += data;
    });
    proc.stderr.on('data', (data) => {
      stderr += data;
    });

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

export { exec, spawn };
