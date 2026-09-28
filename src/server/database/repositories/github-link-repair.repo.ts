import { Database } from 'bun:sqlite';

export interface GitHubRepairRow {
  integrationId: string;
  config: string;
  reportId: string;
  issueNumber: number;
  issueUrl: string | null;
}

export function findGitHubRepairTargets(dbPath: string, integrationId?: string): GitHubRepairRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    if (
      integrationId &&
      !db
        .query("SELECT id FROM integrations WHERE id = ? AND type = 'github' AND is_active = 1")
        .get(integrationId)
    ) {
      throw new Error('Selected integration is missing, inactive, or not a GitHub integration');
    }
    return db
      .query<GitHubRepairRow, [string | null, string | null]>(
        `
      SELECT i.id AS integrationId, i.config, r.id AS reportId,
             r.github_issue_number AS issueNumber, r.github_issue_url AS issueUrl
      FROM integrations i JOIN reports r ON r.project_id = i.project_id
      WHERE i.type = 'github' AND i.is_active = 1 AND r.github_issue_number IS NOT NULL
        AND (? IS NULL OR i.id = ?)
      ORDER BY i.id, r.id
    `
      )
      .all(integrationId ?? null, integrationId ?? null);
  } finally {
    db.close();
  }
}
