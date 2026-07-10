import { describe, it, expect } from 'vitest';
import type { Report } from '@shared/types';
import {
  buildPermalink,
  byteSize,
  CONSOLE_TRUNCATE_LIMIT,
  defaultExportOptions,
  exportFilename,
  formatByteSize,
  formatExtension,
  formatLabel,
  formatMimeType,
  renderExport,
  sectionCount,
  toAIPrompt,
  toJson,
  toMarkdown,
  toPlain,
  type ExportOptions,
  type ExportRedactionToggles,
  type ExportSectionToggles,
} from '../../lib/reportExport';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'abc123',
    projectId: 'p1',
    source: 'widget',
    title: 'Submit button does nothing',
    description: 'Clicking submit on checkout page is unresponsive.',
    status: 'open',
    priority: 'high',
    reporterLocale: 'en',
    createdAt: '2026-05-01T10:15:00.000Z',
    updatedAt: '2026-05-01T10:15:00.000Z',
    metadata: {
      url: 'https://example.com/checkout?token=secret#section',
      title: 'Checkout',
      referrer: 'https://example.com/cart?ref=email',
      timezone: 'Europe/Amsterdam',
      pageLoadTime: 1234,
      timestamp: '2026-05-01T10:15:00.000Z',
      browser: { name: 'Chrome', version: '120.0', userAgent: 'Mozilla/5.0' },
      device: { type: 'desktop', os: 'macOS', osVersion: '14.5' },
      viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
      consoleErrors: [
        {
          type: 'error',
          message: 'TypeError: cannot read properties of undefined',
          source: 'app.js',
          line: 42,
          timestamp: '2026-05-01T10:15:00.000Z',
        },
        {
          type: 'warn',
          message: 'Deprecated API used',
          timestamp: '2026-05-01T10:15:01.000Z',
        },
      ],
      networkErrors: [
        {
          url: 'https://api.example.com/checkout?session=abc',
          method: 'POST',
          status: 500,
          statusText: 'Internal Server Error',
          timestamp: '2026-05-01T10:15:00.000Z',
        },
        {
          url: 'https://api.example.com/health',
          method: 'GET',
          status: 0,
          statusText: 'Network Error',
          timestamp: '2026-05-01T10:15:00.000Z',
        },
      ],
      userActivity: [
        {
          type: 'button',
          text: 'Submit',
          timestamp: '2026-05-01T10:14:55.000Z',
        },
        {
          type: 'input',
          inputType: 'email',
          text: 'user@example.com',
          timestamp: '2026-05-01T10:14:50.000Z',
        },
        {
          type: 'link',
          text: 'Help',
          url: 'https://example.com/help?article=42',
          timestamp: '2026-05-01T10:14:48.000Z',
        },
      ],
      storageKeys: {
        cookies: ['session', 'cart'],
        localStorage: ['theme'],
        sessionStorage: [],
      },
    },
    reporterEmail: 'reporter@example.com',
    reporterName: 'Sam Reporter',
    ...overrides,
  };
}

const PERMALINK = 'https://bugpin.example.com/admin/reports/abc123';

interface OptionsOverrides {
  sections?: Partial<ExportSectionToggles>;
  redactions?: Partial<ExportRedactionToggles>;
  permalink?: string;
}

function makeOptions(overrides: OptionsOverrides = {}): ExportOptions {
  const base = defaultExportOptions(overrides.permalink ?? PERMALINK);
  return {
    permalink: base.permalink,
    sections: { ...base.sections, ...(overrides.sections ?? {}) },
    redactions: { ...base.redactions, ...(overrides.redactions ?? {}) },
  };
}

describe('buildPermalink', () => {
  it('builds a permalink from origin and report id', () => {
    expect(buildPermalink('abc123', 'https://bugpin.example.com')).toBe(PERMALINK);
  });
});

describe('toMarkdown', () => {
  it('includes title, permalink, and all sections by default', () => {
    const md = toMarkdown(makeReport(), makeOptions());
    expect(md).toContain('# Submit button does nothing');
    expect(md).toContain(`[View in BugPin](${PERMALINK})`);
    expect(md).toContain('## Summary');
    expect(md).toContain('## Page');
    expect(md).toContain('## Environment');
    expect(md).toContain('## Console output (2)');
    expect(md).toContain('## Network errors (2)');
    expect(md).toContain('## User activity (3)');
    expect(md).toContain('## Storage keys (3)');
    expect(md).toContain('## Reporter');
  });

  it('omits disabled sections', () => {
    const md = toMarkdown(
      makeReport(),
      makeOptions({
        sections: {
          summary: true,
          environment: false,
          page: false,
          console: false,
          network: false,
          userActivity: false,
          storageKeys: false,
          reporter: false,
        },
      })
    );
    expect(md).toContain('## Summary');
    expect(md).not.toContain('## Environment');
    expect(md).not.toContain('## Console output');
    expect(md).not.toContain('## Network errors');
    expect(md).not.toContain('## User activity');
    expect(md).not.toContain('## Storage keys');
    expect(md).not.toContain('## Reporter');
  });

  it('strips query strings when redaction is enabled', () => {
    const md = toMarkdown(makeReport(), makeOptions({ redactions: { stripQueryStrings: true } }));
    expect(md).toContain('https://example.com/checkout');
    expect(md).not.toContain('token=secret');
    expect(md).not.toContain('ref=email');
    expect(md).not.toContain('session=abc');
    expect(md).not.toContain('article=42');
  });

  it('redacts input values when stripInputValues is enabled', () => {
    const md = toMarkdown(makeReport(), makeOptions({ redactions: { stripInputValues: true } }));
    expect(md).toContain('input email "[redacted]"');
    expect(md).not.toContain('user@example.com');
  });

  it('truncates console errors when redaction is enabled', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      type: 'error' as const,
      message: `error ${i}`,
      timestamp: '2026-05-01T10:15:00.000Z',
    }));
    const report = makeReport({
      metadata: { ...makeReport().metadata, consoleErrors: many },
    });
    const md = toMarkdown(report, makeOptions({ redactions: { truncateConsole: true } }));
    expect(md).toContain(`## Console output (${CONSOLE_TRUNCATE_LIMIT})`);
    expect(md).not.toContain('error 0');
    expect(md).toContain('error 249');
  });

  it('omits sections with no data even when enabled', () => {
    const empty = makeReport({
      metadata: {
        ...makeReport().metadata,
        consoleErrors: [],
        networkErrors: [],
        userActivity: [],
        storageKeys: { cookies: [], localStorage: [], sessionStorage: [] },
      },
    });
    const md = toMarkdown(empty, makeOptions());
    expect(md).not.toContain('## Console output');
    expect(md).not.toContain('## Network errors');
    expect(md).not.toContain('## User activity');
    expect(md).not.toContain('## Storage keys');
  });
});

describe('toPlain', () => {
  it('produces uppercase section headers without markdown syntax', () => {
    const text = toPlain(makeReport(), makeOptions());
    expect(text).not.toMatch(/^#/m);
    expect(text).not.toContain('**');
    expect(text).toContain('SUMMARY');
    expect(text).toContain('PAGE');
    expect(text).toContain('ENVIRONMENT');
    expect(text).toContain('CONSOLE OUTPUT');
    expect(text).toContain('NETWORK ERRORS');
    expect(text).toContain('USER ACTIVITY');
    expect(text).toContain('STORAGE KEYS');
    expect(text).toContain('REPORTER');
    expect(text).toContain(`Link: ${PERMALINK}`);
  });
});

describe('toAIPrompt', () => {
  it('wraps the plain-text body in an investigative prompt', () => {
    const prompt = toAIPrompt(makeReport(), makeOptions());
    expect(prompt.startsWith('Please investigate')).toBe(true);
    expect(prompt).toContain('--- BUG REPORT ---');
    expect(prompt).toContain('--- END BUG REPORT ---');
    expect(prompt).toContain('SUMMARY');
    expect(prompt).not.toContain('# Submit button');
  });
});

describe('toJson', () => {
  it('emits a valid JSON document with structured sections', () => {
    const raw = toJson(makeReport(), makeOptions());
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.id).toBe('abc123');
    expect(parsed.permalink).toBe(PERMALINK);
    expect(parsed.title).toBe('Submit button does nothing');
    expect(parsed.summary).toBeDefined();
    expect(parsed.page).toBeDefined();
    expect(parsed.environment).toBeDefined();
    expect(parsed.consoleErrors).toBeInstanceOf(Array);
    expect((parsed.consoleErrors as unknown[]).length).toBe(2);
    expect(parsed.networkErrors).toBeInstanceOf(Array);
    expect(parsed.userActivity).toBeInstanceOf(Array);
    expect(parsed.storageKeys).toBeDefined();
    expect(parsed.reporter).toBeDefined();
  });

  it('omits disabled sections', () => {
    const raw = toJson(
      makeReport(),
      makeOptions({
        sections: {
          summary: false,
          environment: false,
          page: false,
          console: false,
          network: false,
          userActivity: false,
          storageKeys: false,
          reporter: false,
        },
      })
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.summary).toBeUndefined();
    expect(parsed.consoleErrors).toBeUndefined();
    expect(parsed.networkErrors).toBeUndefined();
    expect(parsed.userActivity).toBeUndefined();
    expect(parsed.storageKeys).toBeUndefined();
    expect(parsed.reporter).toBeUndefined();
    expect(parsed.environment).toBeUndefined();
    expect(parsed.page).toBeUndefined();
  });
});

describe('renderExport', () => {
  it('dispatches to the correct formatter', () => {
    const report = makeReport();
    const opts = makeOptions();
    expect(renderExport(report, 'markdown', opts)).toBe(toMarkdown(report, opts));
    expect(renderExport(report, 'plain', opts)).toBe(toPlain(report, opts));
    expect(renderExport(report, 'aiPrompt', opts)).toBe(toAIPrompt(report, opts));
    expect(renderExport(report, 'json', opts)).toBe(toJson(report, opts));
  });
});

describe('filename and mime helpers', () => {
  it('returns expected extensions per format', () => {
    expect(formatExtension('markdown')).toBe('md');
    expect(formatExtension('plain')).toBe('txt');
    expect(formatExtension('aiPrompt')).toBe('prompt.txt');
    expect(formatExtension('json')).toBe('json');
  });

  it('builds filenames using the report id and extension', () => {
    expect(exportFilename('abc123', 'markdown')).toBe('bugpin-report-abc123.md');
    expect(exportFilename('abc123', 'aiPrompt')).toBe('bugpin-report-abc123.prompt.txt');
  });

  it('returns the right mime type per format', () => {
    expect(formatMimeType('markdown')).toContain('text/markdown');
    expect(formatMimeType('plain')).toContain('text/plain');
    expect(formatMimeType('aiPrompt')).toContain('text/plain');
    expect(formatMimeType('json')).toContain('application/json');
  });

  it('provides human labels', () => {
    expect(formatLabel('markdown')).toBe('Markdown');
    expect(formatLabel('plain')).toBe('Plain text');
    expect(formatLabel('aiPrompt')).toBe('AI prompt');
    expect(formatLabel('json')).toBe('JSON');
  });
});

describe('sectionCount', () => {
  it('returns the count for collection sections', () => {
    const report = makeReport();
    expect(sectionCount(report, 'console')).toBe(2);
    expect(sectionCount(report, 'network')).toBe(2);
    expect(sectionCount(report, 'userActivity')).toBe(3);
    expect(sectionCount(report, 'storageKeys')).toBe(3);
  });

  it('returns null for non-list sections', () => {
    const report = makeReport();
    expect(sectionCount(report, 'summary')).toBeNull();
    expect(sectionCount(report, 'environment')).toBeNull();
    expect(sectionCount(report, 'page')).toBeNull();
    expect(sectionCount(report, 'reporter')).toBeNull();
  });
});

describe('console and network output includes timestamps', () => {
  it('markdown emits timestamps on console and network entries', () => {
    const md = toMarkdown(makeReport(), makeOptions());
    expect(md).toContain('@ 2026-05-01T10:15:00.000Z');
    expect(md).toContain('500 Internal Server Error');
  });

  it('plain text emits timestamps on console and network entries', () => {
    const text = toPlain(makeReport(), makeOptions());
    expect(text).toContain('@ 2026-05-01T10:15:00.000Z');
  });
});

describe('byteSize and formatByteSize', () => {
  it('measures bytes including multi-byte characters', () => {
    expect(byteSize('abc')).toBe(3);
    expect(byteSize('é')).toBe(2);
  });

  it('formats sizes with units', () => {
    expect(formatByteSize(900)).toBe('900 B');
    expect(formatByteSize(2048)).toMatch(/2\.0 KB|2 KB/);
    expect(formatByteSize(5 * 1024 * 1024)).toMatch(/MB/);
  });
});
