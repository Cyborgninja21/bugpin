const command = process.argv[2] ?? 'check';
if (command !== 'test' && command !== 'typecheck' && command !== 'check') {
  console.error('Usage: bun run src/server/scripts/check-ee.ts [test|typecheck|check]');
  process.exit(1);
}

const directory = new URL('../../../ee/', import.meta.url);
if (!(await Bun.file(new URL('src/index.ts', directory)).exists())) {
  console.log('EE source is absent; skipping EE verification.');
  process.exit(0);
}

const commands =
  command === 'check'
    ? ['build', 'typecheck', 'test']
    : command === 'test'
      ? ['build', 'test']
      : [command];

for (const script of commands) {
  const exitCode = await Bun.spawn([process.execPath, 'run', script], {
    cwd: decodeURIComponent(directory.pathname),
    stdout: 'inherit',
    stderr: 'inherit',
  }).exited;
  if (exitCode !== 0) process.exit(exitCode);
}
