import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../utils';
import { ReporterNotifications } from '../../../pages/console/ReporterNotifications';

const allOn = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  messagingEnabled: true,
};

describe('ReporterNotifications', () => {
  it('lets admins disable assignment notifications for reporters', async () => {
    let savedBody: Record<string, unknown> | undefined;
    server.use(
      http.get('/api/settings', () =>
        HttpResponse.json({ success: true, settings: { reporterNotifications: allOn } })
      ),
      http.put('/api/settings', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, settings: savedBody });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ReporterNotifications />);

    const assignmentSwitch = await screen.findByRole('switch', {
      name: /assignment notifications/i,
    });
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(assignmentSwitch);
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(savedBody).toEqual({
        reporterNotifications: { ...allOn, notifyOnAssignment: false },
      });
    });
  });
});
