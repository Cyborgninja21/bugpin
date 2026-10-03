import { afterEach, expect, it, vi } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { EnterpriseSettings } from '../../../pages/console/EnterpriseSettings';
import { api } from '../../../api/client';
import { licenseApi } from '../../../api/license';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
afterEach(() => vi.restoreAllMocks());

it('sends the selected project in the webhook query and applies white-label controls', async () => {
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { webhooks: true, 'white-label': true },
  });
  vi.spyOn(api, 'get').mockImplementation(
    async (url) =>
      ({
        data:
          url === '/projects'
            ? { projects: [{ id: 'prj_test', name: 'Example' }] }
            : url === '/webhooks'
              ? { webhooks: [] }
              : {
                  config: {
                    hideFooterBranding: false,
                    hideEmailBranding: false,
                    hidePoweredBy: false,
                  },
                },
      }) as never
  );
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });
  const user = userEvent.setup();
  renderWithQuery(<EnterpriseSettings />);
  await user.type(await screen.findByLabelText('Webhook name'), 'Receiver');
  await user.type(screen.getByLabelText('Receiver URL'), 'https://example.com/webhook');
  await user.click(screen.getByRole('button', { name: 'Create webhook' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/webhooks?projectId=prj_test',
      expect.objectContaining({ name: 'Receiver', events: ['report.created'] })
    )
  );
  expect(screen.queryByLabelText('Hide widget “Powered by BugPin”')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Copyright text'), 'Example Ltd');
  await user.click(screen.getByRole('button', { name: 'Save white-label settings' }));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith(
      '/white-label/config',
      expect.objectContaining({ customCopyright: 'Example Ltd' })
    )
  );
});

it('shows a newly created token once and clears it on dismissal', async () => {
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { 'api-access': true },
  });
  vi.spyOn(api, 'get').mockResolvedValue({ data: { tokens: [] } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: { rawToken: 'bp_example_secret' } });
  const user = userEvent.setup();
  renderWithQuery(<EnterpriseSettings />);
  await user.type(await screen.findByLabelText('Token name'), 'Automation');
  await user.click(screen.getByRole('button', { name: 'Create token' }));
  expect(await screen.findByLabelText('New API token')).toHaveValue('bp_example_secret');
  await user.click(screen.getByRole('button', { name: 'Dismiss token' }));
  expect(screen.queryByDisplayValue('bp_example_secret')).not.toBeInTheDocument();
});
