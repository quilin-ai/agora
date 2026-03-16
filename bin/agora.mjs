#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = resolve(root, 'src/cli/index.ts');
const tsx = resolve(root, 'node_modules/.bin/tsx');

try {
  execFileSync(tsx, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: root,
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
