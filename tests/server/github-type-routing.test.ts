import { describe, it, expect } from 'bun:test';
import {
  resolveGitHubTarget,
  hostMatches,
} from '../../src/server/services/integrations/github-sync.service';
import type { GitHubIntegrationConfig } from '../../src/shared/types';

const base: GitHubIntegrationConfig = {
  owner: 'acme',
  repo: 'homelab-containers',
  accessToken: 'x',
  labels: ['triage'],
};

const url = (host: string) => `https://${host}/some/page`;

describe('hostMatches', () => {
  it('matches exact hosts case-insensitively', () => {
    expect(hostMatches('jellyfin.epikos.com', 'jellyfin.epikos.com')).toBe(true);
    expect(hostMatches('jellyfin.epikos.com', 'JELLYFIN.epikos.com')).toBe(true);
    expect(hostMatches('jellyfin.epikos.com', 'sonarr.epikos.com')).toBe(false);
  });

  it('matches wildcards anchored', () => {
    expect(hostMatches('*.epikos.com', 'jellyfin.epikos.com')).toBe(true);
    expect(hostMatches('*-arrs.epikos.com', 'media-arrs.epikos.com')).toBe(true);
    expect(hostMatches('*.epikos.com', 'jellyfin.epikos.com.evil.com')).toBe(false);
    expect(hostMatches('*', 'anything.example')).toBe(true);
  });
});

describe('resolveGitHubTarget', () => {
  it('falls back to base owner/repo/labels with no routes', () => {
    expect(resolveGitHubTarget(base, 'bug', url('jellyfin.epikos.com'))).toEqual({
      owner: 'acme',
      repo: 'homelab-containers',
      labels: ['triage'],
    });
  });

  it('routes by type only (feature -> features repo), others to default', () => {
    const cfg: GitHubIntegrationConfig = {
      ...base,
      repoRoutes: [{ reportType: 'feature', owner: 'acme', repo: 'homelab-features' }],
    };
    expect(resolveGitHubTarget(cfg, 'feature', url('jellyfin.epikos.com')).repo).toBe(
      'homelab-features'
    );
    expect(resolveGitHubTarget(cfg, 'bug', url('jellyfin.epikos.com')).repo).toBe(
      'homelab-containers'
    );
  });

  it('routes by app/host (exact + wildcard)', () => {
    const cfg: GitHubIntegrationConfig = {
      ...base,
      repoRoutes: [
        { host: 'foundry-relay.epikos.com', owner: 'acme', repo: 'foundry' },
        { host: '*.epikos.com', owner: 'acme', repo: 'epikos-misc' },
      ],
    };
    // exact host wins over the wildcard
    expect(resolveGitHubTarget(cfg, 'bug', url('foundry-relay.epikos.com')).repo).toBe('foundry');
    // other epikos hosts hit the wildcard
    expect(resolveGitHubTarget(cfg, 'bug', url('jellyfin.epikos.com')).repo).toBe('epikos-misc');
    // non-matching host -> default
    expect(resolveGitHubTarget(cfg, 'bug', url('elsewhere.test')).repo).toBe('homelab-containers');
  });

  it('host+type beats host-only and type-only', () => {
    const cfg: GitHubIntegrationConfig = {
      ...base,
      repoRoutes: [
        { reportType: 'feature', owner: 'acme', repo: 'features' },
        { host: 'foundry.epikos.com', owner: 'acme', repo: 'foundry' },
        { host: 'foundry.epikos.com', reportType: 'bug', owner: 'acme', repo: 'foundry-bugs' },
      ],
    };
    // foundry bug -> host+type rule
    expect(resolveGitHubTarget(cfg, 'bug', url('foundry.epikos.com')).repo).toBe('foundry-bugs');
    // foundry feature -> exact host beats type-only
    expect(resolveGitHubTarget(cfg, 'feature', url('foundry.epikos.com')).repo).toBe('foundry');
    // other app's feature -> type-only rule
    expect(resolveGitHubTarget(cfg, 'feature', url('jellyfin.epikos.com')).repo).toBe('features');
  });

  it('a longer wildcard literal beats a broader one', () => {
    const cfg: GitHubIntegrationConfig = {
      ...base,
      repoRoutes: [
        { host: '*.epikos.com', owner: 'acme', repo: 'broad' },
        { host: '*-arrs.epikos.com', owner: 'acme', repo: 'arrs' },
      ],
    };
    expect(resolveGitHubTarget(cfg, 'bug', url('media-arrs.epikos.com')).repo).toBe('arrs');
    expect(resolveGitHubTarget(cfg, 'bug', url('jellyfin.epikos.com')).repo).toBe('broad');
  });

  it('labels come from typeLabels regardless of which repo a report routes to', () => {
    const cfg: GitHubIntegrationConfig = {
      ...base,
      typeLabels: { feature: ['enhancement'] },
      repoRoutes: [{ host: 'jellyfin.epikos.com', owner: 'acme', repo: 'jellyfin' }],
    };
    const r = resolveGitHubTarget(cfg, 'feature', url('jellyfin.epikos.com'));
    expect(r.repo).toBe('jellyfin');
    expect(r.labels).toEqual(['enhancement']);
  });
});
