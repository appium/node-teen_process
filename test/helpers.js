import path from 'path';

function getFixture (fix) {
  return path.resolve(__dirname, "..", "..", "test", "fixtures", fix);
}

export { getFixture };

