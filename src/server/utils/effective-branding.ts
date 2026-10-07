import type { AppSettings } from '@shared/types';
import { DEFAULT_BRANDING, DEFAULT_ADMIN_BUTTON } from '../database/repositories/settings.repo.js';
import { hasEEFeature } from './ee.js';

export function withEffectiveBranding(settings: AppSettings): AppSettings {
  if (hasEEFeature('custom-branding')) return settings;
  return {
    ...settings,
    branding: { ...DEFAULT_BRANDING },
    adminButton: { ...DEFAULT_ADMIN_BUTTON },
  };
}
