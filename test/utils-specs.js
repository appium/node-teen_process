// transpile:mocha

import { quoteSpawnArgument } from '../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { quote } from 'shell-quote';

const should = chai.should();
chai.use(chaiAsPromised);

describe('utils', function () {
  describe('quoteSpawnArgument', function () {
    it('should properly quote arguments with non-literal chars', async function () {
      const args = ['arg_without_spaces', 'arg with spaces'];
      const quotedArgs = args.map(arg => quoteSpawnArgument(arg));
      quotedArgs.should.eql(['arg_without_spaces', quote(['arg with spaces'])]);
    });

    it('should skip arguments quoted with double quote char', async function () {
      const args = ['arg_without_spaces', '"quoted arg with spaces"'];
      const quotedArgs = args.map(arg => quoteSpawnArgument(arg));
      quotedArgs.should.eql(['arg_without_spaces', '"quoted arg with spaces"']);
    });

    it('should skip arguments quoted with single quote char', async function () {
      const args = ['arg_without_spaces', '\"quoted arg with spaces\"'];
      const quotedArgs = args.map(arg => quoteSpawnArgument(arg));
      quotedArgs.should.eql(['arg_without_spaces', '\"quoted arg with spaces\"']);
    });

    it('should skip invalid arguments', async function () {
      const args = ['arg_without_spaces', null];
      const quotedArgs = args.map(arg => quoteSpawnArgument(arg));
      quotedArgs.should.eql(['arg_without_spaces', null]);
    });
  });
});
