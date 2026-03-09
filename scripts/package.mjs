import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = process.cwd();
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src');
const PORTABLE_DIR = path.join(PROJECT_ROOT, 'portable');

const RUNTIME_PATHS = [
  'main.js',
  'app',
  'domain',
  'io',
  'ui',
  'shared',
  'audio',
  'bands'
];

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`build failed with code ${code}`));
    });
  });
}

await runBuild();
await rm(PORTABLE_DIR, { recursive: true, force: true });
await mkdir(PORTABLE_DIR, { recursive: true });

for (const runtimePath of RUNTIME_PATHS) {
  await cp(path.join(SOURCE_DIR, runtimePath), path.join(PORTABLE_DIR, runtimePath), { recursive: true });
}

await cp(path.join(SOURCE_DIR, 'portable.html'), path.join(PORTABLE_DIR, 'index.html'));

console.log('Portable package complete:', PORTABLE_DIR);
