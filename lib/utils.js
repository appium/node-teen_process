import _ from 'lodash';
import { quote } from 'shell-quote';

/**
 * Add quotes to shell command arguments if the particular
 * argument contains one or more whitespace characters
 * and is not already quoted.
 *
 * @param {Array<*>|*} args [[]] - The array of arguments to be quoted
 *                                 or a single argument value
 *
 * @returns {Array<*>} The args array with quoted items.
 * Other items are simply left untouched.
 */
function quoteSpawnArguments (args = []) {
  if (_.isEmpty(args)) {
    return args;
  }
  if (!_.isArray(args)) {
    args = [args];
  }

  return args.map(arg => {
    if (_.isEmpty(arg)) {
      return arg;
    }

    // Only quote the argument if it contains whitespace character(s)
    if (/\s+/.test(`${arg}`) &&
        // ... and is not already quoted
        !(/^'/.test(`${arg}`) && /'$/.test(`${arg}`) || /^"/.test(`${arg}`) && /"$/.test(`${arg}`))) {
      return quote([arg]);
    }
    return arg;
  });
}

export { quoteSpawnArguments };
