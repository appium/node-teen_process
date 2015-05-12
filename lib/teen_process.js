import cp from 'child_process';

const _spawn = cp.spawn;

function prepareCmd (cmd, args) {
  return [cmd, args];
}

function cmdRep (cmd, args) {
  return [cmd].concat(args).join(" ");
}

function exec (cmd, args = [], opts = {}) {
  [cmd, args] = prepareCmd(cmd, args);
  let rep = cmdRep(cmd, args);
  opts = Object.assign({
    timeout: null,
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    cwd: undefined,
    env: process.env
  }, opts);
  return new Promise((resolve, reject) => {
    let proc = _spawn(cmd, args, {cwd: opts.cwd, env: opts.env});
    let stdout = "", stderr = "";
    proc.on('error', (err) => {
      reject(new Error(`Command '${rep}' errored out: ${err.stack}`));
    });
    proc.stdout.on('data', (data) => {
      stdout += data;
    });
    proc.stderr.on('data', (data) => {
      stderr += data;
    });
    proc.on('close', (code) => {
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
    if (opts.timeout) {
      setTimeout(() => {
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

const spawn = _spawn;

export { exec, spawn };
