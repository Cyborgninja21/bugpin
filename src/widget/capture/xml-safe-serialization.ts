import { withCaptureSvgPreparer } from './capture-svg-hook';

// NCName from Namespaces in XML 1.0: an XML Name without ':'.
// https://www.w3.org/TR/xml/#NT-NameStartChar
const NC_NAME =
  /^[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}][A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/u;

// Only these prefixes are bound without an explicit xmlns declaration.
const PREDECLARED_PREFIXES = new Set(['xml', 'xmlns']);

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
 * Run a DOM capture while XML serialization drops attributes whose names are
 * not valid XML. Only the detached capture SVG is changed, never the live page.
 */
export function withXmlSafeSerialization<T>(run: () => Promise<T>): Promise<T> {
  return withCaptureSvgPreparer(removeXmlUnsafeAttributes, run);
}
