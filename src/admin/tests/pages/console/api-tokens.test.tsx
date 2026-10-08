import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, renderWithQuery, screen, userEvent, waitFor, within } from '../../utils';
import { ApiTokens } from '../../../pages/console/ApiTokens';
import { api } from '../../../api/client';
import { licenseApi } from '../../../api/license';
import type { ApiToken } from '@shared/types';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
afterEach(() => vi.restoreAllMocks());

const token: ApiToken = {
  id: 'tok_example',
  userId: 'user_example',
  name: 'Daily export',
  tokenPrefix: 'bpat_example',
  scopes: ['read'],
  createdAt: '2026-10-03T10:00:00Z',
  lastUsedAt: '2026-10-03T12:00:00Z',
  expiresAt: '2099-11-02T12:00:00Z',
};

function setupTokens(initial: ApiToken[] = []) {
  const state = { tokens: initial };
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { 'api-access': true },
  });
  vi.spyOn(api, 'get').mockImplementation(async () => ({ data: { tokens: state.tokens } }));
  return state;
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Create token' }));
  return screen.findByRole('dialog', { name: 'Create API token' });
}

it('opens a fresh creation form each time and cancels without creating a token', async () => {
  setupTokens();
  const post = vi.spyOn(api, 'post');
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  expect(await screen.findByText('No API tokens yet')).toBeInTheDocument();
  expect(screen.queryByLabelText('Token name')).not.toBeInTheDocument();

  const dialog = await openCreate(user);
  await user.type(within(dialog).getByLabelText('Token name'), 'Discarded');
  await user.click(within(dialog).getByRole('combobox', { name: 'Scope' }));
  await user.click(screen.getByRole('option', { name: 'Read and write' }));
  await user.clear(within(dialog).getByLabelText('Expires in days'));
  await user.type(within(dialog).getByLabelText('Expires in days'), '14');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  await openCreate(user);
  expect(screen.getByLabelText('Token name')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('Read');
  expect(screen.getByLabelText('Expires in days')).toHaveValue(30);
  expect(post).not.toHaveBeenCalled();
});

it('creates, copies, lists a token, and resets the form for the next token', async () => {
  const state = setupTokens([token]);
  const created = {
    ...token,
    id: 'tok_new',
    name: 'Automation',
    scopes: ['write'] as ApiToken['scopes'],
    tokenPrefix: 'bpat_new',
  };
  const post = vi.spyOn(api, 'post').mockImplementation(async () => {
    state.tokens = [created, token];
    return { data: { token: created, rawToken: 'bpat_example_secret' } };
  });
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  renderWithQuery(<ApiTokens />);
  const dialog = await openCreate(user);
  await user.type(within(dialog).getByLabelText('Token name'), 'Automation');
  await user.click(within(dialog).getByRole('combobox', { name: 'Scope' }));
  await user.click(screen.getByRole('option', { name: 'Read and write' }));
  await user.clear(within(dialog).getByLabelText('Expires in days'));
  await user.type(within(dialog).getByLabelText('Expires in days'), '14');
  await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

  expect(await screen.findByLabelText('New API token')).toHaveValue('bpat_example_secret');
  await user.keyboard('{Escape}');
  expect(screen.getByLabelText('New API token')).toHaveValue('bpat_example_secret');
  fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' });
  expect(screen.getByLabelText('New API token')).toHaveValue('bpat_example_secret');
  expect(post).toHaveBeenCalledWith('/tokens', {
    name: 'Automation',
    scopes: ['write'],
    expiresInDays: 14,
  });
  await user.click(screen.getByRole('button', { name: 'Copy token' }));
  expect(copy).toHaveBeenCalledWith('bpat_example_secret');
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Done' }));

  expect(screen.queryByDisplayValue('bpat_example_secret')).not.toBeInTheDocument();
  const table = await screen.findByRole('table', { name: 'API tokens' });
  expect(within(table).getByText('Automation')).toBeInTheDocument();
  expect(within(table).getByText('Daily export')).toBeInTheDocument();
  expect(within(table).queryByText('bpat_example_secret')).not.toBeInTheDocument();
  await openCreate(user);
  expect(screen.getByLabelText('Token name')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('Read');
  expect(screen.getByLabelText('Expires in days')).toHaveValue(30);
  expect(screen.queryByLabelText('New API token')).not.toBeInTheDocument();
});

it('allows Escape to dismiss the creation form before a secret is issued', async () => {
  setupTokens();
  const post = vi.spyOn(api, 'post');
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  await openCreate(user);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('keeps form entries when creation fails so the request can be retried', async () => {
  setupTokens();
  vi.spyOn(api, 'post').mockRejectedValue(new Error('Token limit reached'));
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  const dialog = await openCreate(user);
  await user.type(within(dialog).getByLabelText('Token name'), 'Automation');
  await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Token limit reached');
  expect(screen.getByLabelText('Token name')).toHaveValue('Automation');
  expect(screen.queryByLabelText('New API token')).not.toBeInTheDocument();
});

it('keeps the one-time token visible if copying is unavailable', async () => {
  setupTokens();
  vi.spyOn(api, 'post').mockResolvedValue({ data: { token, rawToken: 'bpat_example_secret' } });
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard unavailable'));
  renderWithQuery(<ApiTokens />);
  const dialog = await openCreate(user);
  await user.type(within(dialog).getByLabelText('Token name'), 'Daily export');
  await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
  await user.click(await screen.findByRole('button', { name: 'Copy token' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select it and copy it manually');
  expect(screen.getByLabelText('New API token')).toHaveValue('bpat_example_secret');
});

it('shows readable scopes, dates, last use, and expiry status in the list', async () => {
  setupTokens([
    token,
    {
      ...token,
      id: 'tok_expired',
      name: 'Old integration',
      scopes: ['write'],
      lastUsedAt: undefined,
      expiresAt: '2020-01-01T12:00:00Z',
    },
    {
      ...token,
      id: 'tok_admin',
      name: 'Admin integration',
      scopes: ['admin'],
      expiresAt: undefined,
    },
  ]);
  renderWithQuery(<ApiTokens />);
  const table = await screen.findByRole('table', { name: 'API tokens' });
  const active = within(table).getByRole('row', { name: /Daily export/ });
  expect(within(active).getByText('Read')).toBeInTheDocument();
  expect(within(active).getByText('Oct 3, 2026')).toBeInTheDocument();
  expect(within(active).getByText('Nov 2, 2099')).toBeInTheDocument();
  expect(within(active).getByText('Active')).toBeInTheDocument();
  const expired = within(table).getByRole('row', { name: /Old integration/ });
  expect(within(expired).getByText('Expired')).toBeInTheDocument();
  expect(within(expired).getByText('Read and write')).toBeInTheDocument();
  expect(within(expired).getByText('Never')).toBeInTheDocument();
  const admin = within(table).getByRole('row', { name: /Admin integration/ });
  expect(within(admin).getByText('Admin')).toBeInTheDocument();
  expect(within(admin).getByText('No expiration')).toBeInTheDocument();
});

it('confirms revocation and removes the revoked token from the list', async () => {
  const state = setupTokens([token]);
  const remove = vi.spyOn(api, 'delete').mockImplementation(async () => {
    state.tokens = [];
    return { data: { success: true } };
  });
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  await user.click(await screen.findByRole('button', { name: 'Revoke Daily export' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Revoke Daily export' }));
  await user.click(screen.getByRole('button', { name: 'Revoke token' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('/tokens/tok_example'));
  expect(await screen.findByText('No API tokens yet')).toBeInTheDocument();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('keeps the token and confirmation dialog when revocation fails', async () => {
  setupTokens([token]);
  vi.spyOn(api, 'delete').mockRejectedValue(new Error('Unable to revoke token'));
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  await user.click(await screen.findByRole('button', { name: 'Revoke Daily export' }));
  await user.click(screen.getByRole('button', { name: 'Revoke token' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to revoke token');
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Daily export')).toBeInTheDocument();
});

it('retries loading the token list after a request failure', async () => {
  setupTokens([token]);
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Network unavailable'));
  const user = userEvent.setup();
  renderWithQuery(<ApiTokens />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your API tokens');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('table', { name: 'API tokens' })).toBeInTheDocument();
});
