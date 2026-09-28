import { parseArgs } from 'util';
import { mkdir, open } from 'fs/promises';
import { resolve, join } from 'path';
import { findGitHubRepairTargets } from '../database/repositories/github-link-repair.repo.js';
import { repairGitHubLinks } from '../services/integrations/github-link-repair.service.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      apply: { type: 'boolean' },
      integration: { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log('Usage: bun run repair-github-links [--integration <id>] [--apply]');
    console.log(
      'Defaults to a read-only preview. Uses DATA_DIR or the installation data directory.'
    );
    return;
  }
  if (values.integration === '') throw new Error('Empty integration ID');
  const dataDir = resolve(process.env.DATA_DIR || join(import.meta.dir, '../../../data'));
  const targets = findGitHubRepairTargets(join(dataDir, 'bugpin.db'), values.integration);
  const backupDir = join(
    dataDir,
    'backups',
    `github-link-repair-${Date.now()}-${crypto.randomUUID()}`
  );
  console.log(
    values.apply
      ? 'Applying GitHub link repair.'
      : 'Preview only. No GitHub issues will be changed.'
  );
  const result = await repairGitHubLinks(targets, {
    apply: values.apply ?? false,
    log: console.log,
    saveBackup: async (backup) => {
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      const file = await open(join(backupDir, `${crypto.randomUUID()}.json`), 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(backup, null, 2));
        await file.sync();
      } finally {
        await file.close();
      }
      console.log(`Backup saved under ${backupDir}`);
    },
  });
  if (!result.success) throw new Error('Repair failed');
  console.log(JSON.stringify(result.value));
  if (result.value.failed || result.value.stopped) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch(() => {
    console.error(
      'Repair could not complete. Check arguments, DATA_DIR, database access, and integration configuration. Use --help for usage.'
    );
    process.exitCode = 1;
  });
}
