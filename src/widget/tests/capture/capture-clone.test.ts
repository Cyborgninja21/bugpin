import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { toSvg } from 'html-to-image';
import { installDom } from '../helpers/dom';
import { withCaptureClone } from '../../capture/capture-clone';

// DOM globals used by this test or by html-to-image that installDom does not provide.
const EXTRA_DOM_GLOBALS = [
  'XMLSerializer',
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

describe('withCaptureClone', () => {
  it('runs the preparer of each overlapping capture on that capture clone only', async () => {
    document.body.innerHTML = '<main id="first">First</main><main id="second">Second</main>';
    const options = { skipFonts: true, width: 100, height: 50 };
    const prepared: Array<[string, string]> = [];
    const capture = (id: string) => {
      const root = document.getElementById(id)!;
      return withCaptureClone(
        root,
        (_svg, cloneRoot) => prepared.push([id, cloneRoot.id]),
        (style) => toSvg(root, { ...options, style })
      );
    };

    await Promise.all([capture('first'), capture('second'), toSvg(document.body, options)]);

    expect(prepared.sort()).toEqual([
      ['first', 'first'],
      ['second', 'second'],
    ]);
  });

  it('hands the preparer the clone root with its original animation-name restored', async () => {
    document.body.innerHTML = '<main id="root" style="animation-name: fade">Content</main>';
    const root = document.getElementById('root')!;
    let animationName = '';

    await withCaptureClone(
      root,
      (_svg, cloneRoot) => {
        animationName = cloneRoot.style.animationName;
      },
      (style) => toSvg(root, { skipFonts: true, width: 100, height: 50, style })
    );

    expect(animationName).toBe('fade');
  });
});
