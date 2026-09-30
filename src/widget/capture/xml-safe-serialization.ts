const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// NCName from Namespaces in XML 1.0: an XML Name without ':'.
// https://www.w3.org/TR/xml/#NT-NameStartChar
const NC_NAME =
  /^[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}][A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/u;

// Only these prefixes are bound without an explicit xmlns declaration.
const PREDECLARED_PREFIXES = new Set(['xml', 'xmlns']);

type SerializeToString = XMLSerializer['serializeToString'];

type CloneRoot = Element & ElementCSSInlineStyle;

// Captures in progress: the marker on each capture's clone root, mapped to the
// live root's animation-name that the marker temporarily replaces.
const activeCaptures = new Map<string, string>();
let captureCount = 0;
let originalSerialize: SerializeToString | null = null;
let installedSerialize: SerializeToString | null = null;

/**
 * Whether the browser serializer can emit this attribute as well-formed XML.
 * Attributes created by the HTML parser have no namespace, so names such as
 * `wire:navigate`, `x-on:click`, `@click` or `:class` are written verbatim and
 * make the resulting SVG image fail to decode.
 */
export function isXmlSafeAttribute(attribute: Attr): boolean {
  if (attribute.namespaceURI !== null) {
    return true;
  }

  const name = attribute.name;
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    return NC_NAME.test(name);
  }

  const prefix = name.slice(0, colonIndex);
  const localName = name.slice(colonIndex + 1);
  return PREDECLARED_PREFIXES.has(prefix) && NC_NAME.test(localName);
}

function removeXmlUnsafeAttributes(root: Element): void {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (!isXmlSafeAttribute(attribute)) {
        element.removeAttributeNode(attribute);
      }
    }
  }
}

/**
 * html-to-image serializes a detached `<svg><foreignObject>` wrapper around its
 * clone of the capture root. Only a clone root carrying the marker of a capture
 * in progress belongs to BugPin; any other SVG, including another export of the
 * same element, is passed through untouched.
 */
function findOwnedCloneRoot(node: Node | null | undefined): CloneRoot | null {
  if (!node || node.nodeType !== 1 || node.isConnected) {
    return null;
  }
  const svg = node as Element;
  const foreignObject = svg.firstElementChild;
  if (
    svg.namespaceURI !== SVG_NAMESPACE ||
    svg.localName !== 'svg' ||
    foreignObject === null ||
    foreignObject.namespaceURI !== SVG_NAMESPACE ||
    foreignObject.localName !== 'foreignObject'
  ) {
    return null;
  }
  const cloneRoot = foreignObject.firstElementChild;
  if (!(cloneRoot instanceof HTMLElement || cloneRoot instanceof SVGElement)) {
    return null;
  }
  return activeCaptures.has(cloneRoot.style.animationName) ? cloneRoot : null;
}

function install(prototype: XMLSerializer): void {
  const original = prototype.serializeToString;
  const safeSerialize: SerializeToString = function (this: XMLSerializer, node: Node) {
    const cloneRoot = findOwnedCloneRoot(node);
    if (cloneRoot) {
      cloneRoot.style.animationName = activeCaptures.get(cloneRoot.style.animationName) ?? '';
      removeXmlUnsafeAttributes(node as Element);
    }
    return original.call(this, node);
  };
  try {
    prototype.serializeToString = safeSerialize;
  } catch {
    // A host page may have frozen the prototype. Capture then runs unpatched.
    return;
  }
  if (prototype.serializeToString === safeSerialize) {
    originalSerialize = original;
    installedSerialize = safeSerialize;
  }
}

function uninstall(prototype: XMLSerializer): void {
  // Leave the method alone if the host page replaced it while capture was running.
  if (originalSerialize && prototype.serializeToString === installedSerialize) {
    try {
      prototype.serializeToString = originalSerialize;
    } catch {
      // The host page locked the property after install; the patch stays inert outside capture SVGs.
    }
  }
  originalSerialize = null;
  installedSerialize = null;
}

/**
 * Run an html-to-image capture of `root` while XML serialization drops
 * attributes whose names are not valid XML from that capture's clone.
 *
 * `run` must pass `captureStyle` as html-to-image's `style` option. html-to-image
 * applies it to the root clone of that call only, so the unique animation-name
 * it sets identifies this capture's clone. The original animation-name is put
 * back before serialization. The live page is never changed, and the serializer
 * patch is removed once the last overlapping capture settles.
 */
export async function withXmlSafeSerialization<T>(
  root: Element,
  run: (captureStyle: Partial<CSSStyleDeclaration>) => Promise<T>
): Promise<T> {
  if (typeof XMLSerializer === 'undefined') {
    return run({});
  }

  const prototype = XMLSerializer.prototype;
  if (activeCaptures.size === 0) {
    install(prototype);
  }
  captureCount += 1;
  const marker = `bugpin-capture-${captureCount}-${Math.random().toString(36).slice(2)}`;
  activeCaptures.set(marker, window.getComputedStyle(root).animationName);

  try {
    // Without an active patch the marker would reach the output, so it is only set when the patch runs.
    return await run(originalSerialize ? { animationName: marker } : {});
  } finally {
    activeCaptures.delete(marker);
    if (activeCaptures.size === 0) {
      uninstall(prototype);
    }
  }
}
