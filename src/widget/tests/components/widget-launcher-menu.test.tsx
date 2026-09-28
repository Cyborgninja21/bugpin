import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { MENU_OPEN_DELAY, resolveNewsUrl } from '../../hooks/use-launcher-menu';
import { __resetI18nForTests } from '../../i18n/index';
import { installDom } from '../helpers/dom';

let restoreDom: (() => void) | null = null;
const originalLocalStorage = globalThis.localStorage;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

beforeEach(() => {
  restoreDom = installDom();
  __resetI18nForTests();
  globalThis.localStorage = window.localStorage;
  localStorage.clear();
  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0 as never;
  }) as typeof requestAnimationFrame;
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  globalThis.localStorage = originalLocalStorage;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

function renderLauncher(props: {
  onRequestFeature?: (() => void) | null;
  newsUrl?: string | null;
  onClick?: () => void;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    render(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText={{ project: null, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={24}
        buttonIconStroke={2}
        theme="light"
        lightButtonColor="#02658D"
        lightTextColor="#ffffff"
        lightButtonHoverColor="#024F6F"
        lightTextHoverColor="#ffffff"
        darkButtonColor="#02658D"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#024F6F"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect
        tooltipEnabled
        tooltipText={{ project: null, global: null, builtin: null }}
        onClick={props.onClick ?? (() => undefined)}
        onRequestFeature={props.onRequestFeature}
        newsUrl={props.newsUrl}
      />,
      container
    );
  });
  const button = container.querySelector('button') as HTMLButtonElement;
  const wrapper = button.parentElement as HTMLDivElement;
  return { container, button, wrapper };
}

function enter(wrapper: Element, pointerType: string) {
  const event = new window.MouseEvent('pointerenter', { bubbles: false });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    wrapper.dispatchEvent(event);
  });
}

async function waitForMenu() {
  await act(async () => {
    await Bun.sleep(MENU_OPEN_DELAY + 100);
  });
}

const menuItems = (container: Element) =>
  Array.from(container.querySelectorAll('[role="menuitem"]')) as HTMLElement[];

describe('launcher long-hover menu', () => {
  it('fills {tld} from the host page', () => {
    expect(resolveNewsUrl('https://status.example.{tld}', 'jellyfin.example.dev')).toBe(
      'https://status.example.dev'
    );
    expect(resolveNewsUrl('https://news.example.com', 'a.example.dev')).toBe(
      'https://news.example.com'
    );
  });

  it('opens after a long mouse hover with feature and news entries', async () => {
    let features = 0;
    const { container, wrapper } = renderLauncher({
      onRequestFeature: () => features++,
      newsUrl: 'https://status.example.{tld}',
    });
    enter(wrapper, 'mouse');
    expect(menuItems(container)).toHaveLength(0);
    await waitForMenu();

    const items = menuItems(container);
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Request a feature');
    expect(items[1].getAttribute('href')).toBe('https://status.example.com');
    expect(items[1].getAttribute('target')).toBe('_blank');

    act(() => {
      items[0].click();
    });
    expect(features).toBe(1);
    expect(menuItems(container)).toHaveLength(0);
  });

  it('never opens from touch or pen', async () => {
    const { container, wrapper } = renderLauncher({
      onRequestFeature: () => undefined,
      newsUrl: 'https://status.example.com',
    });
    enter(wrapper, 'touch');
    await waitForMenu();
    expect(menuItems(container)).toHaveLength(0);
  });

  it('has no menu when neither entry is available', async () => {
    const { container, wrapper, button } = renderLauncher({});
    enter(wrapper, 'mouse');
    await waitForMenu();
    expect(menuItems(container)).toHaveLength(0);
    expect(button.getAttribute('aria-haspopup')).toBeNull();
  });

  it('shows only the entries that are configured', async () => {
    const { container, wrapper } = renderLauncher({ newsUrl: 'https://status.example.com' });
    enter(wrapper, 'mouse');
    await waitForMenu();
    expect(menuItems(container).map((item) => item.textContent)).toEqual(["What's new"]);
  });

  it('opens from the keyboard and closes with Escape', () => {
    const { container, button } = renderLauncher({
      onRequestFeature: () => undefined,
      newsUrl: 'https://status.example.com',
    });
    button.focus();
    act(() => {
      button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    const items = menuItems(container);
    expect(items).toHaveLength(2);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.ownerDocument.activeElement).toBe(items[0]);

    act(() => {
      items[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(menuItems(container)).toHaveLength(0);
    expect(container.ownerDocument.activeElement).toBe(button);
  });
});
