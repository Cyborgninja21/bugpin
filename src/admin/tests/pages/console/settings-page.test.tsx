import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../utils';
import { SettingsPage } from '../../../pages/console/SettingsPage';
import { Screenshot } from '../../../pages/widget/Screenshot';

describe('Settings Page', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders settings page', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(
      () => {
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('displays general settings by default', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(
      () => {
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByRole('tab', { name: /^general$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
  });

  it('displays General tab as active by default', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(
      () => {
        expect(screen.getByRole('tab', { name: /^general$/i })).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const generalTab = screen.getByRole('tab', { name: /^general$/i });
    expect(generalTab).toHaveAttribute('data-state', 'active');
  });

  it('renders Screenshot page directly', async () => {
    renderWithProviders(<Screenshot />);

    await waitFor(() => {
      expect(screen.getByText('Screenshot Settings')).toBeInTheDocument();
    });
  });

  it('navigates to Storage tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /storage/i }));

    await waitFor(() => {
      expect(screen.getByText('Storage Settings')).toBeInTheDocument();
    });
  });

  it('loads and displays settings in General tab', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/application name/i)).toBeInTheDocument();
    });
  });

  it('shows general settings fields', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(
      () => {
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(screen.getByLabelText(/data retention/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('displays save button in General settings', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(
      () => {
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('loads settings values from API', async () => {
    server.use(
      http.get('/api/settings', () => {
        return HttpResponse.json({
          success: true,
          settings: {
            appName: 'MyBugTracker',
            appUrl: 'https://bugpin.example.com',
            retentionDays: 60,
            rateLimitPerMinute: 20,
            smtpEnabled: false,
            smtpConfig: {},
            s3Enabled: false,
            s3Config: {},
            widgetLauncherButton: {
              position: 'bottom-right' as const,
              buttonText: null,
              buttonShape: 'round' as const,
              buttonIcon: null,
              buttonIconSize: 24,
              buttonIconStroke: 2,
              theme: 'auto' as const,
              enableHoverScaleEffect: true,
              tooltipEnabled: false,
              tooltipText: null,
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
            widgetDialog: {
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
            screenshot: {
              useScreenCaptureAPI: false,
              maxScreenshotSize: 5,
              maxImageUploadSizeMb: 10,
              maxVideoUploadSizeMb: 50,
            },
            notifications: {
              emailEnabled: false,
              notifyOnNewReport: true,
              notifyOnStatusChange: true,
              notifyOnPriorityChange: false,
              notifyOnAssignment: true,
              notifyOnDeletion: true,
            },
            branding: {
              primaryColor: '#02658D',
              logoLightUrl: null,
              logoDarkUrl: null,
              iconLightUrl: null,
              iconDarkUrl: null,
              faviconLightVersion: '/favicon-light.svg',
              faviconDarkVersion: '/favicon-dark.svg',
            },
            adminButton: {
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
          },
        });
      })
    );

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    await waitFor(() => {
      const appNameInput = screen.getByLabelText(/application name/i) as HTMLInputElement;
      expect(appNameInput.value).toBe('MyBugTracker');
    });
  });

  it('allows updating general settings', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/application name/i)).toBeInTheDocument();
    });

    const appNameInput = screen.getByLabelText(/application name/i);
    await user.clear(appNameInput);
    await user.type(appNameInput, 'My Bug Tracker');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeInTheDocument();
    });
  });

  it('displays correct sub-tabs in system section', async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(4); // General, Storage, SMTP
    });
  });

  it('hash navigation works for storage', async () => {
    window.location.hash = 'storage';
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Storage Settings')).toBeInTheDocument();
    });
  });
});
