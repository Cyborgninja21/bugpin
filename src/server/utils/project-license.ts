import { getEEProjectLicenseService } from './ee.js';
import { Result } from './result.js';

export class ProjectLicenseError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ProjectLicenseError';
  }
}

export function checkProjectLicense(projectId: string): Result<void> {
  return getEEProjectLicenseService()?.checkAccess(projectId) ?? Result.ok(undefined);
}
