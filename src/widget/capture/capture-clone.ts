const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type SerializeToString = XMLSerializer['serializeToString'];

export type CloneRoot = Element & ElementCSSInlineStyle;

/** Adjusts BugPin's detached clone right before html-to-image serializes it. */
export type ClonePreparer = (svg: SVGSVGElement, cloneRoot: CloneRoot) => void;

interface ActiveCapture {
  // The live animation-name that the capture marker temporarily replaces.
  animationName: string;
  prepare: ClonePreparer;
}

// Captures in progress, keyed by the marker on each capture's clone root.
const activeCaptures = new Map<string, ActiveCapture>();
let captureCount = 0;
let originalSerialize: SerializeToString | null = null;
let installedSerialize: SerializeToString | null = null;

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
  // Not `instanceof`: a clone made from an iframe document belongs to that iframe's realm.
  const cloneRoot = foreignObject.firstElementChild as CloneRoot | null;
  if (!cloneRoot?.style) {
    return null;
  }
  return activeCaptures.has(cloneRoot.style.animationName) ? cloneRoot : null;
}

function install(prototype: XMLSerializer): void {
  const original = prototype.serializeToString;
  const preparingSerialize: SerializeToString = function (this: XMLSerializer, node: Node) {
    const cloneRoot = findOwnedCloneRoot(node);
    const capture = cloneRoot ? activeCaptures.get(cloneRoot.style.animationName) : undefined;
    if (cloneRoot && capture) {
      cloneRoot.style.animationName = capture.animationName;
      capture.prepare(node as SVGSVGElement, cloneRoot);
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

// html-to-image clones a same-origin iframe's body in place of the iframe itself.
function clonedElementFor(root: Element): Element {
  if (root instanceof HTMLIFrameElement) {
    try {
      return root.contentDocument?.body ?? root;
    } catch {
      return root;
    }
  }
  return root;
}

/**
 * Run an html-to-image capture of `root` and let `prepare` adjust that capture's
 * clone right before it is serialized.
 *
 * `run` must pass `captureStyle` as html-to-image's `style` option. html-to-image
 * applies it to the root clone of that call only, so the unique animation-name
 * it sets identifies this capture's clone. The original animation-name is put
 * back before serialization. The live page is never changed, and the serializer
 * patch is removed once the last overlapping capture settles.
 */
export async function withCaptureClone<T>(
  root: Element,
  prepare: ClonePreparer,
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
  const cloned = clonedElementFor(root);
  const view = cloned.ownerDocument.defaultView ?? window;
  activeCaptures.set(marker, {
    animationName: view.getComputedStyle(cloned).animationName,
    prepare,
  });

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
