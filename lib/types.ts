import type {
    SpawnOptions,
    SpawnOptionsWithoutStdio
} from 'node:child_process';


export type TeenProcessLogger = {
  debug: (...args: any[]) => void;
};

export interface TeenProcessProps {
  ignoreOutput?: boolean | null;
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

export type BufferProp<T extends {isBuffer?: boolean}> = T['isBuffer'];

export type ExecResult<T extends boolean | undefined> = T extends true
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
