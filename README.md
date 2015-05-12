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
await exec('/command/with spaces.sh', ['foo', 'argument with spaces'])
// as though we had run: "/command/with spaces.sh" foo "argument with spaces"

// nice error handling that still includes stderr/stdout/code
try {
  await exec('echo_and_exit', ['foo', '10']);
} catch (e) {
  console.log(e.message);  // "Exited with code 10"
  console.log(e.stdout);   // "foo"
  console.log(e.code);     // 10
}
```

The `exec` function takes some options, with these defaults:

```js
{
  cwd: undefined,
  env: process.env,
  timeout: null,
  killSignal: 'SIGTERM',
  encoding: 'utf8',
  ignoreOutput: false
}
```

Most of these are self-explanatory. `ignoreOutput` is useful if you have a very
chatty process whose output you don't care about and don't want to add it to
the memory consumed by your program.

Example:

```js
try {
  await exec('sleep', ['10'], {timeout: 500, killSignal: 'SIGINT'});
} catch (e) {
  console.log(e.message);  // "'sleep 10' timed out after 500ms"
}
```
