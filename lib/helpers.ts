import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Enhances ENOENT errors from spawn with descriptive messages.
 *
 * This is an internal helper that mutates the error object to provide context about:
 * - Invalid working directory paths
 * - Missing executables in PATH
 *
 * @param error - The original ENOENT error from spawn
 * @param cmd - The command that was attempted to execute
 * @param cwd - The working directory used (if any)
 * @returns The same error object with an enhanced message
 *
 * @internal
 */
export async function formatEnoent(
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
