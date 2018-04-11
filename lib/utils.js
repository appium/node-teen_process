import _ from 'lodash';
import { quote } from 'shell-quote';

function quoteSpawnArgument (arg) {
  if (_.isEmpty(arg)) {
    return arg;
  }

  if (/\s+/.test(`${arg}`) &&
      !(/^'/.test(`${arg}`) && /'$/.test(`${arg}`) || /^"/.test(`${arg}`) && /"$/.test(`${arg}`))) {
    return quote([arg]);
  }
  return arg;
}

export { quoteSpawnArgument };
