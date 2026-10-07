import type { Context, Next } from 'hono';
import type { EEPlugin, EEFeature, ProjectLicenseService } from '../types/ee-plugin.js';
import { registerEEHooks, resetEEHooks } from './ee-hooks.js';
import { logger } from './logger.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';

/**
 * Enterprise Edition utilities
 *
 * Provides functions to check EE availability and license status.
 * The actual license validation logic lives in ee/src/licensing/
 */

// Cache EE availability check
let eeAvailable: boolean | null = null;

// Resolved EE module path (dist/ in production, src/ in development)
let eeModulePath: string | null = null;

// Cached EE plugin instance
let eePlugin: EEPlugin | null = null;

// Flag to track if EE has been initialized
let eeInitialized = false;

/**
 * Resolve the EE module path.
 * Prefers source in development and compiled modules in production.
 */
function resolveEEPath(): string | null {
  if (eeModulePath) return eeModulePath;

  const paths =
    process.env.NODE_ENV === 'development'
      ? ['../../../ee/src', '../../../ee/dist']
      : ['../../../ee/dist', '../../../ee/src'];
  for (const path of paths) {
    try {
      require.resolve(path);
      eeModulePath = path;
      return eeModulePath;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Check if EE code is available (submodule present)
 */
export function isEEAvailable(): boolean {
  if (eeAvailable !== null) return eeAvailable;
  eeAvailable = resolveEEPath() !== null;
  return eeAvailable;
}

/**
 * Get the EE license service if available
 */
export function getEELicenseService() {
  const path = resolveEEPath();
  if (!path) return null;

  try {
    const ee = require(path);
    return ee.licenseService;
  } catch {
    return null;
  }
}

export function getEEProjectLicenseService(): ProjectLicenseService | null {
  const path = resolveEEPath();
  if (!path) return null;
  return require(path).projectLicenseService ?? null;
}

export async function syncEELicense(): Promise<import('./result.js').Result<boolean>> {
  const path = resolveEEPath();
  const { Result } = await import('./result.js');
  if (!path) return Result.fail('Enterprise Edition is not installed', 'EE_NOT_AVAILABLE');
  const refresh = require(path).refreshLicense;
  if (!refresh) return Result.fail('License sync is unavailable', 'SYNC_UNAVAILABLE');
  return refresh();
}

/**
 * Get the EE plugin if available
 */
export function getEEPlugin(): EEPlugin | null {
  if (!isEEAvailable()) return null;
  if (eePlugin) return eePlugin;

  try {
    const ee = require(resolveEEPath()!);
    if (ee.createPlugin) {
      eePlugin = ee.createPlugin();
      return eePlugin;
    }
  } catch (error) {
    logger.warn('Failed to load EE plugin', { error });
  }

  return null;
}

/**
 * Initialize EE plugin
 * Called once at server startup
 */
export async function initializeEE(): Promise<void> {
  if (eeInitialized) return;

  const plugin = getEEPlugin();
  if (!plugin) {
    logger.info('Enterprise Edition not available');
    resetEEHooks();
    eeInitialized = true;
    return;
  }

  try {
    await plugin.initialize();
  } catch (error) {
    logger.error('Failed to initialize Enterprise Edition', { error });
    resetEEHooks();
    eeInitialized = true;
    return;
  }

  // License restore is best-effort — errors here should not disable EE
  try {
    if (!plugin.isLicensed()) {
      const storedKey = await settingsRepo.get<string>('ee:license_key');
      if (storedKey && (await settingsRepo.get<string>('ee:license_revoked_key')) !== storedKey) {
        const licenseService = getEELicenseService();
        if (licenseService) {
          const result = await licenseService.validateAndStore(storedKey);
          if (result.valid) {
            logger.info('License restored from database');
          } else {
            logger.warn('Stored license key is no longer valid', { error: result.error });
            if (!licenseService.validate(storedKey, true).valid)
              await settingsRepo.delete('ee:license_key');
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to restore license from database', { error });
  }

  const ee = require(resolveEEPath()!);
  ee.startLicenseRefresh?.();

  registerEEHooks(plugin.getHooks());
  logger.info('Enterprise Edition initialized', {
    name: plugin.name,
    version: plugin.version,
    licensed: plugin.isLicensed(),
  });

  eeInitialized = true;
}

/**
 * Get EE routes to mount on the API router
 * Returns a Map of path prefix to Hono app
 */
export function getEERoutes(): Map<string, import('hono').Hono> {
  const plugin = getEEPlugin();
  if (!plugin) return new Map();
  return plugin.getRoutes();
}

/**
 * Check if EE is available AND licensed
 */
export function isEELicensed(): boolean {
  const plugin = getEEPlugin();
  if (plugin) {
    return plugin.isLicensed();
  }

  // Fallback to license service for backwards compatibility
  const licenseService = getEELicenseService();
  if (!licenseService) return false;
  return licenseService.isValid();
}

/**
 * Check if a specific EE feature is available and licensed
 */
export function hasEEFeature(feature: EEFeature): boolean {
  const plugin = getEEPlugin();
  if (plugin) {
    return plugin.hasFeature(feature);
  }

  // Fallback to license service for backwards compatibility
  const licenseService = getEELicenseService();
  if (!licenseService) return false;
  return licenseService.hasFeature(feature);
}

/**
 * Get license status for API responses
 */
export function getLicenseStatus() {
  const licenseService = getEELicenseService();
  if (!licenseService) {
    return {
      eeAvailable: false,
      licensed: false,
      message: 'Enterprise Edition not installed',
    };
  }

  const license = licenseService.getLicense();
  if (!license) {
    return {
      eeAvailable: true,
      licensed: false,
      message: 'No license installed',
    };
  }

  if (!licenseService.isValid()) {
    return {
      eeAvailable: true,
      licensed: false,
      message: 'License expired',
    };
  }

  return {
    eeAvailable: true,
    licensed: true,
    ...getEEProjectLicenseService()?.getStatus(),
    plan: license.plan,
    customerName: license.customerName,
    customerEmail: license.customerEmail,
    features: licenseService.getStatus().features,
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
  };
}

/**
 * Middleware that requires EE license
 * Returns 402 Payment Required if not licensed
 */
export function requireEELicense() {
  return async (c: Context, next: Next) => {
    if (!isEELicensed()) {
      return c.json(
        {
          error: 'Enterprise license required',
          code: 'LICENSE_REQUIRED',
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }
    return next();
  };
}

/**
 * Middleware that requires a specific EE feature
 * Returns 402 Payment Required if feature not licensed
 */
export function requireEEFeature(feature: EEFeature) {
  return async (c: Context, next: Next) => {
    if (!isEEAvailable()) {
      return c.json(
        {
          error: 'Enterprise Edition required',
          code: 'EE_REQUIRED',
          feature,
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }

    if (!hasEEFeature(feature)) {
      return c.json(
        {
          error: `Feature '${feature}' requires Enterprise license`,
          code: 'FEATURE_NOT_LICENSED',
          feature,
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }

    return next();
  };
}

/**
 * Reset EE state - used primarily for testing
 */
export function resetEEState(): void {
  const path = resolveEEPath();
  if (path) require(path).stopLicenseRefresh?.();
  eeAvailable = null;
  eeModulePath = null;
  eePlugin = null;
  eeInitialized = false;
  resetEEHooks();
}
