import {
  ENTERPRISE_AGREEMENT_VERSION,
  ENTERPRISE_AGREEMENT_URL,
  type EnterpriseLicenseAcceptance,
} from '@shared/enterprise-license';
import { Result } from '../utils/result.js';

export function createLicenseAgreementAcceptance(
  input: unknown,
  userId: string,
  actor?: { name: string; email: string }
): Result<EnterpriseLicenseAcceptance> {
  if (
    !input ||
    typeof input !== 'object' ||
    !('accepted' in input) ||
    input.accepted !== true ||
    !('version' in input) ||
    input.version !== ENTERPRISE_AGREEMENT_VERSION
  ) {
    return Result.fail(
      'Accept the current BugPin Enterprise License Agreement before activating your license',
      'LICENSE_AGREEMENT_REQUIRED'
    );
  }
  return Result.ok({
    id: crypto.randomUUID(),
    agreementVersion: ENTERPRISE_AGREEMENT_VERSION,
    agreementUrl: ENTERPRISE_AGREEMENT_URL,
    acceptedAt: new Date().toISOString(),
    acceptedBy: userId,
    ...(actor ? { acceptedByName: actor.name, acceptedByEmail: actor.email } : {}),
  });
}
