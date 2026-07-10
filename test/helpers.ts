import path from 'node:path';
import fs from 'node:fs/promises';

let moduleRoot: string | null = null;

export async function getFixture(fix: string): Promise<string> {
  if (!moduleRoot) {
    moduleRoot = await getModuleRoot();
  }
  return path.resolve(
    moduleRoot,
    'test',
    'fixtures',
    fix.includes('.') ? fix : `${fix}${process.platform === 'win32' ? '.bat' : '.sh'}`,
  );
}

async function getModuleRoot(): Promise<string> {
  let currentDir = path.dirname(path.resolve(__filename));
  let isAtFsRoot = false;
  while (!isAtFsRoot) {
    const manifestPath = path.join(currentDir, 'package.json');
    try {
      await fs.access(manifestPath);
      if (
        (JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {name?: string}).name ===
        'teen_process'
      ) {
        return currentDir;
      }
    } catch {
      // ignore
    }
    currentDir = path.dirname(currentDir);
    isAtFsRoot = currentDir.length <= path.dirname(currentDir).length;
  }
  throw new Error('Module root not found');
}
