import path from 'node:path';

function getFixture(fix: string): string {
  // Append .bat or .sh if there's no extention
  if (!fix.includes('.')) {
    fix = fix + (process.platform === 'win32' ? '.bat' : '.sh');
  }
  return path.resolve(__dirname, 'fixtures', fix);
}

export {getFixture};
