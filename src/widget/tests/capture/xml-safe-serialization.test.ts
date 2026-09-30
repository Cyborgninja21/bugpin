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
  it('produces well-formed XML for a detached capture SVG with framework attributes', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const clone = document.querySelector('main')!.cloneNode(true) as Element;

    expect(hasParserError(new XMLSerializer().serializeToString(buildCaptureSvg(clone)))).toBe(
      true
    );

    const svg = buildCaptureSvg(clone.cloneNode(true) as Element);
    const markup = await withXmlSafeSerialization(async () =>
      new XMLSerializer().serializeToString(svg)
    );

    expect(hasParserError(markup)).toBe(false);
    expect(markup).not.toContain('wire:');
    expect(markup).not.toContain('@click');
    expect(markup).not.toContain(':class');
    expect(markup).toContain('x-data=');
    expect(markup).toContain('class="card"');
    expect(markup).toContain('style="color: red"');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('value="Ada"');
  });

  it('never modifies the live page', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const before = document.body.innerHTML;

    const liveMarkup = await withXmlSafeSerialization(async () => {
      const serializer = new XMLSerializer();
      serializer.serializeToString(
        buildCaptureSvg(document.querySelector('main')!.cloneNode(true) as Element)
      );
      return serializer.serializeToString(document.querySelector('main')!);
    });

    expect(document.body.innerHTML).toBe(before);
    expect(liveMarkup).toContain('wire:navigate');
  });

  it('passes through detached nodes that are not a capture SVG', async () => {
    const detached = document.createElement('div');
    detached.innerHTML = FRAMEWORK_MARKUP;

    const plainSvg = document.createElementNS(SVG_NAMESPACE, 'svg');
    plainSvg.appendChild(document.createElementNS(SVG_NAMESPACE, 'g'));
    plainSvg.firstElementChild!.setAttribute('data-x', '1');

    const [divMarkup, svgMarkup] = await withXmlSafeSerialization(async () => {
      const serializer = new XMLSerializer();
      return [serializer.serializeToString(detached), serializer.serializeToString(plainSvg)];
    });

    expect(divMarkup).toContain('wire:navigate');
    expect(detached.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
    expect(svgMarkup).toContain('data-x="1"');
  });

  it('restores the original serializer after success and failure', async () => {
    const original = XMLSerializer.prototype.serializeToString;

    await withXmlSafeSerialization(async () => {
      expect(XMLSerializer.prototype.serializeToString).not.toBe(original);
    });
    expect(XMLSerializer.prototype.serializeToString).toBe(original);

    await expect(
      withXmlSafeSerialization(async () => {
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');
    expect(XMLSerializer.prototype.serializeToString).toBe(original);
  });

  it('keeps the patch until the last overlapping capture settles', async () => {
    const original = XMLSerializer.prototype.serializeToString;
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withXmlSafeSerialization(() => firstDone);
    await withXmlSafeSerialization(async () => {});
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

    await withXmlSafeSerialization(async () => {
      XMLSerializer.prototype.serializeToString = hostSerialize;
    });

    expect(XMLSerializer.prototype.serializeToString).toBe(hostSerialize);
    XMLSerializer.prototype.serializeToString = original;
  });

  it('runs the capture unchanged when XMLSerializer is unavailable', async () => {
    delete globals.XMLSerializer;
    await expect(withXmlSafeSerialization(async () => 'ok')).resolves.toBe('ok');
  });

  it('runs the capture unpatched when the host page froze the serializer', async () => {
    const prototype = XMLSerializer.prototype;
    const original = prototype.serializeToString;
    Object.defineProperty(prototype, 'serializeToString', {
      value: original,
      writable: false,
      configurable: true,
    });

    try {
      await expect(
        withXmlSafeSerialization(async () => {
          expect(prototype.serializeToString).toBe(original);
          return 'ok';
        })
      ).resolves.toBe('ok');
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
    const wrappedMessage = await withXmlSafeSerialization(async () => serializeNull());

    expect(nativeMessage).not.toBe('no error');
    expect(wrappedMessage).toBe(nativeMessage);
  });

  it('makes html-to-image output decodable on framework markup', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };

    const unsafe = decodeSvgDataUrl(await toSvg(target, options));
    const safe = decodeSvgDataUrl(await withXmlSafeSerialization(() => toSvg(target, options)));

    expect(hasParserError(unsafe)).toBe(true);
    expect(hasParserError(safe)).toBe(false);
    expect(target.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
  });
});
