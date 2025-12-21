import {spawn as nodeSpawn} from 'node:child_process';
import {SubProcess as SubProcessClass} from './subprocess';
import {exec as execImpl} from './exec';

export type {
  TeenProcessExecOptions,
  TeenProcessExecResult,
  ExecError,
  SubProcessOptions,
  TeenProcess,
} from './types';

// Mockable namespace object - this is mutable and can be stubbed in tests
export const exec = execImpl;
export const SubProcess = SubProcessClass;
export const spawn = nodeSpawn;
