import path from 'path';

/**
 * Decorates ENOENT error received from a spawn system call
 * with a more descriptive message, so it could be properly handled by a user.
 *
 * @param {NodeJS.ErrnoException} error Original error instance. !!! The instance is mutated after
 * this helper function invocation
 * @param {string} cmd Original command to execute
 * @param {string?} [cwd] Optional path to the current working dir
 * @returns {NodeJS.ErrnoException} Mutated error instance with an improved description or an
 * unchanged error instance
 */
function formatEnoent (error, cmd, cwd = null) {
  const curDir = path.resolve(cwd ?? process.cwd());
  const pathMsg = process.env.PATH ?? 'which is not defined for the process';
  error.message = `'${cmd}' executable is not found neither in the process working folder (${curDir}) ` +
    `nor in any folders specified in the PATH environment variable (${pathMsg})`;
  return error;
}

export { formatEnoent };
