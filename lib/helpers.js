import path from 'path';
import fs from 'fs/promises';

/**
 * Decorates ENOENT error received from a spawn system call
 * with a more descriptive message, so it could be properly handled by a user.
 *
 * @param {NodeJS.ErrnoException} error Original error instance. !!! The instance is mutated after
 * this helper function invocation
 * @param {string} cmd Original command to execute
 * @param {string?} [cwd] Optional path to the current working dir
 * @returns {Promise<NodeJS.ErrnoException>} Mutated error instance with an improved description or an
 * unchanged error instance
 */
async function formatEnoent (error, cmd, cwd = null) {
  if (cwd) {
    try {
      const stat = await fs.stat(cwd);
      if (!stat.isDirectory()) {
        error.message = `The working directory '${cwd}' of '${cmd}' is not a valid folder path`;
        return error;
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
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
