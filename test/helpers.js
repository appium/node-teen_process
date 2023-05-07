import path from 'path';


function getFixture (fix) {
  // Append .bat or .sh if there's no extention
  if (fix.indexOf('.') === -1) {
    fix = fix + (process.platform === 'win32' ? '.bat' : '.sh');
  }
  return path.resolve(__dirname, 'fixtures', fix);
}

export { getFixture };
