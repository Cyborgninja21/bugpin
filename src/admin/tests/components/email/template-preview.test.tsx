import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemplatePreview } from '../../../components/email/TemplatePreview';
import { ThemeProvider, useTheme } from '../../../contexts/ThemeContext';

function Preview({ html }: { html: string }) {
  const { setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setTheme('light')}>Light</button>
      <TemplatePreview subject="Preview" html={html} />
    </>
  );
}

it('updates preview scrollbars without rewriting email content or accumulating styles', () => {
  const html = '<html><head><style>body { color: red; }</style></head><body>Original</body></html>';
  const { rerender } = render(
    <ThemeProvider>
      <Preview html={html} />
    </ThemeProvider>
  );
  const iframe = screen.getByTitle('Email Preview') as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  const body = doc.body;
  body.scrollTop = 42;
  expect(doc.head.querySelectorAll('style')).toHaveLength(2);
  expect(doc.head.lastElementChild?.textContent).toContain('scrollbar-width: thin');

  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  expect(doc.body).toBe(body);
  expect(doc.body.scrollTop).toBe(42);
  expect(doc.body.textContent).toBe('Original');
  expect(doc.head.querySelectorAll('style')).toHaveLength(2);

  rerender(
    <ThemeProvider>
      <Preview html="<html><head></head><body>Updated</body></html>" />
    </ThemeProvider>
  );
  expect(doc.body.textContent).toBe('Updated');
  expect(doc.head.querySelectorAll('style')).toHaveLength(1);
});
