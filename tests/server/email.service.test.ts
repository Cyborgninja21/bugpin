import { defaultEmailTemplates } from '../../src/server/constants/email-templates';
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { emailService, resolveTemplate } from '../../src/server/services/email.service';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import type { CustomEmailTemplates, Report } from '../../src/shared/types';

const sendMail = mock(async () => undefined);
const verify = mock(async () => undefined);

const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };
const originalCreateTransporter = emailService.createTransporter;

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  source: 'widget',
  title: 'Bug report',
  status: 'open',
  priority: 'high',
  reporterLocale: 'en',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  sendMail.mockClear();
  verify.mockClear();

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  // Mock createTransporter to return a fake transport
  emailService.createTransporter = () => ({ sendMail, verify }) as never;

  settingsRepo.getAll = async () =>
    ({
      appName: 'BugPin',
      smtpEnabled: true,
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        password: 'pass',
        from: 'no-reply@example.com',
      },
    }) as never;

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
  emailService.createTransporter = originalCreateTransporter;
});

describe('emailService.sendEmail', () => {
  it('returns error when SMTP is disabled', async () => {
    settingsRepo.getAll = async () =>
      ({
        smtpEnabled: false,
        smtpConfig: {},
      }) as never;

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP is disabled');
  });

  it('returns error when SMTP config is incomplete', async () => {
    settingsRepo.getAll = async () =>
      ({
        smtpEnabled: true,
        smtpConfig: { host: '', from: '' },
      }) as never;

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP not configured');
  });

  it('sends an email when configured', async () => {
    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com', name: 'Test' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(true);
    expect(sendMail).toHaveBeenCalled();
  });

  it('handles transport errors', async () => {
    sendMail.mockImplementationOnce(() => {
      throw new Error('fail');
    });

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('fail');
  });
});

describe('emailService.sendTestEmail', () => {
  it('rejects missing host and from fields', async () => {
    const result = await emailService.sendTestEmail(
      { host: '', port: 587, from: '' },
      'recipient@example.com'
    );
    expect(result.success).toBe(false);
  });

  it('returns error when verify fails', async () => {
    verify.mockImplementationOnce(() => {
      throw new Error('verify fail');
    });

    const result = await emailService.sendTestEmail(
      { host: 'smtp.example.com', port: 587, from: 'no-reply@example.com' },
      'recipient@example.com'
    );
    expect(result.success).toBe(false);
  });

  it('sends a test email', async () => {
    const result = await emailService.sendTestEmail(
      { host: 'smtp.example.com', port: 587, from: 'no-reply@example.com' },
      'recipient@example.com',
      'BugPin'
    );
    expect(result.success).toBe(true);
    expect(verify).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalled();
  });
});

describe('emailService notification helpers', () => {
  it('sends new report notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendNewReportNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });

  it('sends status change notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendStatusChangeNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
      oldStatus: 'open',
      newStatus: 'resolved',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });

  it('sends assignment notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendAssignmentNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
      assignedToName: 'User',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });

  it('sends reporter assignment notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterAssignmentEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project',
      appName: 'BugPin',
      appUrl: 'https://example.com',
      assigneeName: 'User',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });
});

describe('resolveTemplate', () => {
  it('returns the requested locale when present in defaults', () => {
    const result = resolveTemplate('reporterConfirmation', 'fr');
    expect(result.subject).toContain('Ton rapport');
  });

  it('falls back to en when the requested locale is missing for team templates', () => {
    const result = resolveTemplate('newReport', 'de');
    expect(result.subject).toContain('New Bug Report');
  });

  it('prefers the requested locale from custom overrides over defaults', () => {
    const overrides: CustomEmailTemplates = {
      reporterConfirmation: {
        de: { subject: 'Custom DE', html: '<p>de</p>' },
      },
    };
    const result = resolveTemplate('reporterConfirmation', 'de', overrides);
    expect(result.subject).toBe('Custom DE');
  });

  it('preserves built-in translations when only English is overridden', () => {
    const overrides: CustomEmailTemplates = {
      reporterConfirmation: {
        en: { subject: 'Custom EN override', html: '<p>en</p>' },
      },
    };
    const result = resolveTemplate('reporterConfirmation', 'fr', overrides);
    expect(result.subject).toBe(defaultEmailTemplates.reporterConfirmation.fr.subject);
  });

  it('falls through to defaults when override has neither requested locale nor en', () => {
    const overrides: CustomEmailTemplates = {
      reporterConfirmation: {},
    };
    const result = resolveTemplate('reporterConfirmation', 'fr', overrides);
    expect(result.subject).toContain('Ton rapport');
  });

  it('does not cross-fall to a different locale in overrides', () => {
    const overrides: CustomEmailTemplates = {
      reporterConfirmation: {
        de: { subject: 'German override', html: '<p>de</p>' },
      },
    };
    const result = resolveTemplate('reporterConfirmation', 'fr', overrides);
    expect(result.subject).not.toBe('German override');
    expect(result.subject).toContain('Ton rapport');
  });
});

describe('reporter-facing emails honor reporter locale', () => {
  it('renders the French confirmation template for a French report', async () => {
    let captured: { subject: string; html: string } | null = null;
    const sendEmailSpy = mock(async (opts: { subject: string; html: string }) => {
      captured = { subject: opts.subject, html: opts.html };
      return { success: true };
    });
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy as never;

    await emailService.sendReporterConfirmationEmail('reporter@example.com', {
      report: { ...baseReport, reporterLocale: 'fr' },
      projectName: 'Projet',
      appName: 'BugPin',
      appUrl: 'https://example.com',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    expect(captured).not.toBeNull();
    expect(captured!.subject).toContain('Ton rapport');
    expect(captured!.html).toContain('Rapport reçu');

    emailService.sendEmail = originalSendEmail;
  });

  it('uses the German status label for a German status-change email', async () => {
    let captured: { subject: string; html: string } | null = null;
    const sendEmailSpy = mock(async (opts: { subject: string; html: string }) => {
      captured = { subject: opts.subject, html: opts.html };
      return { success: true };
    });
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy as never;

    await emailService.sendReporterStatusChangeEmail('reporter@example.com', {
      report: { ...baseReport, reporterLocale: 'de' },
      projectName: 'Projekt',
      appName: 'BugPin',
      appUrl: 'https://example.com',
      oldStatus: 'open',
      newStatus: 'in_progress',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    expect(captured).not.toBeNull();
    expect(captured!.html).toContain('Offen');
    expect(captured!.html).toContain('In Bearbeitung');
    expect(captured!.html).toContain('Berichtsstatus aktualisiert');

    emailService.sendEmail = originalSendEmail;
  });
});
