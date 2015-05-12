node-teen_process
=================

A grown-up version of Node's child_process. `exec` is really useful, but it
suffers many limitations. This is an es7 (`async`/`await`) implementation of
`exec` that uses `spawn` under the hood. It takes care of wrapping commands and
arguments so we don't have to care about escaping spaces. It can also return
stdout/stderr even when the command fails, or times out. Importantly, it's also
not susceptible to max buffer issues.

Examples:

```js
import { exec } from 'teen_process';

// basic usage
let {stdout, stderr, code} = await exec('ls', ['/usr/local/bin']);
console.log(stdout.split("\n"));  // array of files
console.log(stderr);              // ''
console.log(code);                // 0

// works with spaces
let res = await exec('/command/with spaces.sh', ['foo', 'argument with spaces'])
// as though we had run: "/command/with spaces.sh" foo "argument with spaces"

// takes options cwd, env, timeout, and killSignal
await exec('sleep', ['10'], {timeout: 500, killSignal: 'SIGINT'});

// defaults:
// {
//   cwd: undefined,
//   env: process.env,
//   timeout: null,
//   killSignal: 'SIGTERM'
// }
