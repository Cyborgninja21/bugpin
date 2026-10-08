import type { MiddlewareHandler } from 'hono';
import {
  ENTERPRISE_AGREEMENT_VERSION,
  type EnterpriseLicenseAcceptance,
} from '@shared/enterprise-license';
import { createLicenseAgreementAcceptance } from '../services/license-agreement.service.js';
import { getEEProjectLicenseService } from '../utils/ee.js';

declare module 'hono' {
  interface ContextVariableMap {
    licenseAgreementAcceptance: EnterpriseLicenseAcceptance;
  }
}

export const requireLicenseAgreement: MiddlewareHandler = async (c, next) => {
  const projects = getEEProjectLicenseService();
  if (projects && projects.agreementVersion !== ENTERPRISE_AGREEMENT_VERSION) {
    return c.json(
      {
        success: false,
        error: 'EE_UPDATE_REQUIRED',
        message: 'Update Enterprise Edition to activate this license',
      },
      400
    );
  }
  const body: unknown = await c.req.json().catch(() => null);
  const agreement =
    body && typeof body === 'object' && 'agreement' in body ? body.agreement : undefined;
  const user = c.get('user');
  const result = createLicenseAgreementAcceptance(agreement, user.id, user);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  c.set('licenseAgreementAcceptance', result.value);
  return next();
};
