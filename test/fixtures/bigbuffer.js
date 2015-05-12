#!/usr/bin/env node

var MAX_BUFFER_BYTES = 512 * 1024;
var chars = parseInt(MAX_BUFFER_BYTES * 1.5, 10);
var asciiRange = [65, 110];
var ch;

for (var i = 0; i < chars; i++) {
  ch = (i % (asciiRange[1] - asciiRange[0])) + asciiRange[0];
  process.stdout.write(String.fromCharCode(ch));
}
