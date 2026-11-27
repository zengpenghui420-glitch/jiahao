#!/usr/bin/env node
// Runs tools/order-unlock.test.mjs. Does not call a live order or code service.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, 'order-unlock.test.mjs')], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
