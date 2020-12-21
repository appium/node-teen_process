import which from 'which';
import fs from 'fs';

/**
 * Decorates ENOENT error received from a spawn system call
 * with a more descriptive message, so it could be properly handled by a user.
 *
 * @param {!Error} error Original error instance. !!! The instance is mutated after
 * this helper function invocation
 * @param {!string} cmd Original command to execute
 * @param {?string} cwd Optional path to the current working dir
 * @return {Error} Mutated error instance with an improved description or an
 * unchanged error instance
 */
function formatEnoent (error, cmd, cwd = null) {
  try {
    which.sync(cmd);
    if (cwd) {
      try {
        fs.accessSync(cwd, fs.R_OK);
      } catch (ign) {
        error.message = `The current working directory '${cwd}' for '${cmd}' command ` +
          `either does not exist or is not accessible`;
      }
    }
  } catch (ign) {
    error.message = `Command '${cmd}' not found. Is it installed?`;
  }
  return error;
}

export { formatEnoent };
