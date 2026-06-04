import { describe, it, expect } from 'bun:test';
import { resolveGitHubTarget } from '../../src/server/services/integrations/github-sync.service';
import type { GitHubIntegrationConfig } from '../../src/shared/types';

const base: GitHubIntegrationConfig = {
  owner: 'acme',
  repo: 'bugs',
  accessToken: 'x',
  labels: ['triage'],
};

describe('resolveGitHubTarget', () => {
  it('falls back to base owner/repo/labels for an unmapped type', () => {
    expect(resolveGitHubTarget(base, 'bug')).toEqual({
      owner: 'acme',
      repo: 'bugs',
      labels: ['triage'],
    });
  });

  it('applies per-type label overrides while keeping the base repo', () => {
    const config: GitHubIntegrationConfig = {
      ...base,
      typeLabels: { feature: ['enhancement'], question: ['question'] },
    };
    expect(resolveGitHubTarget(config, 'feature')).toEqual({
      owner: 'acme',
      repo: 'bugs',
      labels: ['enhancement'],
    });
    // Unmapped type still falls back to base labels.
    expect(resolveGitHubTarget(config, 'task').labels).toEqual(['triage']);
  });

  it('routes a mapped type to its own repo', () => {
    const config: GitHubIntegrationConfig = {
      ...base,
      typeRepos: { feature: { owner: 'acme', repo: 'roadmap' } },
    };
    expect(resolveGitHubTarget(config, 'feature')).toEqual({
      owner: 'acme',
      repo: 'roadmap',
      labels: ['triage'],
    });
    // Unmapped type stays in the base repo.
    expect(resolveGitHubTarget(config, 'bug').repo).toBe('bugs');
  });

  it('combines per-type repo and label overrides', () => {
    const config: GitHubIntegrationConfig = {
      ...base,
      typeRepos: { feature: { owner: 'acme', repo: 'roadmap' } },
      typeLabels: { feature: ['enhancement', 'needs-triage'] },
    };
    expect(resolveGitHubTarget(config, 'feature')).toEqual({
      owner: 'acme',
      repo: 'roadmap',
      labels: ['enhancement', 'needs-triage'],
    });
  });

  it('leaves labels undefined when the base has none and the type is unmapped', () => {
    const config: GitHubIntegrationConfig = { owner: 'acme', repo: 'bugs', accessToken: 'x' };
    expect(resolveGitHubTarget(config, 'bug').labels).toBeUndefined();
  });
});
