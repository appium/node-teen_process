import type {
    SpawnOptions,
    SpawnOptionsWithoutStdio
} from 'node:child_process';


export type TeenProcessLogger = {
  debug: (...args: any[]) => void;
};

export interface TeenProcessProps {
  ignoreOutput?: boolean;
  isBuffer?: boolean;
  logger?: TeenProcessLogger;
  maxStdoutBufferSize?: number;
  maxStderrBufferSize?: number;
  encoding?: BufferEncoding;
}

export type TeenProcessExecOptions = SpawnOptions & TeenProcessProps;

export type TeenProcessExecStringResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type TeenProcessExecBufferResult = {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
};

export type TeenProcessExecErrorProps = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type TeenProcessExecError = Error & TeenProcessExecErrorProps;

/**
 * Extracts the isBuffer property from options, normalizing undefined/false to false.
 */
export type BufferProp<T extends {isBuffer?: boolean}> = T['isBuffer'] extends true ? true : false;

/**
 * Determines the result type based on whether isBuffer is true.
 * Defaults to string result when isBuffer is false or undefined.
 */
export type ExecResult<T extends boolean> = T extends true
  ? TeenProcessExecBufferResult
  : TeenProcessExecStringResult;

export type StreamName = 'stdout' | 'stderr';


export type SubProcessCustomOptions = {
  isBuffer?: boolean;
  encoding?: BufferEncoding;
};

export type SubProcessOptions = SubProcessCustomOptions & SpawnOptionsWithoutStdio;

export type TIsBufferOpts = {
  isBuffer: true;
};

export type StartDetector<T extends SubProcessOptions> = (
  stdout: T extends TIsBufferOpts ? Buffer : string,
  stderr?: T extends TIsBufferOpts ? Buffer : string,
) => unknown;
