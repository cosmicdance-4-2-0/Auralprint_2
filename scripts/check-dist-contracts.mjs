import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();

const CONTRACT_FILES = Object.freeze([
  'index.html',
  'main.js',
  path.join('ui', 'dom.js')
]);

async function compareContractFile(relativePath) {
  const srcPath = path.join(PROJECT_ROOT, 'src', relativePath);
  const distPath = path.join(PROJECT_ROOT, 'dist', relativePath);

  const [srcContent, distContent] = await Promise.all([
    readFile(srcPath, 'utf8'),
    readFile(distPath, 'utf8')
  ]);

  if (srcContent !== distContent) {
    return {
      relativePath,
      status: 'mismatch'
    };
  }

  return {
    relativePath,
    status: 'match'
  };
}

const results = await Promise.all(CONTRACT_FILES.map(compareContractFile));
const mismatches = results.filter((result) => result.status === 'mismatch');

if (mismatches.length > 0) {
  console.error('dist contract check failed: source/dist mismatch detected.');
  for (const mismatch of mismatches) {
    console.error(` - ${mismatch.relativePath}`);
  }
  console.error('Run `npm run build` to regenerate dist/ from src/.');
  process.exit(1);
}

console.log('dist contract check passed for:', CONTRACT_FILES.join(', '));
