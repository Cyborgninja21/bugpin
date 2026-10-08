export const ENTERPRISE_AGREEMENT_VERSION = '2026-10-04';
export const ENTERPRISE_AGREEMENT_URL = 'https://bugpin.io/eula/2026-10-04.txt';

export interface EnterpriseLicenseAcceptance {
  id: string;
  agreementVersion: string;
  agreementUrl: string;
  acceptedAt: string;
  acceptedBy: string;
  acceptedByName?: string;
  acceptedByEmail?: string;
}
