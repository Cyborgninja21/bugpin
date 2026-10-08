import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { toSvg } from 'html-to-image';
import { installDom } from '../helpers/dom';
import { withCaptureClone } from '../../capture/capture-clone';
import { recordScrollbars } from '../../capture/scrollbars';

// DOM globals used by this test or by html-to-image that installDom does not provide.
const EXTRA_DOM_GLOBALS = [
  'XMLSerializer',
  'DOMParser',
  'Element',
  'HTMLCanvasElement',
  'HTMLIFrameElement',
  'HTMLImageElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLVideoElement',
  'SVGElement',
  'SVGImageElement',
] as const;

const globals = globalThis as Record<string, unknown>;
const savedGlobals = new Map(
  EXTRA_DOM_GLOBALS.map((name) => [name, { present: name in globals, value: globals[name] }])
);
let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installDom();
  const windowGlobals = window as unknown as Record<string, unknown>;
  for (const name of EXTRA_DOM_GLOBALS) {
    globals[name] = windowGlobals[name];
  }
  // jsdom does not implement SVGImageElement.
  globals.SVGImageElement ??= class SVGImageElement {};
});

afterEach(() => {
  restoreDom();
  for (const [name, saved] of savedGlobals) {
    if (saved.present) {
      globals[name] = saved.value;
    } else {
      delete globals[name];
    }
  }
});

interface Layout {
  offsetWidth: number;
  clientWidth: number;
  offsetHeight?: number;
  clientHeight?: number;
  scrollWidth?: number;
  scrollHeight?: number;
  clientLeft?: number;
}

/** jsdom has no layout, so tests describe the live scrollbar geometry directly. */
function setLayout(element: Element, layout: Layout): void {
  const values = {
    offsetHeight: 100,
    clientHeight: 100,
    scrollWidth: layout.clientWidth,
    scrollHeight: layout.clientHeight ?? 100,
    clientLeft: 0,
    ...layout,
  };
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(element, name, { value, configurable: true });
  }
}

/** Mirrors html-to-image: clone the root, copy computed overflow, box-sizing and sizes. */
function cloneLikeHtmlToImage(live: HTMLElement): HTMLElement {
  const clone = live.cloneNode(true) as HTMLElement;
  const liveElements = [live, ...Array.from(live.querySelectorAll<HTMLElement>('*'))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  liveElements.forEach((element, index) => {
    const computed = window.getComputedStyle(element);
    const target = cloneElements[index].style;
    target.overflowX = computed.overflowX;
    target.overflowY = computed.overflowY;
  });
  return clone;
}

function applyTo(root: HTMLElement, rootSizeLocked = false): HTMLElement {
  const recorder = recordScrollbars(root, rootSizeLocked);
  const include = recorder.observe();
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    include(element);
  }
  const clone = cloneLikeHtmlToImage(root);
  recorder.apply(clone);
  return clone;
}

function containerIn(clone: HTMLElement, id: string): HTMLElement {
  return clone.querySelector<HTMLElement>(`#${id}`)!;
}

describe('recordScrollbars', () => {
  it('keeps the filter result and records only included elements', () => {
    document.body.innerHTML =
      '<div id="root"><div id="kept" style="overflow-y: auto"></div><div id="skipped" style="overflow-y: auto"></div></div>';
    const recorder = recordScrollbars(document.getElementById('root')!, false);
    const include = recorder.observe((node) => node.id !== 'skipped');

    expect(include(document.getElementById('kept')!)).toBe(true);
    expect(include(document.getElementById('skipped')!)).toBe(false);
  });

  it('shows a visible classic scrollbar inside the live box size', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div></div>';
    setLayout(document.getElementById('list')!, {
      offsetWidth: 215,
      clientWidth: 200,
      scrollHeight: 400,
    });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect([list.style.overflowY, list.style.width, list.style.paddingRight]).toEqual([
      'scroll',
      '215px',
      '0px',
    ]);
  });

  it('turns a hidden scrollbar space into padding so the content keeps its width', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0 4px; scrollbar-gutter: stable"></div></div>';
    setLayout(document.getElementById('list')!, { offsetWidth: 215, clientWidth: 200 });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect([list.style.overflowY, list.style.width, list.style.paddingRight]).toEqual([
      'hidden',
      '215px',
      '19px',
    ]);
    expect(list.style.getPropertyValue('scrollbar-gutter')).toBe('auto');
  });

  it('keeps the content width of content-box containers', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: content-box; border: 1px solid; padding: 0 5px; scrollbar-gutter: stable"></div></div>';
    setLayout(document.getElementById('list')!, { offsetWidth: 227, clientWidth: 210 });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    // Live content width: 227 - 2 border - 10 padding - 15 scrollbar = 200.
    expect([list.style.width, list.style.paddingRight]).toEqual(['200px', '20px']);
  });

  it('adds the hidden space on the side where the live scrollbar is', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" dir="rtl" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0; scrollbar-gutter: stable"></div></div>';
    setLayout(document.getElementById('list')!, {
      offsetWidth: 215,
      clientWidth: 200,
      clientLeft: 15,
    });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect([list.style.paddingLeft, list.style.paddingRight]).toEqual(['15px', '0px']);
  });

  it('splits hidden space reserved on both edges', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0; scrollbar-gutter: stable both-edges"></div></div>';
    setLayout(document.getElementById('list')!, {
      offsetWidth: 230,
      clientWidth: 200,
      clientLeft: 15,
    });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect([list.style.paddingLeft, list.style.paddingRight]).toEqual(['15px', '15px']);
  });

  it('keeps the content height when hiding a horizontal scrollbar space', () => {
    document.body.innerHTML =
      '<div id="root"><div id="row" style="overflow-x: auto; overflow-y: hidden; box-sizing: border-box; border: 0; padding: 0"></div></div>';
    const row = document.getElementById('row')!;
    setLayout(row, { offsetWidth: 200, clientWidth: 200, offsetHeight: 100, clientHeight: 85 });
    Object.defineProperty(row, 'scrollWidth', { value: 200, configurable: true });

    const clone = containerIn(applyTo(document.getElementById('root')!), 'row');

    expect([clone.style.overflowX, clone.style.height, clone.style.paddingBottom]).toEqual([
      'hidden',
      '100px',
      '15px',
    ]);
  });

  it('only hides overlay and CSS-hidden scrollbars, which take no space', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div></div>';
    setLayout(document.getElementById('list')!, {
      offsetWidth: 200,
      clientWidth: 200,
      scrollHeight: 400,
    });

    const list = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect([list.style.overflowY, list.style.width, list.style.paddingRight]).toEqual([
      'hidden',
      '',
      '0px',
    ]);
  });

  it('drops the scrollbar space of a root captured at its own size', () => {
    document.body.innerHTML =
      '<div id="root" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div>';
    const root = document.getElementById('root')!;
    setLayout(root, { offsetWidth: 215, clientWidth: 200, scrollHeight: 400 });

    const clone = applyTo(root);

    expect([clone.style.overflowY, clone.style.width, clone.style.paddingRight]).toEqual([
      'hidden',
      '200px',
      '0px',
    ]);
  });

  it('only hides the scrollbars of a root captured with explicit dimensions', () => {
    document.body.innerHTML =
      '<div id="root" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div>';
    const root = document.getElementById('root')!;
    setLayout(root, { offsetWidth: 215, clientWidth: 200, scrollHeight: 400 });

    const clone = applyTo(root, true);

    expect([clone.style.overflowY, clone.style.width]).toEqual(['hidden', '']);
  });

  it('lets html and body overflow that belongs to the viewport render as visible', () => {
    document.documentElement.style.overflowY = 'scroll';
    const clone = applyTo(document.documentElement, true);
    expect(clone.style.overflowY).toBe('visible');

    document.documentElement.style.overflowY = '';
    document.body.style.overflowY = 'auto';
    const withBody = applyTo(document.documentElement, true);
    expect(withBody.querySelector('body')!.style.overflowY).toBe('visible');
  });

  it('stops at the first clone that does not match and leaves the rest unchanged', () => {
    document.body.innerHTML =
      '<div id="root"><div id="a" class="a" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div><div id="b" class="b" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div><div id="c" class="c" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div></div>';
    for (const id of ['a', 'b', 'c']) {
      setLayout(document.getElementById(id)!, {
        offsetWidth: 215,
        clientWidth: 200,
        scrollHeight: 400,
      });
    }
    const root = document.getElementById('root')!;
    const recorder = recordScrollbars(root, false);
    const include = recorder.observe();
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      include(element);
    }
    const clone = cloneLikeHtmlToImage(root);
    containerIn(clone, 'b').className = 'other';

    recorder.apply(clone);

    expect(containerIn(clone, 'a').style.overflowY).toBe('scroll');
    expect(containerIn(clone, 'b').style.overflowY).toBe('auto');
    expect(containerIn(clone, 'c').style.overflowY).toBe('auto');
  });

  it('matches clones that carry extra generated class names', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" class="card" style="overflow-y: auto; box-sizing: border-box; border: 0; padding: 0"></div></div>';
    setLayout(document.getElementById('list')!, {
      offsetWidth: 215,
      clientWidth: 200,
      scrollHeight: 400,
    });
    const root = document.getElementById('root')!;
    const recorder = recordScrollbars(root, false);
    recorder.observe()(document.getElementById('list')!);
    const clone = cloneLikeHtmlToImage(root);
    containerIn(clone, 'list').classList.add('u1abc2');

    recorder.apply(clone);

    expect(containerIn(clone, 'list').style.overflowY).toBe('scroll');
  });

  it('leaves the clone unchanged when measuring the live page fails', () => {
    document.body.innerHTML = '<div id="root"><div id="list" style="overflow-y: auto"></div></div>';
    const list = document.getElementById('list')!;
    Object.defineProperty(list, 'offsetWidth', {
      get() {
        throw new Error('layout unavailable');
      },
      configurable: true,
    });

    const clone = containerIn(applyTo(document.getElementById('root')!), 'list');

    expect(clone.style.overflowY).toBe('auto');
  });

  it('pairs clones in html-to-image order across shadow DOM and slotted content', async () => {
    // jsdom only reports declared properties, so overflow-x is declared for html-to-image to copy it.
    document.body.innerHTML =
      '<div id="root">' +
      '<x-host></x-host>' +
      '<x-slotter><div id="slotted" style="overflow-x: hidden; overflow-y: auto; box-sizing: border-box; border: 0; padding: 0">slotted</div></x-slotter>' +
      '<div id="after" style="overflow-x: hidden; overflow-y: auto; box-sizing: border-box; border: 0; padding: 0">after</div>' +
      '</div>';
    const host = document.querySelector('x-host')!;
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<div id="in-shadow" style="overflow-x: hidden; overflow-y: auto; box-sizing: border-box; border: 0; padding: 0; scrollbar-gutter: stable">shadow</div>';
    document.querySelector('x-slotter')!.attachShadow({ mode: 'open' }).innerHTML =
      '<section><slot></slot></section>';
    // In the shadow root the scrollbar space is reserved but hidden; elsewhere it is shown.
    setLayout(host.shadowRoot!.getElementById('in-shadow')!, {
      offsetWidth: 215,
      clientWidth: 200,
    });
    for (const id of ['slotted', 'after']) {
      setLayout(document.getElementById(id)!, {
        offsetWidth: 215,
        clientWidth: 200,
        scrollHeight: 400,
      });
    }
    const root = document.getElementById('root')!;
    const recorder = recordScrollbars(root, false);
    let prepared: HTMLElement | null = null;

    await withCaptureClone(
      root,
      (_svg, cloneRoot) => {
        recorder.apply(cloneRoot);
        prepared = cloneRoot as HTMLElement;
      },
      (style) =>
        toSvg(root, { skipFonts: true, width: 300, height: 300, style, filter: recorder.observe() })
    );

    const clone = prepared as unknown as HTMLElement;
    expect(clone.querySelector<HTMLElement>('#in-shadow')!.style.paddingRight).toBe('15px');
    expect(clone.querySelector<HTMLElement>('#in-shadow')!.style.overflowY).toBe('hidden');
    expect(clone.querySelector<HTMLElement>('#slotted')!.style.overflowY).toBe('scroll');
    expect(clone.querySelector<HTMLElement>('#after')!.style.overflowY).toBe('scroll');
    expect(document.getElementById('after')!.getAttribute('style')).toBe(
      'overflow-x: hidden; overflow-y: auto; box-sizing: border-box; border: 0; padding: 0'
    );
  });
});
