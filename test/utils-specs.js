// transpile:mocha

import { quoteSpawnArguments } from '../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { quote } from 'shell-quote';

chai.use(chaiAsPromised);

describe('utils', function () {
  describe('quoteSpawnArgument', function () {
    it('should properly quote arguments with whitespace chars', function () {
      const quotedArgs = quoteSpawnArguments(['arg_without_spaces', 'arg with spaces']);
      quotedArgs.should.eql(['arg_without_spaces', quote(['arg with spaces'])]);
    });

    it('should skip arguments quoted with a double quote char', function () {
      const quotedArgs = quoteSpawnArguments(['arg_without_spaces', '"quoted arg with spaces"']);
      quotedArgs.should.eql(['arg_without_spaces', '"quoted arg with spaces"']);
    });

    it('should skip arguments quoted with a single quote char', function () {
      const quotedArgs = quoteSpawnArguments(['arg_without_spaces', '\'quoted arg with spaces\'']);
      quotedArgs.should.eql(['arg_without_spaces', '\'quoted arg with spaces\'']);
    });

    it('should skip invalid arguments', function () {
      const quotedArgs = quoteSpawnArguments(['arg_without_spaces', null]);
      quotedArgs.should.eql(['arg_without_spaces', null]);
    });

    it('should work with a single non-array argument', function () {
      const quotedArgs = quoteSpawnArguments('arg_without_spaces');
      quotedArgs.should.eql(['arg_without_spaces']);
    });
  });
});
