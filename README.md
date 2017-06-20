node-teen_process
=================

A grown-up version of Node's child_process. `exec` is really useful, but it
suffers many limitations. This is an es7 (`async`/`await`) implementation of
`exec` that uses `spawn` under the hood. It takes care of wrapping commands and
arguments so we don't have to care about escaping spaces. It can also return
stdout/stderr even when the command fails, or times out. Importantly, it's also
not susceptible to max buffer issues.

### teen_process.exec

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

The `isBuffer` option specifies that the returned standard I/O is an instance
of a [Buffer](https://nodejs.org/api/buffer.html).

Example:

```js
let {stdout, stderr} = await exec('cat', [filename], {isBuffer: true});
Buffer.isBuffer(stdout); // true
```

### teen_process.SubProcess

`spawn` is already pretty great but for some uses there's a fair amount of
boilerplate, especially when using in an `async/await` context. `teen_process`
also exposes a `SubProcess` class, which can be used to cut down on some
boilerplate. It has 2 methods, `start` and `stop`:

```js
import { SubProcess } from 'teen_process';

async function tailFileForABit () {
  let proc = new SubProcess('tail', ['-f', '/var/log/foo.log']);
  await proc.start();
  await proc.stop();
}
```

Errors with start/stop are thrown in the calling context.

You can listen to 4 events, `output`, `exit`, `lines-stdout`, and
`lines-stderr`:

```js
proc.on('output', (stdout, stderr) => {
  console.log(`stdout: ${stdout}`);
  console.log(`stderr: ${stderr}`);
});

proc.on('exit', (code, signal) => {
  console.log(`exited with code ${code} from signal ${signal}`);
  // exited with code 127 from signal SIGHUP
});

// lines-stderr is just the same
proc.on('lines-stdout', lines => {
  console.log(lines);
  // ['foo', 'bar', 'baz']
  // automatically handles rejoining lines across stream chunks
});
```

How does `SubProcess` know when to return control from `start()`? Well, the
default is to wait until there is some output. You can also pass in a number,
which will cause it to wait for that number of ms, or a function (which I call
a `startDetector`) which takes stdout and stderr and returns true when you want
control back. Examples:

```js
await proc.start(); // will continue when stdout or stderr has received data
await proc.start(0); // will continue immediately

let sd = (stdout, stderr) => {
  return stderr.indexOf('blarg') !== -1;
};
await proc.start(sd); // will continue when stderr receives 'blarg'
```

A custom `startDetector` can also throw an error if it wants to declare the
start unsuccessful. For example, if we know that the first output might contain
a string which invalidates the process (for us), we could define a custom
`startDetector` as follows:

```js
let sd = (stdout, stderr) => {
  if (/fail/.test(stderr)) {
    throw new Error("Encountered failure condition");
  }
  return stdout || stderr;
};
await proc.start(sd); // will continue when output is received that doesn't
                      // match 'fail'
```

Finally, if you want to specify a maximum time to wait for a process to start,
you can do that by passing a second parameter in milliseconds to `start()`:

```js
// use the default startDetector and throw an error if we wait for more than
// 1000ms for output
await proc.start(null, 1000);
```

After the process has been started you can use `join()` to wait for it:

```js
await proc.join(); // will throw on exitcode not 0
await proc.join([0, 1]); // will throw on exitcode not 0 or 1
```

And how about killing the processes? Can you provide a custom signal, instead
of using the default `SIGTERM`? Why yes:

```js
await proc.stop('SIGHUP');
```

If your process might not be killable and you don't really care, you can also
pass a timeout, which will return control to you in the form of an error after
the timeout has passed:

```js
try {
  await proc.stop('SIGHUP', 1000);
} catch (e) {
  console.log("Proc failed to stop, ignoring cause YOLO");
}
```

All in all, this makes it super simple to, say, write a script that tails
a file for X seconds, using async/await and pretty straightforward error
handling.

```js
async function boredTail (filePath, boredAfter = 10000) {
  let p = new SubProcess('tail', ['-f', filePath]);
  p.on('output', stdout => {
    if (stdout) {
      console.log(`STDOUT: ${stdout.trim()}`);
    }
  });
  await p.start();
  await Bluebird.delay(boredAfter);
  await p.stop();
}
```
