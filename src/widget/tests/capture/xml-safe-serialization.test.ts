import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { toSvg } from 'html-to-image';
import { installDom } from '../helpers/dom';
import { isXmlSafeAttribute, withXmlSafeSerialization } from '../../capture/xml-safe-serialization';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const FRAMEWORK_MARKUP =
  '<main wire:id="abc" wire:snapshot="{}" x-data="{ open: false }" class="card" style="color: red">' +
  '<a href="/" wire:navigate>Home</a>' +
  '<button x-on:click="open = true" @click="open = true" :class="{ active: open }">Open</button>' +
  '<input wire:model.live="name" value="Ada">' +
  '</main>';

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

function hasParserError(markup: string): boolean {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return parsed.getElementsByTagName('parsererror').length > 0;
}

function decodeSvgDataUrl(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/** Mirrors the detached wrapper html-to-image builds before serializing. */
function buildCaptureSvg(content: Element): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
  const foreignObject = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  svg.appendChild(foreignObject);
  foreignObject.appendChild(content);
  return svg;
}

/** Mirrors html-to-image, which applies its `style` option to the root clone before wrapping it. */
function buildOwnedCaptureSvg(
  clone: HTMLElement,
  captureStyle: Partial<CSSStyleDeclaration>
): SVGSVGElement {
  Object.assign(clone.style, captureStyle);
  return buildCaptureSvg(clone);
}

function attributeOf(markup: string): Attr {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild!.attributes[0];
}

describe('isXmlSafeAttribute', () => {
  it.each([
    '<a wire:navigate>',
    '<a x-on:click="x">',
    '<a @click="x">',
    '<a :class="x">',
    '<a x-bind:class="x">',
    '<a foo:bar:baz="x">',
    '<a v-on:click="x">',
  ])('rejects %s', (markup) => {
    expect(isXmlSafeAttribute(attributeOf(markup))).toBe(false);
  });

  it.each([
    '<a class="x">',
    '<a data-id="x">',
    '<a aria-label="x">',
    '<a x-data="x">',
    '<a data-ü="x">',
    '<a xml:lang="en">',
    '<a xmlns:og="http://ogp.me/ns#">',
    '<a xmlns="http://www.w3.org/1999/xhtml">',
  ])('keeps %s', (markup) => {
    expect(isXmlSafeAttribute(attributeOf(markup))).toBe(true);
  });

  it('keeps namespaced attributes such as xlink:href on inline SVG', () => {
    const host = document.createElement('div');
    host.innerHTML = '<svg><use xlink:href="#icon"></use></svg>';
    const attribute = host.querySelector('use')!.attributes[0];
    expect(attribute.namespaceURI).toBe('http://www.w3.org/1999/xlink');
    expect(isXmlSafeAttribute(attribute)).toBe(true);
  });
});

describe('withXmlSafeSerialization', () => {
  it('produces well-formed XML for its own capture SVG with framework attributes', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const unsafeClone = main.cloneNode(true) as Element;

    expect(
      hasParserError(new XMLSerializer().serializeToString(buildCaptureSvg(unsafeClone)))
    ).toBe(true);

    const markup = await withXmlSafeSerialization(main, async (captureStyle) =>
      new XMLSerializer().serializeToString(
        buildOwnedCaptureSvg(main.cloneNode(true) as HTMLElement, captureStyle)
      )
    );

    expect(hasParserError(markup)).toBe(false);
    expect(markup).not.toContain('wire:');
    expect(markup).not.toContain('@click');
    expect(markup).not.toContain(':class');
    expect(markup).not.toContain('bugpin-capture');
    expect(markup).toContain('x-data=');
    expect(markup).toContain('class="card"');
    expect(markup).toContain('color: red');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('value="Ada"');
  });

  it('puts back the live animation-name it uses as the capture marker', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    main.style.animationName = 'fade-in';
    const clone = main.cloneNode(true) as HTMLElement;

    await withXmlSafeSerialization(main, async (captureStyle) => {
      const svg = buildOwnedCaptureSvg(clone, captureStyle);
      expect(clone.style.animationName).toStartWith('bugpin-capture-');
      new XMLSerializer().serializeToString(svg);
    });

    expect(clone.style.animationName).toBe('fade-in');
  });

  it('never modifies the live page', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const before = document.body.innerHTML;

    const liveMarkup = await withXmlSafeSerialization(main, async (captureStyle) => {
      const serializer = new XMLSerializer();
      serializer.serializeToString(
        buildOwnedCaptureSvg(main.cloneNode(true) as HTMLElement, captureStyle)
      );
      return serializer.serializeToString(main);
    });

    expect(document.body.innerHTML).toBe(before);
    expect(liveMarkup).toContain('wire:navigate');
  });

  it('leaves SVGs it does not own untouched, including capture-shaped ones', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const hostExport = buildCaptureSvg(main.cloneNode(true) as Element);
    const detached = document.createElement('div');
    detached.innerHTML = FRAMEWORK_MARKUP;

    const [exportMarkup, divMarkup] = await withXmlSafeSerialization(main, async () => {
      const serializer = new XMLSerializer();
      return [serializer.serializeToString(hostExport), serializer.serializeToString(detached)];
    });

    expect(exportMarkup).toContain('wire:navigate');
    expect(hostExport.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
    expect(divMarkup).toContain('wire:navigate');
    expect(detached.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
  });

  it('leaves another export of the same element untouched, whichever starts first', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };
    const capture = () =>
      withXmlSafeSerialization(target, (style) => toSvg(target, { ...options, style }));

    const [captureFirst, exportSecond] = await Promise.all([capture(), toSvg(target, options)]);
    const [exportFirst, captureSecond] = await Promise.all([toSvg(target, options), capture()]);

    for (const own of [captureFirst, captureSecond].map(decodeSvgDataUrl)) {
      expect(hasParserError(own)).toBe(false);
      expect(own).not.toContain('bugpin-capture');
    }
    for (const other of [exportFirst, exportSecond].map(decodeSvgDataUrl)) {
      expect(other).toContain('wire:navigate');
    }
  });

  it('leaves a concurrent export of a different element untouched', async () => {
    document.body.innerHTML =
      FRAMEWORK_MARKUP + '<section><a href="/" wire:navigate>Other</a></section>';
    const target = document.querySelector('main') as HTMLElement;
    const other = document.querySelector('section') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };

    const [own, unrelated] = await Promise.all([
      withXmlSafeSerialization(target, (style) => toSvg(target, { ...options, style })),
      toSvg(other, options),
    ]);

    expect(hasParserError(decodeSvgDataUrl(own))).toBe(false);
    expect(decodeSvgDataUrl(unrelated)).toContain('wire:navigate');
  });

  it('cleans every clone when captures of the same element overlap', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };
    const capture = () =>
      withXmlSafeSerialization(target, (style) => toSvg(target, { ...options, style }));

    const results = await Promise.all([capture(), capture()]);

    for (const result of results.map(decodeSvgDataUrl)) {
      expect(hasParserError(result)).toBe(false);
      expect(result).not.toContain('bugpin-capture');
    }
  });

  it('restores the original serializer after success and failure', async () => {
    const root = document.body;
    const original = XMLSerializer.prototype.serializeToString;

    await withXmlSafeSerialization(root, async () => {
      expect(XMLSerializer.prototype.serializeToString).not.toBe(original);
    });
    expect(XMLSerializer.prototype.serializeToString).toBe(original);

    await expect(
      withXmlSafeSerialization(root, async () => {
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');
    expect(XMLSerializer.prototype.serializeToString).toBe(original);
  });

  it('keeps the patch until the last overlapping capture settles', async () => {
    const root = document.body;
    const original = XMLSerializer.prototype.serializeToString;
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withXmlSafeSerialization(root, () => firstDone);
    await withXmlSafeSerialization(root, async () => {});
    expect(XMLSerializer.prototype.serializeToString).not.toBe(original);

    releaseFirst();
    await first;
    expect(XMLSerializer.prototype.serializeToString).toBe(original);
  });

  it('does not overwrite a serializer the host page installed during capture', async () => {
    const original = XMLSerializer.prototype.serializeToString;
    const hostSerialize = function (this: XMLSerializer, node: Node) {
      return original.call(this, node);
    };

    await withXmlSafeSerialization(document.body, async () => {
      XMLSerializer.prototype.serializeToString = hostSerialize;
    });

    expect(XMLSerializer.prototype.serializeToString).toBe(hostSerialize);
    XMLSerializer.prototype.serializeToString = original;
  });

  it('runs the capture without a marker when XMLSerializer is unavailable', async () => {
    const root = document.body;
    delete globals.XMLSerializer;
    await expect(withXmlSafeSerialization(root, async (style) => style)).resolves.toEqual({});
  });

  it('runs the capture unpatched and unmarked when the host page froze the serializer', async () => {
    const prototype = XMLSerializer.prototype;
    const original = prototype.serializeToString;
    Object.defineProperty(prototype, 'serializeToString', {
      value: original,
      writable: false,
      configurable: true,
    });

    try {
      const style = await withXmlSafeSerialization(document.body, async (captureStyle) => {
        expect(prototype.serializeToString).toBe(original);
        return captureStyle;
      });
      expect(style).toEqual({});
      expect(prototype.serializeToString).toBe(original);
    } finally {
      Object.defineProperty(prototype, 'serializeToString', {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });

  it('leaves invalid host calls to the native serializer during capture', async () => {
    const serializeNull = (): string => {
      try {
        new XMLSerializer().serializeToString(null as unknown as Node);
        return 'no error';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    const nativeMessage = serializeNull();
    const wrappedMessage = await withXmlSafeSerialization(document.body, async () =>
      serializeNull()
    );

    expect(nativeMessage).not.toBe('no error');
    expect(wrappedMessage).toBe(nativeMessage);
  });

  // Fails if html-to-image stops applying its style option to the root clone or stops
  // serializing through XMLSerializer, the two behaviors this fix relies on.
  it('makes html-to-image output decodable on framework markup', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };

    const unsafe = decodeSvgDataUrl(await toSvg(target, options));
    const safe = decodeSvgDataUrl(
      await withXmlSafeSerialization(target, (style) => toSvg(target, { ...options, style }))
    );

    expect(hasParserError(unsafe)).toBe(true);
    expect(hasParserError(safe)).toBe(false);
    expect(safe).not.toContain('bugpin-capture');
    expect(target.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
  });
});
