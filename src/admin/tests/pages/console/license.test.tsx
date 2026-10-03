import { afterEach, expect, it, vi } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { License } from '../../../pages/console/License';
import { licenseApi } from '../../../api/license';

afterEach(() => vi.restoreAllMocks());

it('requires exact confirmation for removal, resets on dismissal, and prevents repeat requests', async () => {
  let licensed = true;
  let finishRemoval!: () => void;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed,
  }));
  const remove = vi.spyOn(licenseApi, 'remove').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishRemoval = () => {
          licensed = false;
          resolve();
        };
      })
  );
  const user = userEvent.setup();
  renderWithQuery(<License />);
  const openDialog = await screen.findByRole('button', { name: 'Remove License' });
  await user.click(openDialog);
  const input = screen.getByRole('textbox', { name: 'Type license to confirm' });
  const confirm = screen.getByRole('button', { name: 'Remove' });
  expect(confirm).toBeDisabled();
  await user.click(confirm);
  await user.type(input, 'licens');
  expect(confirm).toBeDisabled();
  await user.clear(input);
  await user.type(input, 'LICENSE');
  expect(confirm).toBeDisabled();
  await user.clear(input);
  await user.type(input, 'license');
  expect(confirm).toBeEnabled();
  expect(remove).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(openDialog);
  expect(screen.getByRole('textbox', { name: 'Type license to confirm' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'license');
  await user.keyboard('{Escape}');
  await user.click(openDialog);
  expect(screen.getByRole('textbox', { name: 'Type license to confirm' })).toHaveValue('');
  expect(remove).not.toHaveBeenCalled();

  await user.type(screen.getByRole('textbox'), 'license');
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(openDialog).toBeDisabled();
  await user.click(openDialog);
  expect(remove).toHaveBeenCalledTimes(1);
  finishRemoval();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Activate License' })).toBeInTheDocument()
  );
});

it('asks for project selection before activating an over-capacity license', async () => {
  const projects = [
    { id: 'proj_one', name: 'Project One' },
    { id: 'proj_two', name: 'Project Two' },
  ];
  let licensed = false;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed,
    projectLimit: licensed ? 1 : undefined,
    usedProjects: licensed ? 1 : undefined,
    licensedProjectIds: licensed ? ['proj_one'] : undefined,
  }));
  const { api } = await import('../../../api/client');
  vi.spyOn(api, 'get').mockResolvedValue({ data: { projects } });
  const activate = vi
    .spyOn(licenseApi, 'activate')
    .mockRejectedValueOnce({
      response: { data: { error: 'PROJECT_SELECTION_REQUIRED', projectLimit: 1, projects } },
    })
    .mockImplementationOnce(async () => {
      licensed = true;
    });
  const user = userEvent.setup();
  renderWithQuery(<License />);
  await user.type(await screen.findByRole('textbox', { name: 'License Key' }), 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Project One' }));
  expect(screen.getByRole('checkbox', { name: 'Project Two' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  await waitFor(() => expect(activate).toHaveBeenLastCalledWith('test-license', ['proj_one']));
  expect(await screen.findByText('1 of 1 projects used')).toBeInTheDocument();
});

it('syncs an increased allowance without reactivation and lets the admin allocate the new slot', async () => {
  const { api } = await import('../../../api/client');
  const projects = [
    { id: 'proj_one', name: 'Project One' },
    { id: 'proj_two', name: 'Project Two' },
  ];
  vi.spyOn(api, 'get').mockResolvedValue({ data: { projects } });
  let limit = 1;
  let ids = ['proj_one'];
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed: true,
    projectLimit: limit,
    usedProjects: ids.length,
    licensedProjectIds: ids,
    selectionRequired: false,
  }));
  const activate = vi.spyOn(licenseApi, 'activate');
  const sync = vi.spyOn(licenseApi, 'sync').mockImplementation(async () => {
    limit = 2;
    return { eeAvailable: true, licensed: true, projectLimit: limit };
  });
  const select = vi.spyOn(licenseApi, 'selectProjects').mockImplementation(async (next) => {
    ids = next;
  });
  const user = userEvent.setup();
  renderWithQuery(<License />);
  expect(await screen.findByRole('checkbox', { name: 'Project Two' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Sync license' }));
  expect(await screen.findByText('1 of 2 projects used')).toBeInTheDocument();
  expect(sync).toHaveBeenCalledTimes(1);
  expect(activate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox', { name: 'Project Two' }));
  await user.click(screen.getByRole('button', { name: 'Save project selection' }));
  await waitFor(() => expect(select.mock.calls[0]?.[0]).toEqual(['proj_one', 'proj_two']));
  expect(await screen.findByText('2 of 2 projects used')).toBeInTheDocument();
});
