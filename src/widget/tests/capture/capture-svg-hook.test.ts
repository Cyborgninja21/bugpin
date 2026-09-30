import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';
import { withCaptureSvgPreparer } from '../../capture/capture-svg-hook';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

function captureSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
  const foreignObject = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  foreignObject.appendChild(document.createElement('div'));
  svg.appendChild(foreignObject);
  return svg;
}

describe('withCaptureSvgPreparer', () => {
  it('runs every active preparer on the capture SVG in registration order', async () => {
    const calls: string[] = [];

    await withCaptureSvgPreparer(
      () => calls.push('outer'),
      () =>
        withCaptureSvgPreparer(
          () => calls.push('inner'),
          async () => new XMLSerializer().serializeToString(captureSvg())
        )
    );

    expect(calls).toEqual(['outer', 'inner']);
  });

  it('keeps serializing when a preparer throws', async () => {
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args[0]);
    let laterPreparerRan = false;

    try {
      const markup = await withCaptureSvgPreparer(
        () => {
          throw new Error('broken step');
        },
        () =>
          withCaptureSvgPreparer(
            () => {
              laterPreparerRan = true;
            },
            async () => new XMLSerializer().serializeToString(captureSvg())
          )
      );

      expect(markup).toContain('foreignObject');
      expect(laterPreparerRan).toBe(true);
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  it('does not prepare nodes outside a detached capture SVG', async () => {
    let prepared = 0;
    document.body.appendChild(captureSvg());

    await withCaptureSvgPreparer(
      () => {
        prepared += 1;
      },
      async () => {
        const serializer = new XMLSerializer();
        serializer.serializeToString(document.body.firstElementChild!);
        serializer.serializeToString(document.createElement('div'));
      }
    );

    expect(prepared).toBe(0);
  });
});
