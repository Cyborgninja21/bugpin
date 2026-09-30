const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export type CaptureSvgPreparer = (svg: SVGSVGElement) => void;

type SerializeToString = XMLSerializer['serializeToString'];

const activePreparers: CaptureSvgPreparer[] = [];
let originalSerialize: SerializeToString | null = null;
let installedSerialize: SerializeToString | null = null;

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

function prepare(svg: SVGSVGElement): void {
  for (const preparer of activePreparers) {
    try {
      preparer(svg);
    } catch (error) {
      // A failed preparation step leaves the clone as html-to-image built it.
      console.warn('[BugPin] Skipped a screenshot preparation step:', error);
    }
  }
}

function install(prototype: XMLSerializer): void {
  const original = prototype.serializeToString;
  const preparingSerialize: SerializeToString = function (this: XMLSerializer, node: Node) {
    if (isDetachedCaptureSvg(node)) {
      prepare(node);
    }
    return original.call(this, node);
  };
  try {
    prototype.serializeToString = preparingSerialize;
  } catch {
    // A host page may have frozen the prototype. Capture then runs unpatched.
    return;
  }
  if (prototype.serializeToString === preparingSerialize) {
    originalSerialize = original;
    installedSerialize = preparingSerialize;
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
 * Run a DOM capture while `preparer` may adjust html-to-image's detached clone
 * right before it is serialized into an SVG image. The live page is never
 * touched, and the patch is removed once the last overlapping capture settles.
 */
export async function withCaptureSvgPreparer<T>(
  preparer: CaptureSvgPreparer,
  run: () => Promise<T>
): Promise<T> {
  if (typeof XMLSerializer === 'undefined') {
    return run();
  }

  const prototype = XMLSerializer.prototype;
  if (activePreparers.length === 0) {
    install(prototype);
  }
  activePreparers.push(preparer);

  try {
    return await run();
  } finally {
    activePreparers.splice(activePreparers.indexOf(preparer), 1);
    if (activePreparers.length === 0) {
      uninstall(prototype);
    }
  }
}
