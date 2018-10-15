"use strict";

const gulp = require('gulp');
const config = require('./tsconfig.json').compilerOptions;
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

// make sure we use typescript local to this package, not gulp plugins package
config.typescript = require('typescript');

boilerplate({
  build: 'teen_process',
  typescript: true,
  tsConfig: config,
  tslint: true
});
