import type {SpawnOptions} from 'node:child_process';

/**
 * Minimal logger interface used by teen_process for debug output.
 */
export type TeenProcessLogger = {
  /** Called for each debug message emitted by exec/SubProcess. */
  debug: (...args: any[]) => void;
};

/**
 * Extra options supported by teen_process on top of Node's SpawnOptions.
 */
export interface TeenProcessProps {
  /** Ignore and discard all child stdout/stderr (reduces memory use). */
  ignoreOutput?: boolean;
  /** When true, exec/SubProcess emits Buffers; otherwise strings (default). */
  isBuffer?: boolean;
  /** Optional logger for streaming debug output. */
  logger?: TeenProcessLogger;
  /** Maximum bytes retained in the stdout circular buffer. */
  maxStdoutBufferSize?: number;
  /** Maximum bytes retained in the stderr circular buffer. */
  maxStderrBufferSize?: number;
  /** Encoding used when returning string output (default: 'utf8'). */
  encoding?: BufferEncoding;
}

/** Options accepted by exec (SpawnOptions + teen_process props). */
export type TeenProcessExecOptions = SpawnOptions & TeenProcessProps;

/** Additional properties attached to exec errors. */
export type TeenProcessExecErrorProps = {
  stdout: string;
  stderr: string;
  code: number | null;
};

/** Error thrown by exec on non-zero exit or timeout. */
export type ExecError = Error & TeenProcessExecErrorProps;

/**
 * Extracts the isBuffer property from options.
 */
export type BufferProp<T extends {isBuffer?: boolean}> = T['isBuffer'] extends true ? Buffer : string;

/**
 * Resolves to the correct exec result shape based on buffer mode.
 * Defaults to string output when isBuffer is false/undefined.
 */
export type TeenProcessExecResult<T extends string | Buffer> = {
  stdout: T;
  stderr: T;
  code: number | null;
};

/** Supported stdio stream names. */
export type StreamName = 'stdout' | 'stderr';

/** Additional SubProcess-only options. */
export type SubProcessCustomOptions = {
  /** When true, SubProcess emits Buffers instead of strings. */
  isBuffer?: boolean;
  /** Encoding used when isBuffer is false. */
  encoding?: BufferEncoding;
};

/** Options accepted by SubProcess (extends spawn options). */
export type SubProcessOptions = SubProcessCustomOptions & SpawnOptions;

/** Helper type representing SubProcess buffer mode. */
export type TIsBufferOpts = {
  isBuffer: true;
};

/**
 * Function that detects when a subprocess has started.
 * Receives stdout/stderr as Buffer when isBuffer is true, otherwise strings.
 */
export type StartDetector<T extends SubProcessOptions> = (
  stdout: T extends TIsBufferOpts ? Buffer : string,
  stderr?: T extends TIsBufferOpts ? Buffer : string,
) => unknown;
