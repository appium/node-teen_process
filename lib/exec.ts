import { spawn } from 'child_process';
import { quote } from 'shell-quote';
import B from 'bluebird';

interface ExecOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: string;
  timeout?: number;
  encoding?: string;
  killSignal?: string;
  ignoreOutput?: boolean;
  stdio?: string[] | number[] | string;
  isBuffer?: boolean;
}

interface ExecResponse {
  stdout: string | Buffer;
  stderr: string | Buffer;
  code: number;
}

class ExecError extends Error implements ExecResponse {
  stdout: string | Buffer = null;
  stderr: string | Buffer = null;
  code: number = null;

  constructor (message: string) {
    super(message);
  }
}

const defaultExecOpts: ExecOpts = {
  timeout: null,
  encoding: 'utf8',
  killSignal: 'SIGTERM',
  cwd: undefined,
  env: process.env,
  ignoreOutput: false,
  stdio: "inherit",
  isBuffer: false,
  shell: undefined,
};

function exec (cmd: string, args: string[] = [], opts: ExecOpts = defaultExecOpts) {
  // get a quoted representation of the command for error strings
  const rep = quote([cmd, ...args]);

  // extend default options; we're basically re-implementing exec's options
  // for use here with spawn under the hood
  opts = {
    ...defaultExecOpts,
    ...opts
  };

  // this is an async function, so return a promise
  return new B<ExecResponse>((resolve, reject) => {
    // spawn the child process with options; we don't currently expose any of
    // the other 'spawn' options through the API
    let proc = spawn(cmd, args, {cwd: opts.cwd, env: opts.env, shell: opts.shell});
    let stdoutArr: Buffer[] = [];
    let stderrArr: Buffer[] = [];
    let timer: NodeJS.Timer = null;

    // if the process errors out, reject the promise
    proc.on('error', (err: NodeJS.ErrnoException) => {
      let msg = `Command '${rep}' errored out: ${err.stack}`;
      if (err.code === 'ENOENT') {
        msg = `Command '${cmd}' not found. Is it installed?`;
      }
      reject(new Error(msg));
    });
    if (proc.stdin) {
      proc.stdin.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Standard input '${err.syscall}' error: ${err.stack}`));
      });
    }
    if (proc.stdout) {
      proc.stdout.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Standard output '${err.syscall}' error: ${err.stack}`));
      });
    }
    if (proc.stderr) {
      proc.stderr.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Standard error '${err.syscall}' error: ${err.stack}`));
      });
    }

    // keep track of stdout/stderr if we haven't said not to
    if (!opts.ignoreOutput) {
      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdoutArr.push(data);
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderrArr.push(data);
        });
      }
    }

    function getStdio (isBuffer: boolean) {
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
      let response: ExecResponse = {stdout, stderr, code};
      if (code === 0) {
        resolve(response);
      } else {
        let err = new Error(`Command '${rep}' exited with code ${code}`);
        err = {...err, ...response};
        reject(err);
      }
    });

    // if we set a timeout on the child process, cut into the execution and
    // reject if the timeout is reached. Attach the stdout/stderr we currently
    // have in case it's helpful in debugging
    if (opts.timeout) {
      timer = setTimeout(() => {
        let {stdout, stderr} = getStdio(opts.isBuffer);
        let err = new ExecError(`Command '${rep}' timed out after ${opts.timeout}ms`);
        err.stdout = stdout, err.stderr = stderr, err.code = null;
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
