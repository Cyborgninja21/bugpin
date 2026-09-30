const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// XML 1.0 NameStartChar and NameChar productions, without ':'.
const NAME_START_CHARS =
  'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF' +
  '\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF' +
  '\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHARS = `${NAME_START_CHARS}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NC_NAME = new RegExp(`^[${NAME_START_CHARS}][${NAME_CHARS}]*$`, 'u');

// Only these prefixes are bound without an explicit xmlns declaration.
const PREDECLARED_PREFIXES = new Set(['xml', 'xmlns']);

type SerializeToString = XMLSerializer['serializeToString'];

let activeScopes = 0;
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
 * own clone of the page. Anything connected to the document, or shaped
 * differently, belongs to someone else and is passed through untouched.
 */
function isDetachedCaptureSvg(node: Node | null | undefined): node is SVGSVGElement {
  if (!node || node.nodeType !== 1 || node.isConnected) {
    return false;
  }
  const element = node as Element;
  const firstChild = element.firstElementChild;
  return (
    element.namespaceURI === SVG_NAMESPACE &&
    element.localName === 'svg' &&
    firstChild !== null &&
    firstChild.namespaceURI === SVG_NAMESPACE &&
    firstChild.localName === 'foreignObject'
  );
}

function install(prototype: XMLSerializer): void {
  const original = prototype.serializeToString;
  const safeSerialize: SerializeToString = function (this: XMLSerializer, node: Node) {
    if (isDetachedCaptureSvg(node)) {
      removeXmlUnsafeAttributes(node);
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
 * Run a DOM capture while XML serialization drops attributes whose names are
 * not valid XML. The patch only acts on the detached capture SVG, never on the
 * live page, and is removed once the last overlapping capture settles.
 */
export async function withXmlSafeSerialization<T>(run: () => Promise<T>): Promise<T> {
  if (typeof XMLSerializer === 'undefined') {
    return run();
  }

  const prototype = XMLSerializer.prototype;
  if (activeScopes === 0) {
    install(prototype);
  }
  activeScopes += 1;

  try {
    return await run();
  } finally {
    activeScopes -= 1;
    if (activeScopes === 0) {
      uninstall(prototype);
    }
  }
}
