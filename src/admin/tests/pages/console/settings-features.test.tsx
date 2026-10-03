import { afterEach, expect, it, vi } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { Webhooks } from '../../../pages/console/Webhooks';
import { WhiteLabelSettings } from '../../../pages/console/WhiteLabelSettings';
import { api } from '../../../api/client';
import { licenseApi } from '../../../api/license';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
afterEach(() => vi.restoreAllMocks());

it('loads and saves white-label controls', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { config: { hideFooterBranding: true, hideEmailBranding: false } },
  });
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });
  const user = userEvent.setup();
  renderWithQuery(<WhiteLabelSettings />);
  expect(screen.queryByLabelText('Hide widget “Powered by BugPin”')).not.toBeInTheDocument();
  const footerBranding = await screen.findByRole('switch', { name: 'Hide admin footer branding' });
  const emailBranding = screen.getByRole('switch', { name: 'Hide email footer branding' });
  expect(footerBranding).toBeChecked();
  expect(emailBranding).not.toBeChecked();
  await user.click(footerBranding);
  emailBranding.focus();
  await user.keyboard(' ');
  expect(footerBranding).not.toBeChecked();
  expect(emailBranding).toBeChecked();
  await user.type(screen.getByLabelText('Copyright text'), 'Example Ltd');
  await user.click(screen.getByRole('button', { name: 'Save white-label settings' }));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/white-label/config', {
      hideFooterBranding: false,
      hideEmailBranding: true,
      customCopyright: 'Example Ltd',
    })
  );
});

it('does not load webhook configuration without the feature', async () => {
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { webhooks: false },
  });
  const get = vi.spyOn(api, 'get');
  renderWithQuery(<Webhooks />);

  expect(
    await screen.findByText('This feature requires an Enterprise license.')
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Upgrade to Enterprise' })).toHaveAttribute(
    'href',
    'https://bugpin.io/editions/'
  );
  expect(screen.queryByRole('button', { name: 'Add webhook' })).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/webhooks');
  expect(get).not.toHaveBeenCalledWith('/projects');
});
