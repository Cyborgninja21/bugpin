import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import {
  launcherPositionStyle,
  loadLauncherPosition,
  saveLauncherPosition,
  snapLauncherPosition,
} from '../../storage/launcher-position';
import { installDom } from '../helpers/dom';

let restoreDom: (() => void) | null = null;
const originalLocalStorage = globalThis.localStorage;

// Launcher is 60x60 and sits at the bottom-right corner of a 1000x800 viewport
const LAUNCHER_RECT = {
  width: 60,
  height: 60,
  left: 920,
  top: 720,
  right: 980,
  bottom: 780,
} as DOMRect;

beforeEach(() => {
  restoreDom = installDom();
  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  globalThis.HTMLElement.prototype.getBoundingClientRect = () => LAUNCHER_RECT;
  globalThis.localStorage = window.localStorage;
  localStorage.clear();
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  globalThis.localStorage = originalLocalStorage;
});

function renderLauncher(onClick: () => void) {
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
        onClick={onClick}
      />,
      container
    );
  });
  const button = container.querySelector('button') as HTMLButtonElement;
  const wrapper = button.parentElement as HTMLDivElement;
  return { container, button, wrapper };
}

function pointer(target: Element, type: string, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(
      new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
    );
  });
}

function click(target: Element) {
  act(() => {
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
  });
}

function key(target: Element, keyName: string, altKey = true) {
  act(() => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, altKey, bubbles: true }));
  });
}

describe('launcher position storage', () => {
  it('snaps to the nearest edge and keeps the height', () => {
    expect(snapLauncherPosition(100, 20, 60, 60, 1000, 800)).toEqual({ side: 'left', y: 0 });
    expect(snapLauncherPosition(900, 720, 60, 60, 1000, 800)).toEqual({ side: 'right', y: 1 });
    const middle = snapLauncherPosition(600, 370, 60, 60, 1000, 800);
    expect(middle.side).toBe('right');
    expect(middle.y).toBeCloseTo(0.5, 5);
  });

  it('clamps drops beyond the viewport', () => {
    expect(snapLauncherPosition(-50, -50, 60, 60, 1000, 800).y).toBe(0);
    expect(snapLauncherPosition(2000, 5000, 60, 60, 1000, 800).y).toBe(1);
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem('bugpin:launcher-position', '{"side":"middle","y":0.3}');
    expect(loadLauncherPosition()).toBeNull();
    localStorage.setItem('bugpin:launcher-position', 'not json');
    expect(loadLauncherPosition()).toBeNull();
  });

  it('keeps the launcher inside the viewport at any size', () => {
    const style = launcherPositionStyle({ side: 'left', y: 1 });
    expect(style.left).toBe('20px');
    expect(style.top).toBe('calc(20px + (100% - 40px) * 1)');
    expect(style.transform).toBe('translateY(-100%)');
  });
});

describe('draggable launcher', () => {
  it('opens the dialog on a plain click', () => {
    let clicks = 0;
    const { button } = renderLauncher(() => clicks++);
    pointer(button, 'pointerdown', 950, 750);
    pointer(button, 'pointermove', 952, 751);
    pointer(button, 'pointerup', 952, 751);
    click(button);
    expect(clicks).toBe(1);
    expect(loadLauncherPosition()).toBeNull();
  });

  it('moves, snaps and remembers the launcher after a drag without opening the dialog', () => {
    let clicks = 0;
    const { button, wrapper } = renderLauncher(() => clicks++);
    pointer(button, 'pointerdown', 950, 750);
    pointer(button, 'pointermove', 400, 400);
    expect(wrapper.style.left).toBe('370px');
    expect(wrapper.style.top).toBe('370px');

    pointer(button, 'pointerup', 150, 400);
    click(button);
    expect(clicks).toBe(0);

    const saved = loadLauncherPosition();
    expect(saved?.side).toBe('left');
    expect(saved?.y).toBeCloseTo(0.5, 5);
    expect(wrapper.style.left).toBe('20px');
    expect(wrapper.className).not.toContain('bottom-5');

    click(button);
    expect(clicks).toBe(1);
  });

  it('restores the remembered position on the next page', () => {
    saveLauncherPosition({ side: 'left', y: 0.25 });
    const { wrapper } = renderLauncher(() => undefined);
    expect(wrapper.style.left).toBe('20px');
    expect(wrapper.style.transform).toBe('translateY(-25%)');
  });

  it('moves with Alt+Arrow keys and resets with Alt+Home', () => {
    const { button, wrapper } = renderLauncher(() => undefined);
    key(button, 'ArrowLeft');
    expect(loadLauncherPosition()).toEqual({ side: 'left', y: 1 });
    key(button, 'ArrowUp');
    expect(loadLauncherPosition()?.y).toBeCloseTo(0.95, 5);
    key(button, 'ArrowUp', false);
    expect(loadLauncherPosition()?.y).toBeCloseTo(0.95, 5);

    key(button, 'Home');
    expect(loadLauncherPosition()).toBeNull();
    expect(wrapper.className).toContain('bottom-5');
  });
});
