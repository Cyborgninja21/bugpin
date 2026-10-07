import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { Language } from '../../../pages/widget/Language';
import { api } from '../../../api/client';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function mockSettings(language: { mode: 'auto' | 'manual'; defaultLanguage: string }) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/settings') {
      return { data: { success: true, settings: { language } } };
    }
    return { data: {} };
  });
}

describe('Widget Language page', () => {
  it('shows the stored default language instead of the placeholder', async () => {
    mockSettings({ mode: 'auto', defaultLanguage: 'de' });

    renderWithProviders(<Language />);

    const trigger = await screen.findByRole('combobox', { name: /default language/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Deutsch'));
    expect(trigger).not.toHaveAttribute('data-placeholder');
  });

  it('saves the stored default language unchanged when nothing was edited', async () => {
    const user = userEvent.setup();
    mockSettings({ mode: 'manual', defaultLanguage: 'de' });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });

    renderWithProviders(<Language />);

    const trigger = await screen.findByRole('combobox', { name: /default language/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Deutsch'));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        language: { mode: 'manual', defaultLanguage: 'de' },
      });
    });
  });
});
