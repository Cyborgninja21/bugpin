import { existsSync } from 'node:fs';
if (existsSync('ee/src/index.ts')) {
  const command = process.argv[2] ?? 'check';
  process.exit(await Bun.spawn([process.execPath, 'run', '--cwd', 'ee', command], { stdout: 'inherit', stderr: 'inherit' }).exited);
}
console.log('EE source is absent; skipping EE verification.');
