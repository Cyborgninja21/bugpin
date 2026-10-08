import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollArea } from '../../../components/ui/scroll-area';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Table, TableBody, TableCell, TableRow } from '../../../components/ui/table';

const observers: TestResizeObserver[] = [];

class TestResizeObserver implements ResizeObserver {
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => vi.unstubAllGlobals());

it('preserves first-field autofocus inside a dialog body', async () => {
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form</DialogTitle>
          <DialogDescription>Enter a value</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <input aria-label="First field" />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus());
});

it('does not add a tab stop to a table that fits its viewport', async () => {
  const user = userEvent.setup();
  render(
    <>
      <button>Before</button>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Short table</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <button>After</button>
    </>
  );
  await user.tab();
  expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
});

it('keeps overflowing read-only content keyboard accessible and updates when controls or overflow change', async () => {
  const { container, rerender } = render(<ScrollArea>Long log</ScrollArea>);
  const viewport = container.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')!;
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 400 },
    clientWidth: { configurable: true, value: 100 },
    scrollWidth: { configurable: true, value: 100 },
  });
  const resize = () => {
    for (const observer of observers) {
      if (observer.targets.has(viewport)) observer.callback([], observer);
    }
  };
  act(resize);
  expect(viewport.tabIndex).toBe(0);
  expect(viewport).toHaveAccessibleName('Scrollable content');

  rerender(
    <ScrollArea>
      <button>Action</button>
    </ScrollArea>
  );
  const button = screen.getByRole('button', { name: 'Action' });
  const rect = new DOMRect(0, 0, 100, 20);
  vi.spyOn(button, 'getClientRects').mockReturnValue(Object.assign([rect], { item: () => rect }));
  button.setAttribute('title', 'Visible control');
  await waitFor(() => expect(viewport.tabIndex).toBe(-1));

  rerender(<ScrollArea>Long log</ScrollArea>);
  await waitFor(() => expect(viewport.tabIndex).toBe(0));
  Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 100 });
  act(resize);
  expect(viewport.tabIndex).toBe(-1);
});
