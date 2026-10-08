import { afterEach, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await Bun.file(
  new URL('../../src/server/scripts/check-ee.ts', import.meta.url)
).text();
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function run(command: string, withEE: boolean, failedPhase = '') {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin check ee-'));
  directories.push(directory);
  const script = join(directory, 'src/server/scripts/check-ee.ts');
  await Bun.write(script, source);
  if (withEE) {
    await Bun.write(join(directory, 'ee/src/index.ts'), 'export {};');
    await Bun.write(
      join(directory, 'ee/package.json'),
      JSON.stringify({
        scripts: {
          build: 'bun phase.ts build',
          typecheck: 'bun phase.ts typecheck',
          test: 'bun phase.ts test',
        },
      })
    );
    await Bun.write(
      join(directory, 'ee/phase.ts'),
      'console.log(process.argv[2]); if (process.argv[2] === process.env.FAIL_EE_PHASE) process.exit(7);'
    );
  }
  const child = Bun.spawn([process.execPath, script, command], {
    cwd: tmpdir(),
    env: { ...process.env, FAIL_EE_PHASE: failedPhase },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

it('skips verification when the EE source is absent', async () => {
  const result = await run('test', false);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('EE source is absent; skipping EE verification.');
});

it('builds EE before testing and resolves the checkout independently of the working directory', async () => {
  const result = await run('test', true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim().split('\n')).toEqual(['build', 'test']);
});

it('runs the typecheck and complete verification commands', async () => {
  const typecheck = await run('typecheck', true);
  expect(typecheck.exitCode).toBe(0);
  expect(typecheck.stdout.trim()).toBe('typecheck');
  const check = await run('check', true);
  expect(check.exitCode).toBe(0);
  expect(check.stdout.trim().split('\n')).toEqual(['build', 'typecheck', 'test']);
});

it('stops on a failed build and propagates failed test exit codes', async () => {
  const build = await run('test', true, 'build');
  expect(build.exitCode).toBe(7);
  expect(build.stdout.trim()).toBe('build');
  const test = await run('test', true, 'test');
  expect(test.exitCode).toBe(7);
  expect(test.stdout.trim().split('\n')).toEqual(['build', 'test']);
});
