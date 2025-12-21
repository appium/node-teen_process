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
const tp = {
  spawn: nodeSpawn,
  SubProcess: SubProcessClass,
  exec: execImpl,
};

export const exec = execImpl;

// Export SubProcess as a class that can be mocked
export const SubProcess = SubProcessClass;

// Export spawn as a wrapper that delegates to tp.spawn
export const spawn = nodeSpawn;

// Export the mockable object itself for direct stubbing
// Usage: import {tp} from 'teen_process'; sinon.stub(tp, 'exec');
// Or: import tp from 'teen_process'; sinon.stub(tp, 'exec');
export default tp;
export {tp};
