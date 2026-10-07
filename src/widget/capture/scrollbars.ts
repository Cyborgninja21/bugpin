import type { CloneRoot } from './capture-clone';

/**
 * How a live scroll container shows its scrollbars, measured when html-to-image
 * clones it. A scrollbar is visible only when it takes layout space: overlay
 * scrollbars and scrollbars hidden by page CSS take none.
 */
interface ScrollContainerSnapshot {
  localName: string;
  classNames: string[];
  overflowX: string;
  overflowY: string;
  // The overflow of `html`, and of `body` when `html` is visible, belongs to the viewport.
  appliesToViewport: boolean;
  showX: boolean;
  showY: boolean;
  // Layout space the live scrollbars take, 0 when they take none.
  verticalGutter: number;
  horizontalGutter: number;
  verticalGutterOnLeft: boolean;
  verticalGutterOnBothEdges: boolean;
  contentBox: boolean;
  // Box size in the element's own box-sizing terms, including scrollbar space.
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingBottom: number;
}

export interface ScrollbarRecorder {
  /** Wraps html-to-image's `filter` option to measure scroll containers as they are cloned. */
  observe(include?: (node: HTMLElement) => boolean): (node: HTMLElement) => boolean;
  /** Makes the clone's scrollbars and content geometry match the live page. */
  apply(cloneRoot: CloneRoot): void;
}

// Scrollbars are wider than this; anything below is layout rounding.
const MIN_SCROLLBAR_SIZE = 2;

function isScrollOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function isScrollContainer(style: CSSStyleDeclaration): boolean {
  return isScrollOverflow(style.overflowX) || isScrollOverflow(style.overflowY);
}

function px(value: string): number {
  return parseFloat(value) || 0;
}

function scrollbarSpace(space: number): number {
  return space >= MIN_SCROLLBAR_SIZE ? space : 0;
}

function appliesToViewport(element: HTMLElement): boolean {
  const { documentElement, body } = element.ownerDocument;
  if (element === documentElement) {
    return true;
  }
  if (element !== body) {
    return false;
  }
  const rootStyle = window.getComputedStyle(documentElement);
  return rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible';
}

// Border-box size with subpixel precision, falling back to layout integers when transformed.
function borderBoxSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const untransformed =
    Math.abs(rect.width - element.offsetWidth) < 1 &&
    Math.abs(rect.height - element.offsetHeight) < 1;
  return untransformed
    ? { width: rect.width, height: rect.height }
    : { width: element.offsetWidth, height: element.offsetHeight };
}

function snapshotScrollContainer(
  element: HTMLElement,
  style: CSSStyleDeclaration
): ScrollContainerSnapshot {
  const borderLeft = px(style.borderLeftWidth);
  const borderX = borderLeft + px(style.borderRightWidth);
  const borderY = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const paddingLeft = px(style.paddingLeft);
  const paddingRight = px(style.paddingRight);
  const paddingBottom = px(style.paddingBottom);
  const paddingX = paddingLeft + paddingRight;
  const paddingY = px(style.paddingTop) + paddingBottom;
  const verticalGutter = scrollbarSpace(element.offsetWidth - element.clientWidth - borderX);
  const horizontalGutter = scrollbarSpace(element.offsetHeight - element.clientHeight - borderY);
  const contentBox = style.boxSizing !== 'border-box';
  const size = borderBoxSize(element);

  return {
    localName: element.localName,
    classNames: Array.from(element.classList),
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    appliesToViewport: appliesToViewport(element),
    // A reserved gutter without overflow (scrollbar-gutter: stable) shows no scrollbar.
    showX:
      horizontalGutter > 0 &&
      isScrollOverflow(style.overflowX) &&
      (style.overflowX === 'scroll' || element.scrollWidth > element.clientWidth),
    showY:
      verticalGutter > 0 &&
      isScrollOverflow(style.overflowY) &&
      (style.overflowY === 'scroll' || element.scrollHeight > element.clientHeight),
    verticalGutter,
    horizontalGutter,
    // Browsers differ in which side they put the vertical scrollbar on for right-to-left text.
    verticalGutterOnLeft: element.clientLeft - borderLeft >= MIN_SCROLLBAR_SIZE,
    verticalGutterOnBothEdges: style.getPropertyValue('scrollbar-gutter').includes('both-edges'),
    contentBox,
    width: contentBox ? size.width - borderX - paddingX : size.width,
    height: contentBox ? size.height - borderY - paddingY : size.height,
    paddingLeft,
    paddingRight,
    paddingBottom,
  };
}

function matchesSnapshot(clone: HTMLElement, snapshot: ScrollContainerSnapshot): boolean {
  // html-to-image adds generated class names for pseudo-element styles, so live classes are a subset.
  return (
    clone.localName === snapshot.localName &&
    clone.style.overflowX === snapshot.overflowX &&
    clone.style.overflowY === snapshot.overflowY &&
    snapshot.classNames.every((className) => clone.classList.contains(className))
  );
}

function adjustClone(
  clone: HTMLElement,
  snapshot: ScrollContainerSnapshot,
  isRoot: boolean,
  rootSizeLocked: boolean
): void {
  const style = clone.style;
  if (snapshot.appliesToViewport) {
    // The viewport's scrollbars are outside the captured area; the element itself behaves as visible.
    style.overflowX = 'visible';
    style.overflowY = 'visible';
    return;
  }

  // The captured area excludes the root's own scrollbars.
  const showX = snapshot.showX && !isRoot;
  const showY = snapshot.showY && !isRoot;
  if (isScrollOverflow(snapshot.overflowX)) style.overflowX = showX ? 'scroll' : 'hidden';
  if (isScrollOverflow(snapshot.overflowY)) style.overflowY = showY ? 'scroll' : 'hidden';
  const { verticalGutter, horizontalGutter } = snapshot;
  if (isRoot) {
    if (rootSizeLocked) {
      // html-to-image sizes a root captured with explicit dimensions itself.
      return;
    }
    // Without explicit dimensions the image is as large as the root's client area plus
    // borders, so the root drops its scrollbar space and keeps its live content size.
    if (verticalGutter > 0) {
      style.setProperty('scrollbar-gutter', 'auto');
      style.width = `${snapshot.width - verticalGutter}px`;
    }
    if (horizontalGutter > 0) {
      style.height = `${snapshot.height - horizontalGutter}px`;
    }
    return;
  }

  // A shown scrollbar keeps the live box size and takes its space inside it. A hidden
  // scrollbar's space becomes padding, so the content keeps its live size either way.
  if (verticalGutter > 0) {
    if (showY) {
      style.width = `${snapshot.width}px`;
    } else {
      style.setProperty('scrollbar-gutter', 'auto');
      if (snapshot.verticalGutterOnBothEdges) {
        style.paddingLeft = `${snapshot.paddingLeft + verticalGutter / 2}px`;
        style.paddingRight = `${snapshot.paddingRight + verticalGutter / 2}px`;
      } else if (snapshot.verticalGutterOnLeft) {
        style.paddingLeft = `${snapshot.paddingLeft + verticalGutter}px`;
      } else {
        style.paddingRight = `${snapshot.paddingRight + verticalGutter}px`;
      }
      style.width = `${snapshot.contentBox ? snapshot.width - verticalGutter : snapshot.width}px`;
    }
  }
  if (horizontalGutter > 0) {
    if (showX) {
      style.height = `${snapshot.height}px`;
    } else {
      style.paddingBottom = `${snapshot.paddingBottom + horizontalGutter}px`;
      style.height = `${snapshot.contentBox ? snapshot.height - horizontalGutter : snapshot.height}px`;
    }
  }
}

/**
 * Record the scroll containers of an html-to-image capture of `root` so its clone
 * shows scrollbars only where the live page shows them, without changing content
 * size. Containers are measured through html-to-image's `filter` option, which it
 * calls in the same order in which it clones, including shadow DOM and slotted
 * content. Clones are paired with measurements in that order, and pairing stops
 * at the first clone that does not match: unmatched clones stay as html-to-image
 * built them. Only the detached clone is changed, never the live page.
 */
export function recordScrollbars(root: HTMLElement, rootSizeLocked: boolean): ScrollbarRecorder {
  const snapshots: ScrollContainerSnapshot[] = [];
  let reliable = true;

  const record = (node: Node) => {
    if (!reliable || !(node instanceof HTMLElement)) return;
    try {
      const style = window.getComputedStyle(node);
      if (isScrollContainer(style)) {
        snapshots.push(snapshotScrollContainer(node, style));
      }
    } catch {
      // Without a complete record the clone cannot be matched, so it is left unchanged.
      reliable = false;
    }
  };
  record(root);

  return {
    observe: (include) => (node) => {
      const included = include ? include(node) : true;
      if (included) record(node);
      return included;
    },
    apply: (cloneRoot) => {
      if (!reliable || !(cloneRoot instanceof HTMLElement)) return;
      const clones = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))].filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && isScrollContainer(element.style)
      );
      const count = Math.min(clones.length, snapshots.length);
      let matched = 0;
      while (matched < count && matchesSnapshot(clones[matched], snapshots[matched])) {
        matched += 1;
      }
      for (let index = 0; index < matched; index += 1) {
        adjustClone(clones[index], snapshots[index], clones[index] === cloneRoot, rootSizeLocked);
      }
    },
  };
}
