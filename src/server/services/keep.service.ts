import { logger } from '../utils/logger.js';
import { settingsCacheService } from './settings-cache.service.js';
import type { Report } from '@shared/types';

/**
 * Keep notification service (homelab fork addition — not upstream).
 *
 * Pushes a Keep-native event to the homelab's Keep notification hub the moment
 * a report is created, so a new bug reaches a human on Telegram immediately
 * instead of waiting on (or being lost to) the GitHub forward path.
 *
 * WHY AT CREATION, not after the GitHub sync:
 *   The GitHub integration is the fragile hop — a stale token, a renamed repo,
 *   or a misconfigured target silently strands reports in BugPin's DB. That is
 *   exactly the failure this notification is meant to surface, so it must not
 *   depend on the same path succeeding. The event therefore links the BugPin
 *   report (always valid) rather than the GitHub issue (may not exist yet).
 *
 * SEVERITY CONTRACT (deliberate):
 *   Keep's fleet paging workflow (keep-telegram-notify) triggers on
 *   severity high|critical. Bug reports are NOT fleet alerts and must never
 *   dilute that channel, so every event here is pushed at `info` and routed by
 *   a dedicated workflow that filters on `source == bugpin` instead. Do not
 *   "upgrade" the severity to make it page — that double-fires both workflows
 *   and puts user-submitted noise into the on-call path.
 *
 * FAIL-OPEN: every failure is logged and swallowed. A notification hub being
 * down must never cost a user their bug report.
 *
 * Config (all optional — the service is a no-op unless URL and key are both set):
 *   KEEP_URL       base url of the Keep hub, e.g. https://keep.epikos-kyklos.com
 *   KEEP_API_KEY   Keep webhook-role api key (sent as x-api-key)
 *   KEEP_SOURCE    source tag on the event (default "bugpin")
 *   KEEP_TIMEOUT_MS request timeout in ms (default 10000)
 */

const KEEP_URL = (process.env.KEEP_URL || '').replace(/\/+$/, '');
const KEEP_API_KEY = process.env.KEEP_API_KEY || '';
const KEEP_SOURCE = process.env.KEEP_SOURCE || 'bugpin';
const KEEP_TIMEOUT_MS = Number(process.env.KEEP_TIMEOUT_MS || '10000');

// Keep's native ingest endpoint. NOT /v2/alerts/event/webhook — that provider
// has no format_alert(), so posts there return 202 but silently degrade into
// error alerts that never trigger a workflow.
const KEEP_INGEST_PATH = '/v2/alerts/event';

function isEnabled(): boolean {
  return Boolean(KEEP_URL && KEEP_API_KEY);
}

export const keepService = {
  isEnabled,

  /**
   * Fire-and-forget a "new report" event at the Keep hub.
   * Never throws — callers may safely ignore the returned promise.
   */
  async notifyNewReport(report: Report, projectName?: string): Promise<void> {
    if (!isEnabled()) {
      logger.debug('Keep notification skipped — KEEP_URL/KEEP_API_KEY not configured', {
        reportId: report.id,
      });
      return;
    }

    let reportUrl = `/admin/reports/${report.id}`;
    try {
      const settings = await settingsCacheService.getAll();
      if (settings.appUrl) {
        reportUrl = `${String(settings.appUrl).replace(/\/+$/, '')}${reportUrl}`;
      }
    } catch (error) {
      logger.warn('Keep notification could not resolve appUrl; sending a relative link', {
        reportId: report.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const pageUrl = report.metadata?.url || 'unknown page';

    // Every field below is a DECLARED Keep AlertDto field. Do NOT add optional
    // custom keys and then template them in a workflow message body — Keep's
    // iohandler RAISES on a missing key there, the action fails, and after its
    // retries the notification is lost.
    const payload = {
      name: `BugPin: ${report.title}`,
      message: [
        `${report.reportType} · priority ${report.priority}`,
        `page: ${pageUrl}`,
        `report: ${reportUrl}`,
        report.reporterName || report.reporterEmail
          ? `by: ${report.reporterName || report.reporterEmail}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
      description: report.description || report.title,
      severity: 'info',
      status: 'firing',
      source: [KEEP_SOURCE],
      // Stable per-report identity so Keep dedups retries rather than stacking
      // duplicate events for the same submission.
      fingerprint: `bugpin-${report.id}`,
      labels: {
        project: projectName || report.projectName || report.projectId,
        reportType: report.reportType,
        priority: report.priority,
        reportId: report.id,
        page: pageUrl,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEEP_TIMEOUT_MS);
    try {
      const response = await fetch(`${KEEP_URL}${KEEP_INGEST_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Keep rejects `Authorization: Bearer` — it wants x-api-key.
          'x-api-key': KEEP_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Keep notification rejected', undefined, {
          reportId: report.id,
          status: response.status,
          body: body.slice(0, 300),
        });
        return;
      }

      logger.info('Keep notification sent', {
        reportId: report.id,
        status: response.status,
      });
    } catch (error) {
      logger.error('Keep notification failed', error, { reportId: report.id });
    } finally {
      clearTimeout(timer);
    }
  },
};
