import { existsSync } from 'node:fs';
if (existsSync('ee/src/index.ts')) {
  const command = process.argv[2] ?? 'check';
  if (command === 'test' || command === 'check') {
    const buildExitCode = await Bun.spawn([process.execPath, 'run', '--cwd', 'ee', 'build'], {
      stdout: 'inherit',
      stderr: 'inherit',
    }).exited;
    if (buildExitCode !== 0) process.exit(buildExitCode);
  }
  process.exit(
    await Bun.spawn([process.execPath, 'run', '--cwd', 'ee', command], {
      stdout: 'inherit',
      stderr: 'inherit',
    }).exited
  );
}
console.log('EE source is absent; skipping EE verification.');
