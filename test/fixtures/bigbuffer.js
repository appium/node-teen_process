#!/usr/bin/env node
/* eslint-disable no-var */

const MAX_BUFFER_BYTES = 512 * 1024;
const chars = parseInt(MAX_BUFFER_BYTES * 1.5, 10);
const asciiRange = [65, 110];

var ch;
for (var i = 0; i < chars; i++) {
  ch = (i % (asciiRange[1] - asciiRange[0])) + asciiRange[0];
  process.stdout.write(String.fromCharCode(ch));
}
