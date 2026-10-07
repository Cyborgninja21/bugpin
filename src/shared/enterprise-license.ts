export const ENTERPRISE_AGREEMENT_VERSION = '2026-10-04';
export const ENTERPRISE_AGREEMENT_URL = 'https://bugpin.io/eula/';

export interface EnterpriseLicenseAcceptance {
  id: string;
  agreementVersion: string;
  agreementUrl: string;
  acceptedAt: string;
  acceptedBy: string;
}
