import { expect, test } from 'bun:test';
import { createLicenseAgreementAcceptance } from '../../../src/server/services/license-agreement.service';
import {
  ENTERPRISE_AGREEMENT_VERSION,
  ENTERPRISE_AGREEMENT_URL,
} from '../../../src/shared/enterprise-license';

test('only explicit acceptance of the current agreement is allowed', () => {
  for (const value of [
    undefined,
    null,
    false,
    {},
    { accepted: false, version: ENTERPRISE_AGREEMENT_VERSION },
    { accepted: 'true', version: ENTERPRISE_AGREEMENT_VERSION },
    { accepted: true, version: 'old-version' },
  ]) {
    const result = createLicenseAgreementAcceptance(value, 'admin');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('LICENSE_AGREEMENT_REQUIRED');
  }
});

test('acceptance uses the authenticated administrator and server time', () => {
  const start = Date.now();
  const result = createLicenseAgreementAcceptance(
    {
      accepted: true,
      version: ENTERPRISE_AGREEMENT_VERSION,
      acceptedBy: 'other-user',
      acceptedAt: '2000-01-01',
    },
    'admin'
  );
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error);
  expect(result.value.acceptedBy).toBe('admin');
  expect(result.value.agreementUrl).toBe(ENTERPRISE_AGREEMENT_URL);
  expect(Date.parse(result.value.acceptedAt)).toBeGreaterThanOrEqual(start);
  expect(result.value.id).toMatch(/^[a-f0-9-]{36}$/);
});
