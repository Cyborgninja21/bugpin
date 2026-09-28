import { z } from 'zod';
import { githubFileMarkdown } from './github-markdown.js';
import { Result } from '../../utils/result.js';
import type { GitHubRepairRow } from '../../database/repositories/github-link-repair.repo.js';

const integrationSchema = z.object({
  owner: z.string().regex(/^[\w.-]+$/),
  repo: z.string().regex(/^[\w.-]+$/),
  accessToken: z.string().min(1),
});
const issueSchema = z.object({
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  updated_at: z.string(),
});

export interface RepairBackup {
  issueUrl: string;
  originalBody: string;
  replacementBody: string;
  updatedAt: string;
}

interface RepairOptions {
  apply: boolean;
  saveBackup: (backup: RepairBackup) => Promise<void>;
  log: (message: string) => void;
  fetch?: typeof fetch;
}

export interface RepairSummary {
  updated: number;
  wouldUpdate: number;
  skipped: number;
  failed: number;
  stopped: boolean;
}

class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly stop: boolean
  ) {
    super(message);
  }
}

export async function repairGitHubLinks(
  targets: GitHubRepairRow[],
  options: RepairOptions
): Promise<Result<RepairSummary>> {
  const summary: RepairSummary = {
    updated: 0,
    wouldUpdate: 0,
    skipped: 0,
    failed: 0,
    stopped: false,
  };
  const seen = new Set<string>();
  const request = options.fetch ?? fetch;
  for (const target of targets) {
    const label = `${target.integrationId} / issue #${target.issueNumber}`;
    let stage = 'reading integration configuration';
    try {
      const config = integrationSchema.parse(JSON.parse(target.config));
      const issueUrl = `https://github.com/${config.owner}/${config.repo}/issues/${target.issueNumber}`;
      if (target.issueUrl?.toLowerCase() !== issueUrl.toLowerCase()) {
        summary.skipped++;
        options.log(`${label}: skipped (repository mismatch or missing issue URL)`);
        continue;
      }
      if (seen.has(issueUrl.toLowerCase())) continue;
      seen.add(issueUrl.toLowerCase());
      const apiBase = `https://api.github.com/repos/${config.owner}/${config.repo}`;
      const api = async (url: string, body?: string): Promise<unknown> => {
        const response = await request(url, {
          method: body === undefined ? 'GET' : 'PATCH',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.accessToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify({ body }),
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
        if (!response.ok) {
          throw new GitHubRequestError(
            `GitHub HTTP ${response.status}`,
            [401, 403, 429].includes(response.status)
          );
        }
        return response.json();
      };
      const endpoint = `${apiBase}/issues/${target.issueNumber}`;
      stage = 'reading issue';
      const issue = issueSchema.parse(await api(endpoint));
      if (issue.state !== 'open' || !issue.body) {
        summary.skipped++;
        options.log(`${label}: skipped (closed or empty)`);
        continue;
      }
      let body = issue.body;
      let replacements = 0;
      const links = new Map<string, string>();
      // Code spans and fenced blocks are examples, not rendered attachment links.
      const tokens =
        /(?<fence>`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\k<fence>[ \t]*(?:\r?\n|$)|(?<ticks>`+)[\s\S]*?\k<ticks>|!?\[(?<label>[^\]\r\n]*)\]\((?<url>https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/[^\s)]+)\)/gm;
      const edits: Array<{ start: number; end: number; text: string }> = [];
      for (const match of issue.body.matchAll(tokens)) {
        if (!match.groups?.url) continue;
        const url = new URL(match.groups.url);
        const prefix = `/${config.owner}/${config.repo}/`.toLowerCase();
        const marker = `/.bugpin/files/${target.reportId}/`;
        const markerIndex = url.pathname.indexOf(marker, prefix.length);
        const isRaw = url.origin === 'https://raw.githubusercontent.com';
        if (
          (!isRaw && !url.pathname.toLowerCase().startsWith(`${prefix}blob/`)) ||
          !url.pathname.toLowerCase().startsWith(prefix) ||
          markerIndex < 0
        )
          continue;
        const filename = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
        if (
          !filename ||
          /[/\\\u0000-\u001f]/.test(filename) ||
          filename === '.' ||
          filename === '..'
        )
          continue;
        const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|avif|ico)$/i.test(filename);
        if (!isRaw) {
          const text = githubFileMarkdown(match.groups.label, url.href, isImage);
          if (!isImage || text === match[0]) continue;
          edits.push({ start: match.index, end: match.index + match[0].length, text });
          replacements++;
          continue;
        }
        const path = `.bugpin/files/${target.reportId}/${filename}`;
        let replacement = links.get(path);
        if (!replacement) {
          stage = 'resolving repository file';
          const file = z
            .object({ html_url: z.string().url(), type: z.literal('file') })
            .parse(
              await api(`${apiBase}/contents/${path.split('/').map(encodeURIComponent).join('/')}`)
            );
          const html = new URL(file.html_url);
          if (
            html.origin !== 'https://github.com' ||
            !html.pathname.toLowerCase().startsWith(`${prefix}blob/`)
          ) {
            throw new Error('Unexpected file URL');
          }
          replacement = file.html_url;
          links.set(path, replacement);
        }
        edits.push({
          start: match.index,
          end: match.index + match[0].length,
          text: githubFileMarkdown(match.groups.label, replacement, isImage),
        });
        replacements++;
      }
      for (const edit of edits.reverse())
        body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
      if (!replacements) {
        summary.skipped++;
        options.log(`${label}: skipped (no matching legacy links)`);
        continue;
      }
      if (!options.apply) {
        summary.wouldUpdate++;
        options.log(`${label}: would replace ${replacements} link(s)`);
        continue;
      }
      stage = 'saving backup';
      await options.saveBackup({
        issueUrl,
        originalBody: issue.body,
        replacementBody: body,
        updatedAt: issue.updated_at,
      });
      stage = 'checking for concurrent edits';
      const latest = issueSchema.parse(await api(endpoint));
      if (
        latest.state !== 'open' ||
        latest.body !== issue.body ||
        latest.updated_at !== issue.updated_at
      ) {
        summary.failed++;
        options.log(`${label}: not updated (issue changed; rerun to retry)`);
        continue;
      }
      stage = 'updating issue';
      await api(endpoint, body);
      summary.updated++;
      options.log(`${label}: replaced ${replacements} link(s)`);
      await Bun.sleep(1000);
    } catch (error) {
      summary.failed++;
      const stop = error instanceof GitHubRequestError && error.stop;
      options.log(
        `${label}: failed while ${stage} (${error instanceof GitHubRequestError ? error.message : 'operation failed'})`
      );
      if (stop) {
        summary.stopped = true;
        break;
      }
    }
  }
  return Result.ok(summary);
}
