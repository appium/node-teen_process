#!/usr/bin/env node

const MAX_BUFFER_BYTES = 512 * 1024;
const chars = parseInt(MAX_BUFFER_BYTES * 1.5, 10);
const asciiRange = [65, 110];

let ch;
for (let i = 0; i < chars; i++) {
  ch = (i % (asciiRange[1] - asciiRange[0])) + asciiRange[0];
  process.stdout.write(String.fromCharCode(ch));
}
