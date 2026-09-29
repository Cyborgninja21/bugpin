import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { nodeToDataURL as serializeEsm } from 'html-to-image/es/util';
import { nodeToDataURL as serializeCjs } from 'html-to-image/lib/util';

const originalDocument = globalThis.document;
const originalSerializer = globalThis.XMLSerializer;
let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.document = dom.window.document;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
});

afterEach(() => {
  dom.window.close();
  globalThis.document = originalDocument;
  globalThis.XMLSerializer = originalSerializer;
});

for (const [name, serialize] of [
  ['ESM', serializeEsm],
  ['CommonJS', serializeCjs],
] as const) {
  describe(`${name} screenshot serialization`, () => {
    it('serializes Livewire attributes safely without changing the source page or styles', async () => {
      document.body.innerHTML =
        '<main wire:id="component" class="card" style="color: red"><a href="/" wire:navigate>Home</a><input wire:model.live="name" value="Ada"></main>';
      const source = document.querySelector('main')!;
      const before = source.outerHTML;
      const clone = source.cloneNode(true) as HTMLElement;
      const invalid = new XMLSerializer().serializeToString(clone);
      expect(
        new dom.window.DOMParser()
          .parseFromString(invalid, 'image/svg+xml')
          .querySelector('parsererror')
      ).not.toBeNull();

      const dataUrl = await serialize(clone, 800, 600);
      const parsed = new dom.window.DOMParser().parseFromString(
        decodeURIComponent(dataUrl.split(',')[1]),
        'image/svg+xml'
      );
      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(parsed.querySelector('main')?.hasAttribute('wire:id')).toBe(false);
      expect(parsed.querySelector('a')?.hasAttribute('wire:navigate')).toBe(false);
      expect(parsed.querySelector('input')?.hasAttribute('wire:model.live')).toBe(false);
      expect(parsed.querySelector('main')?.getAttribute('class')).toBe('card');
      expect(parsed.querySelector('main')?.getAttribute('style')).toBe('color: red');
      expect(parsed.querySelector('a')?.getAttribute('href')).toBe('/');
      expect(parsed.querySelector('input')?.getAttribute('value')).toBe('Ada');
      expect(source.outerHTML).toBe(before);
    });

    it('preserves ordinary markup and namespaced SVG attributes', async () => {
      document.body.innerHTML =
        '<main data-name="test"><svg xmlns="http://www.w3.org/2000/svg"><use href="#icon" xlink:href="#icon"/><text xml:lang="en">Icon</text></svg></main>';
      const source = document.querySelector('main')!;
      source.setAttributeNS('urn:example', 'wire:custom', 'preserve');
      const before = source.outerHTML;
      const dataUrl = await serialize(source.cloneNode(true) as HTMLElement, 800, 600);
      const parsed = new dom.window.DOMParser().parseFromString(
        decodeURIComponent(dataUrl.split(',')[1]),
        'image/svg+xml'
      );
      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(
        parsed.querySelector('use')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      ).toBe('#icon');
      expect(
        parsed.querySelector('text')?.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')
      ).toBe('en');
      expect(parsed.querySelector('main')?.getAttributeNS('urn:example', 'custom')).toBe(
        'preserve'
      );
      expect(parsed.querySelector('main')?.getAttribute('data-name')).toBe('test');
      expect(source.outerHTML).toBe(before);
    });
  });
}
