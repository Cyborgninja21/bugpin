import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { requireLicenseAgreement } from '../../middleware/license-agreement.js';
import {
  getLicenseStatus,
  isEEAvailable,
  hasEEFeature,
  getEELicenseService,
  getEEProjectLicenseService,
  syncEELicense,
} from '../../utils/ee.js';
import type { EEFeature } from '../../types/ee-plugin.js';
import { projectsService } from '../../services/projects.service.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';

const app = new Hono();

/**
 * GET /api/license/status - Get license status (authenticated users only)
 */
app.get('/status', authMiddleware, async (c) => {
  const status = getLicenseStatus();
  return c.json(status);
});

/**
 * GET /api/license/features - Check which EE features are available
 */
app.get('/features', authMiddleware, async (c) => {
  const features: EEFeature[] = [
    'custom-branding',
    'sso',
    'audit-log',
    'api-access',
    'webhooks',
    'white-label',
    'custom-templates',
    's3-storage',
  ];

  const featureStatus = features.reduce(
    (acc, feature) => {
      acc[feature] = hasEEFeature(feature);
      return acc;
    },
    {} as Record<string, boolean>
  );

  return c.json({
    eeAvailable: isEEAvailable(),
    features: featureStatus,
  });
});

/**
 * GET /api/license/feature/:feature - Check if a specific feature is available
 */
app.get('/feature/:feature', authMiddleware, async (c) => {
  const feature = c.req.param('feature') as EEFeature;
  const available = hasEEFeature(feature);

  return c.json({
    feature,
    available,
    eeAvailable: isEEAvailable(),
  });
});

/**
 * POST /api/license/activate - Activate a license key (admin only)
 */
app.post('/activate', authMiddleware, authorize(['admin']), requireLicenseAgreement, async (c) => {
  const licenseService = getEELicenseService();

  if (!licenseService) {
    return c.json(
      {
        success: false,
        error: 'EE_NOT_AVAILABLE',
        message: 'Enterprise Edition is not installed',
      },
      400
    );
  }

  try {
    const body = await c.req.json();
    const { licenseKey } = body;

    if (!licenseKey || typeof licenseKey !== 'string') {
      return c.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'License key is required',
        },
        400
      );
    }

    const result = licenseService.validate(licenseKey);

    if (!result.valid) {
      return c.json(
        {
          success: false,
          error: 'INVALID_LICENSE',
          message: result.error || 'Invalid license key',
        },
        400
      );
    }

    const projects = getEEProjectLicenseService();
    if (!projects) {
      return c.json(
        {
          success: false,
          error: 'EE_UPDATE_REQUIRED',
          message: 'Update Enterprise Edition to activate this license',
        },
        400
      );
    }
    const activation = await projects.activate(
      licenseKey,
      body.projectIds,
      c.get('licenseAgreementAcceptance')
    );
    if (!activation.success) {
      const available = await projectsService.list();
      return c.json(
        {
          success: false,
          error: activation.code,
          message: activation.error,
          projectLimit:
            'projectLimit' in activation ? activation.projectLimit : result.license?.seats,
          projects: available.success ? available.value.map(({ id, name }) => ({ id, name })) : [],
        },
        400
      );
    }
    return c.json({ success: true, license: activation.value });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'ACTIVATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to activate license',
      },
      500
    );
  }
});

/**
 * DELETE /api/license - Remove the current license (admin only)
 */
app.delete('/', authMiddleware, authorize(['admin']), async (c) => {
  const licenseService = getEELicenseService();

  if (!licenseService) {
    return c.json(
      {
        success: false,
        error: 'EE_NOT_AVAILABLE',
        message: 'Enterprise Edition is not installed',
      },
      400
    );
  }

  try {
    await settingsRepo.delete('ee:license_key');
    await licenseService.removeLicense();
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'REMOVE_FAILED',
        message: 'Failed to remove license',
      },
      500
    );
  }
});

app.put('/projects', authMiddleware, authorize(['admin']), async (c) => {
  const service = getEEProjectLicenseService();
  if (!service) return c.json({ success: false, error: 'EE_NOT_AVAILABLE' }, 400);
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('projectIds' in body)) {
    return c.json(
      { success: false, error: 'INVALID_INPUT', message: 'projectIds is required' },
      400
    );
  }
  const result = service.selectProjects(body.projectIds);
  return result.success
    ? c.json({ success: true, ...result.value })
    : c.json({ success: false, error: result.code, message: result.error }, 400);
});

app.post('/sync', authMiddleware, authorize(['admin']), async (c) => {
  const result = await syncEELicense();
  return result.success
    ? c.json({ success: true, updated: result.value, ...getLicenseStatus() })
    : c.json({ success: false, error: 'LICENSE_SYNC_FAILED', message: result.error }, 502);
});

export default app;
