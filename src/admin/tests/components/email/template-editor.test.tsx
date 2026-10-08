import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateEditor } from '../../../components/email/TemplateEditor';

it('loads templates without marking edits and clears wrappers when switching to a fragment', async () => {
  const onChange = vi.fn();
  const options = { onChange, availableVariables: ['app.name'], placeholder: 'Template HTML' };
  const { rerender } = render(<TemplateEditor {...options} value="" />);
  const document =
    '<!DOCTYPE html><html><head><title>Wrapper A</title></head><body><p>Template A</p></body></html>';
  rerender(<TemplateEditor {...options} value={document} />);
  await waitFor(() => expect(screen.getByPlaceholderText('Template HTML')).toHaveValue(document));
  expect(onChange).not.toHaveBeenCalled();

  const fragment = '<p>Fragment B {{app.name}}</p>';
  rerender(<TemplateEditor {...options} value={fragment} />);
  await waitFor(() => expect(screen.getByPlaceholderText('Template HTML')).toHaveValue(fragment));
  fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  expect(screen.getByPlaceholderText('Template HTML')).toHaveValue(fragment);
  expect(onChange).not.toHaveBeenCalled();
});
