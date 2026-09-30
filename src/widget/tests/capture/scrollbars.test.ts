import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';
import {
  applyScrollbarSnapshot,
  snapshotScrollContainers,
  withLiveScrollbars,
  type ScrollContainerSnapshot,
} from '../../capture/scrollbars';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

interface Layout {
  offsetWidth: number;
  clientWidth: number;
  offsetHeight: number;
  clientHeight: number;
  scrollWidth?: number;
  scrollHeight?: number;
}

const globals = globalThis as Record<string, unknown>;
const savedXMLSerializer = { present: 'XMLSerializer' in globals, value: globals.XMLSerializer };
let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installDom();
  globals.XMLSerializer = (window as unknown as Record<string, unknown>).XMLSerializer;
});

afterEach(() => {
  restoreDom();
  if (savedXMLSerializer.present) {
    globals.XMLSerializer = savedXMLSerializer.value;
  } else {
    delete globals.XMLSerializer;
  }
});

function setLayout(element: Element, layout: Layout): void {
  const values = {
    scrollWidth: layout.clientWidth,
    scrollHeight: layout.clientHeight,
    ...layout,
  };
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(element, name, { value, configurable: true });
  }
}

function element(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild as HTMLElement;
}

function snapshot(overrides: Partial<ScrollContainerSnapshot>): ScrollContainerSnapshot {
  return {
    localName: 'div',
    classNames: [],
    overflowX: 'auto',
    overflowY: 'auto',
    showX: false,
    showY: false,
    width: null,
    height: null,
    appliesToViewport: false,
    ...overrides,
  };
}

function captureSvg(cloneRoot: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
  const foreignObject = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  svg.appendChild(foreignObject);
  foreignObject.appendChild(cloneRoot);
  return svg;
}

describe('snapshotScrollContainers', () => {
  it('reports a classic vertical scrollbar and the box size that includes it', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, {
      offsetWidth: 215,
      clientWidth: 200,
      offsetHeight: 100,
      clientHeight: 100,
      scrollHeight: 400,
    });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result).toMatchObject({ showY: true, showX: false, width: 215, height: null });
  });

  it('uses the content box size for content-box elements', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; padding: 0 10px; border: 1px solid"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, {
      offsetWidth: 237,
      clientWidth: 220,
      offsetHeight: 100,
      clientHeight: 98,
      scrollHeight: 400,
    });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result.width).toBe(237 - 2 - 20);
  });

  it('treats overlay scrollbars and CSS-hidden scrollbars as not visible', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-x: auto; overflow-y: auto; border: 0"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, {
      offsetWidth: 200,
      clientWidth: 200,
      offsetHeight: 100,
      clientHeight: 100,
      scrollWidth: 900,
      scrollHeight: 400,
    });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result).toMatchObject({ showX: false, showY: false, width: null, height: null });
  });

  it('keeps a reserved gutter without overflow hidden but sized', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, { offsetWidth: 215, clientWidth: 200, offsetHeight: 100, clientHeight: 100 });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result).toMatchObject({ showY: false, width: 215 });
  });

  it('reports overflow scroll scrollbars even when the content fits', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-x: scroll; overflow-y: scroll; border: 0"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, { offsetWidth: 215, clientWidth: 200, offsetHeight: 115, clientHeight: 100 });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result).toMatchObject({ showX: true, showY: true });
  });

  it('ignores rounding differences smaller than a scrollbar', () => {
    document.body.innerHTML =
      '<div id="root"><div id="list" style="overflow-y: auto; box-sizing: border-box; border: 0"></div></div>';
    const list = document.getElementById('list')!;
    setLayout(list, {
      offsetWidth: 201,
      clientWidth: 200,
      offsetHeight: 100,
      clientHeight: 100,
      scrollHeight: 400,
    });

    const [result] = snapshotScrollContainers(document.getElementById('root')!, () => true);

    expect(result).toMatchObject({ showY: false, width: null });
  });

  it('lists scroll containers in document order and skips excluded subtrees', () => {
    document.body.innerHTML =
      '<div id="root" style="overflow-x: auto; overflow-y: auto">' +
      '<section class="a" style="overflow-x: auto"><p>text</p></section>' +
      '<div data-exclude><div class="skipped" style="overflow-x: auto; overflow-y: auto"></div></div>' +
      '<div class="b" style="overflow-y: scroll"></div>' +
      '</div>';

    const results = snapshotScrollContainers(
      document.getElementById('root')!,
      (node) => !(node as Element).hasAttribute('data-exclude')
    );

    expect(results.map((result) => result.classNames.join(' ') || result.localName)).toEqual([
      'div',
      'a',
      'b',
    ]);
  });

  it('marks html, and body when html overflow is visible, as viewport overflow', () => {
    document.documentElement.style.overflowY = 'scroll';
    document.body.style.overflowY = 'auto';

    const withHtmlOverflow = snapshotScrollContainers(document.documentElement, () => true);
    expect(withHtmlOverflow.map((result) => [result.localName, result.appliesToViewport])).toEqual([
      ['html', true],
      ['body', false],
    ]);

    document.documentElement.style.overflowY = '';
    const withBodyOverflow = snapshotScrollContainers(document.documentElement, () => true);
    expect(withBodyOverflow.map((result) => [result.localName, result.appliesToViewport])).toEqual([
      ['body', true],
    ]);
  });
});

describe('applyScrollbarSnapshot', () => {
  function cloneTree() {
    const root = element(
      '<div class="root" style="overflow-x: auto; overflow-y: auto; width: 500px">' +
        '<div class="list" style="overflow-x: auto; overflow-y: auto; width: 200px; height: 100px"></div>' +
        '<div class="table" style="overflow-x: auto; overflow-y: auto; width: 300px"></div>' +
        '</div>'
    );
    const [list, table] = Array.from(root.children) as HTMLElement[];
    return { root, list, table };
  }

  const snapshots = [
    snapshot({ classNames: ['root'], showY: true, width: 999 }),
    snapshot({ classNames: ['list'], showY: true, width: 215 }),
    snapshot({ classNames: ['table'] }),
  ];

  it('shows scrollbars only where the live page shows them and restores their space', () => {
    const { root, list, table } = cloneTree();

    applyScrollbarSnapshot(captureSvg(root), snapshots);

    expect([list.style.overflowX, list.style.overflowY, list.style.width]).toEqual([
      'hidden',
      'scroll',
      '215px',
    ]);
    expect(list.style.height).toBe('100px');
    expect([table.style.overflowX, table.style.overflowY, table.style.width]).toEqual([
      'hidden',
      'hidden',
      '300px',
    ]);
  });

  it('hides the capture root scrollbars and keeps its size', () => {
    const { root } = cloneTree();

    applyScrollbarSnapshot(captureSvg(root), snapshots);

    expect([root.style.overflowX, root.style.overflowY, root.style.width]).toEqual([
      'hidden',
      'hidden',
      '500px',
    ]);
  });

  it('lets html and body overflow render as visible when it belongs to the viewport', () => {
    const html = document.createElement('html');
    html.style.overflowX = 'visible';
    html.style.overflowY = 'scroll';
    const body = document.createElement('body');
    body.style.overflowX = 'visible';
    body.style.overflowY = 'auto';
    html.appendChild(body);

    applyScrollbarSnapshot(captureSvg(html), [
      snapshot({
        localName: 'html',
        overflowX: 'visible',
        overflowY: 'scroll',
        appliesToViewport: true,
      }),
      snapshot({
        localName: 'body',
        overflowX: 'visible',
        overflowY: 'auto',
        appliesToViewport: true,
      }),
    ]);

    expect([html.style.overflowY, body.style.overflowY]).toEqual(['visible', 'visible']);
  });

  it('matches clones that carry extra generated class names', () => {
    const { root, list } = cloneTree();
    list.classList.add('generated-pseudo-class');

    applyScrollbarSnapshot(captureSvg(root), snapshots);

    expect(list.style.overflowY).toBe('scroll');
  });

  it('hides every scrollbar when the clone does not match the snapshot', () => {
    const { root, list, table } = cloneTree();

    applyScrollbarSnapshot(captureSvg(root), snapshots.slice(0, 2));

    for (const clone of [root, list, table]) {
      expect([clone.style.overflowX, clone.style.overflowY]).toEqual(['hidden', 'hidden']);
    }
    expect(list.style.width).toBe('200px');
  });

  it('hides every scrollbar when the live page could not be measured', () => {
    const { root, list } = cloneTree();

    applyScrollbarSnapshot(captureSvg(root), null);

    expect([list.style.overflowX, list.style.overflowY]).toEqual(['hidden', 'hidden']);
  });

  it('prepares each capture SVG only once', () => {
    const { root, list } = cloneTree();
    const svg = captureSvg(root);

    applyScrollbarSnapshot(svg, snapshots);
    applyScrollbarSnapshot(svg, null);

    expect(list.style.overflowY).toBe('scroll');
  });
});

describe('withLiveScrollbars', () => {
  it('applies the live snapshot to the capture SVG serialized during the run', async () => {
    document.body.innerHTML =
      '<div id="root"><div class="list" style="overflow-y: auto; box-sizing: border-box; border: 0"></div></div>';
    const liveRoot = document.getElementById('root')!;
    const liveList = liveRoot.firstElementChild!;
    setLayout(liveList, {
      offsetWidth: 215,
      clientWidth: 200,
      offsetHeight: 100,
      clientHeight: 100,
      scrollHeight: 400,
    });
    // Mirror html-to-image, which copies computed styles onto its clone.
    const clone = liveRoot.cloneNode(true) as HTMLElement;
    const cloneList = clone.firstElementChild as HTMLElement;
    cloneList.style.overflowX = window.getComputedStyle(liveList).overflowX;
    cloneList.style.width = '200px';

    const markup = await withLiveScrollbars(
      liveRoot,
      () => true,
      async () => new XMLSerializer().serializeToString(captureSvg(clone))
    );

    expect([cloneList.style.overflowY, cloneList.style.width]).toEqual(['scroll', '215px']);
    expect(markup).toContain('215px');
    expect(liveList.getAttribute('style')).toBe(
      'overflow-y: auto; box-sizing: border-box; border: 0'
    );
  });

  it('still captures, with scrollbars hidden, when measuring the live page fails', async () => {
    document.body.innerHTML =
      '<div id="root"><div style="overflow-x: auto; overflow-y: auto"></div></div>';
    const liveRoot = document.getElementById('root')!;
    const clone = liveRoot.cloneNode(true) as HTMLElement;
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args[0]);

    try {
      const markup = await withLiveScrollbars(
        liveRoot,
        () => {
          throw new Error('measure failed');
        },
        async () => new XMLSerializer().serializeToString(captureSvg(clone))
      );

      const cloneChild = clone.firstElementChild as HTMLElement;
      expect([cloneChild.style.overflowX, cloneChild.style.overflowY]).toEqual([
        'hidden',
        'hidden',
      ]);
      expect(markup.length).toBeGreaterThan(0);
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });
});
