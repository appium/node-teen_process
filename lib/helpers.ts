import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Decorates ENOENT error received from a spawn system call with a more descriptive message.
 * The error instance is mutated and returned for convenience.
 */
async function formatEnoent(
  error: NodeJS.ErrnoException,
  cmd: string,
  cwd?: string,
): Promise<NodeJS.ErrnoException> {
  if (cwd) {
    try {
      const stat = await fs.stat(cwd);
      if (!stat.isDirectory()) {
        error.message = `The working directory '${cwd}' of '${cmd}' is not a valid folder path`;
        return error;
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        error.message = `The working directory '${cwd}' of '${cmd}' does not exist`;
        return error;
      }
    }
  }

  const curDir = path.resolve(cwd ?? process.cwd());
  const pathMsg = process.env.PATH ?? 'which is not defined for the process';
  error.message = `'${cmd}' executable is not found neither in the process working folder (${curDir}) ` +
    `nor in any folders specified in the PATH environment variable (${pathMsg})`;
  return error;
}

export { formatEnoent };