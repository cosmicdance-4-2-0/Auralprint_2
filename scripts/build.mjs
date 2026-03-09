import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src');

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

async function copyRuntimeTree(targetDir) {
  for (const runtimePath of RUNTIME_PATHS) {
    await cp(path.join(SOURCE_DIR, runtimePath), path.join(targetDir, runtimePath), { recursive: true });
  }
}

await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });
await copyRuntimeTree(DIST_DIR);
await cp(path.join(SOURCE_DIR, 'index.html'), path.join(DIST_DIR, 'index.html'));

console.log('Build complete:', DIST_DIR);
