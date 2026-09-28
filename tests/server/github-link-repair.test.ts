import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm, readFile, readdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  findGitHubRepairTargets,
  type GitHubRepairRow,
} from '../../src/server/database/repositories/github-link-repair.repo';
import {
  repairGitHubLinks,
  type RepairBackup,
} from '../../src/server/services/integrations/github-link-repair.service';

const target: GitHubRepairRow = {
  integrationId: 'int_1',
  reportId: 'rpt_1',
  issueNumber: 12,
  issueUrl: 'https://github.com/org/repo/issues/12',
  config: JSON.stringify({ owner: 'org', repo: 'repo', accessToken: 'secret-token' }),
};
const raw =
  'https://raw.githubusercontent.com/org/repo/main/.bugpin/files/rpt_1/screenshot.png?token=private-token';
const html = 'https://github.com/org/repo/blob/develop/.bugpin/files/rpt_1/screenshot.png';

function harness(
  options: {
    body?: string;
    state?: string;
    status?: number;
    fileStatus?: number;
    changed?: boolean;
    backupFails?: boolean;
    patchStatus?: number;
  } = {}
) {
  let body =
    options.body ??
    `Manual introduction\n\n![Screenshot](${raw})\n[Download](${raw})\n\nManual footer`;
  const backups: RepairBackup[] = [];
  const patches: unknown[] = [];
  const logs: string[] = [];
  let gets = 0;
  let fileGets = 0;
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    if (options.status) return new Response('', { status: options.status });
    if (String(input).includes('/contents/')) {
      fileGets++;
      if (options.fileStatus) return new Response('', { status: options.fileStatus });
      return Response.json({
        type: 'file',
        html_url: `https://github.com/org/repo/blob/develop/${String(input).split('/contents/')[1]}`,
      });
    }
    if (init?.method === 'PATCH') {
      expect(backups).toHaveLength(1);
      const patch = JSON.parse(init.body as string) as { body: string };
      patches.push(patch);
      if (options.patchStatus) return new Response('', { status: options.patchStatus });
      body = patch.body;
      return Response.json({});
    }
    gets++;
    return Response.json({
      body: options.changed && gets > 1 ? `${body}\nNew edit` : body,
      state: options.state ?? 'open',
      updated_at: '2026-09-28T12:00:00Z',
    });
  };
  return {
    backups,
    patches,
    logs,
    body: () => body,
    fileGets: () => fileGets,
    run: (apply = false, targets = [target]) =>
      repairGitHubLinks(targets, {
        apply,
        fetch: request as typeof fetch,
        log: (message) => logs.push(message),
        saveBackup: async (backup) => {
          if (options.backupFails) throw new Error('disk full');
          backups.push(backup);
        },
      }),
  };
}

describe('GitHub link repair', () => {
  it('previews replacements without backups or writes and never logs credentials', async () => {
    const h = harness();
    expect(await h.run()).toMatchObject({
      success: true,
      value: { wouldUpdate: 1, updated: 0, failed: 0 },
    });
    expect(h.patches).toHaveLength(0);
    expect(h.backups).toHaveLength(0);
    expect(h.fileGets()).toBe(1);
    expect(h.logs.join('\n')).not.toContain('token');
  });

  it('backs up and patches only the body, preserves manual edits, and is safe to rerun', async () => {
    const h = harness();
    const original = h.body();
    expect(await h.run(true)).toMatchObject({ value: { updated: 1, failed: 0 } });
    const expected = `Manual introduction\n\n![Screenshot](${html}?raw=1)\n![Download](${html}?raw=1)\n\nManual footer`;
    expect(h.patches).toEqual([{ body: expected }]);
    expect(h.backups[0]).toMatchObject({ originalBody: original, replacementBody: expected });
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1, updated: 0 } });
    expect(h.patches).toHaveLength(1);
  });

  it('preserves unrelated links and examples', async () => {
    const body = `[Other report](${raw.replace('rpt_1', 'rpt_2')})\n[Other repo](${raw.replace('/org/repo/', '/other/repo/')})\n\`![Example](${raw})\`\n\`\`\`md\n![Example](${raw})\n\`\`\`\n![Already fixed](${html}?raw=1)`;
    const h = harness({ body });
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1 } });
    expect(h.body()).toBe(body);
    expect(h.fileGets()).toBe(0);
  });

  it('restores images repaired into plain links and leaves document attachments as links', async () => {
    const pdfRaw = raw.replace('screenshot.png', 'document.pdf');
    const pdfHtml = html.replace('screenshot.png', 'document.pdf');
    const body = `[Screenshot](${html})\n[Document](${pdfHtml})\n[Old document](${pdfRaw})`;
    const h = harness({ body });
    expect(await h.run(true)).toMatchObject({ value: { updated: 1, failed: 0 } });
    expect(h.body()).toBe(
      `![Screenshot](${html}?raw=1)\n[Document](${pdfHtml})\n[Old document](${pdfHtml})`
    );
    expect(await h.run(true)).toMatchObject({ value: { updated: 0, skipped: 1 } });
    expect(h.patches).toHaveLength(1);
  });

  it('preserves blob refs and query parameters without duplicating the raw parameter', async () => {
    const source = html.replace('/develop/', '/feature/capture/').replace('.png', '.PNG');
    const h = harness({ body: `![Screenshot](${source}?raw=true&other=value)` });
    expect(await h.run(true)).toMatchObject({ value: { updated: 1 } });
    expect(h.body()).toBe(`![Screenshot](${source}?raw=1&other=value)`);
    expect(h.fileGets()).toBe(0);
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1 } });
  });

  it('does not modify blob links belonging to other reports or repositories', async () => {
    const body = `[Other report](${html.replace('rpt_1', 'rpt_2')})\n[Other repo](${html.replace('/org/repo/', '/other/repo/')})`;
    const h = harness({ body });
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1 } });
    expect(h.body()).toBe(body);
    expect(h.patches).toHaveLength(0);
  });

  it('skips closed issues and mismatched repositories', async () => {
    const h = harness({ state: 'closed' });
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1 } });
    expect(h.fileGets()).toBe(0);
    expect(
      await h.run(true, [{ ...target, issueUrl: 'https://github.com/other/repo/issues/12' }])
    ).toMatchObject({ value: { skipped: 1 } });
    expect(h.patches).toHaveLength(0);
  });

  it('preserves code examples with longer delimiters', async () => {
    const example = `![Screenshot](${raw})`;
    const body = ['``' + example + '``', '````md\n```\n' + example + '\n```\n````'].join('\n');
    const h = harness({ body });
    expect(await h.run(true)).toMatchObject({ value: { skipped: 1 } });
    expect(h.fileGets()).toBe(0);
    expect(h.body()).toBe(body);
  });

  for (const options of [
    { fileStatus: 404 },
    { changed: true },
    { backupFails: true },
    { patchStatus: 500 },
  ]) {
    it(`reports incomplete repairs for ${JSON.stringify(options)}`, async () => {
      const h = harness(options);
      expect(await h.run(true)).toMatchObject({ value: { failed: 1, updated: 0 } });
      if (!options.patchStatus) expect(h.patches).toHaveLength(0);
    });
  }

  for (const status of [401, 403, 429]) {
    it(`stops on GitHub HTTP ${status}`, async () => {
      const h = harness({ status });
      expect(await h.run(true, [target, target])).toMatchObject({
        value: { failed: 1, stopped: true },
      });
    });
  }

  it('deduplicates issue targets', async () => {
    const h = harness();
    expect(await h.run(true, [target, target])).toMatchObject({ value: { updated: 1 } });
    expect(h.patches).toHaveLength(1);
  });

  it('reads active GitHub targets without modifying the database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bugpin-repair-'));
    const path = join(dir, 'bugpin.db');
    try {
      const db = new Database(path);
      db.exec(`CREATE TABLE integrations (id TEXT, project_id TEXT, type TEXT, is_active INTEGER, config TEXT);
        CREATE TABLE reports (id TEXT, project_id TEXT, github_issue_number INTEGER, github_issue_url TEXT);`);
      db.query('INSERT INTO integrations VALUES (?, ?, ?, ?, ?)').run(
        'int_1',
        'proj_1',
        'github',
        1,
        target.config
      );
      db.query('INSERT INTO integrations VALUES (?, ?, ?, ?, ?)').run(
        'int_2',
        'proj_1',
        'github',
        0,
        target.config
      );
      db.query('INSERT INTO reports VALUES (?, ?, ?, ?)').run(
        'rpt_1',
        'proj_1',
        12,
        target.issueUrl
      );
      db.close();
      const before = await readFile(path);
      expect(findGitHubRepairTargets(path)).toEqual([target]);
      expect(findGitHubRepairTargets(path, 'int_1')).toEqual([target]);
      expect(() => findGitHubRepairTargets(path, 'int_2')).toThrow();
      expect(await readFile(path)).toEqual(before);

      const preload = join(dir, 'mock-github.ts');
      await Bun.write(
        preload,
        `
        globalThis.fetch = async (url, init) => {
          if (!String(url).startsWith('https://api.github.com/repos/org/repo/')) throw new Error('Unexpected URL');
          if (String(url).includes('/contents/')) return Response.json({ type: 'file', html_url: ${JSON.stringify(html)} });
          if (init?.method === 'PATCH') {
            await Bun.write(${JSON.stringify(join(dir, 'patch.json'))}, init.body);
            return Response.json({});
          }
          return Response.json({ body: ${JSON.stringify(`![Screenshot](${raw})`)}, state: 'open', updated_at: '2026-09-28' });
        };
      `
      );
      const script = join(import.meta.dir, '../../src/server/scripts/repair-github-links.ts');
      for (const apply of [false, true]) {
        const child = Bun.spawn(
          [process.execPath, '--preload', preload, script, ...(apply ? ['--apply'] : [])],
          {
            env: { ...process.env, DATA_DIR: dir },
            stdout: 'pipe',
            stderr: 'pipe',
          }
        );
        const output = await new Response(child.stdout).text();
        const errors = await new Response(child.stderr).text();
        expect(await child.exited).toBe(0);
        expect(errors).toBe('');
        expect(output).not.toContain('private-token');
        expect(output).not.toContain('secret-token');
        if (!apply) {
          expect(await Bun.file(join(dir, 'patch.json')).exists()).toBe(false);
          expect(await readdir(dir)).not.toContain('backups');
        }
      }
      const runs = await readdir(join(dir, 'backups'));
      expect(runs).toHaveLength(1);
      const backupDir = join(dir, 'backups', runs[0]);
      expect((await stat(backupDir)).mode & 0o777).toBe(0o700);
      const files = await readdir(backupDir);
      expect(files).toHaveLength(1);
      expect((await stat(join(backupDir, files[0]))).mode & 0o777).toBe(0o600);
      const backup = JSON.parse(await readFile(join(backupDir, files[0]), 'utf8')) as RepairBackup;
      expect(backup.originalBody).toBe(`![Screenshot](${raw})`);
      expect(JSON.parse(await readFile(join(dir, 'patch.json'), 'utf8'))).toEqual({
        body: backup.replacementBody,
      });
      expect(await readFile(path)).toEqual(before);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
