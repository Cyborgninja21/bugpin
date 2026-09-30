import { withCaptureSvgPreparer } from './capture-svg-hook';

/**
 * How a live scroll container displays its scrollbars. A scrollbar is only
 * visible when it takes up layout space: overlay scrollbars and scrollbars
 * hidden by page CSS take none.
 */
export interface ScrollContainerSnapshot {
  localName: string;
  classNames: string[];
  overflowX: string;
  overflowY: string;
  showX: boolean;
  showY: boolean;
  // Box sizes that include the scrollbar space, set only when a scrollbar takes space.
  width: number | null;
  height: number | null;
  // The overflow of `html`, and of `body` when `html` is visible, applies to the viewport.
  appliesToViewport: boolean;
}

// Scrollbars are wider than this; anything below is layout rounding.
const MIN_SCROLLBAR_SIZE = 2;

const preparedSvgs = new WeakSet<SVGSVGElement>();

function isScrollOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function isScrollContainer(style: CSSStyleDeclaration): boolean {
  return isScrollOverflow(style.overflowX) || isScrollOverflow(style.overflowY);
}

function px(value: string): number {
  return parseFloat(value) || 0;
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

function snapshotScrollContainer(
  element: HTMLElement,
  style: CSSStyleDeclaration
): ScrollContainerSnapshot {
  const borderX = px(style.borderLeftWidth) + px(style.borderRightWidth);
  const borderY = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const paddingX = px(style.paddingLeft) + px(style.paddingRight);
  const paddingY = px(style.paddingTop) + px(style.paddingBottom);
  const verticalGutter = element.offsetWidth - element.clientWidth - borderX;
  const horizontalGutter = element.offsetHeight - element.clientHeight - borderY;
  const borderBox = style.boxSizing === 'border-box';

  // A reserved gutter without overflow (scrollbar-gutter: stable) shows no scrollbar.
  const showY =
    verticalGutter >= MIN_SCROLLBAR_SIZE &&
    isScrollOverflow(style.overflowY) &&
    (style.overflowY === 'scroll' || element.scrollHeight > element.clientHeight);
  const showX =
    horizontalGutter >= MIN_SCROLLBAR_SIZE &&
    isScrollOverflow(style.overflowX) &&
    (style.overflowX === 'scroll' || element.scrollWidth > element.clientWidth);

  return {
    localName: element.localName,
    classNames: Array.from(element.classList),
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    showX,
    showY,
    width:
      verticalGutter >= MIN_SCROLLBAR_SIZE
        ? borderBox
          ? element.offsetWidth
          : element.offsetWidth - borderX - paddingX
        : null,
    height:
      horizontalGutter >= MIN_SCROLLBAR_SIZE
        ? borderBox
          ? element.offsetHeight
          : element.offsetHeight - borderY - paddingY
        : null,
    appliesToViewport: appliesToViewport(element),
  };
}

/**
 * Read the scroll containers under `root` in document order, skipping the
 * subtrees html-to-image leaves out of the clone. Reads layout only.
 */
export function snapshotScrollContainers(
  root: HTMLElement,
  isIncluded: (node: Node) => boolean
): ScrollContainerSnapshot[] {
  const snapshots: ScrollContainerSnapshot[] = [];
  const visit = (element: Element) => {
    if (element instanceof HTMLElement) {
      const style = window.getComputedStyle(element);
      if (isScrollContainer(style)) {
        snapshots.push(snapshotScrollContainer(element, style));
      }
    }
    for (const child of Array.from(element.children)) {
      if (isIncluded(child)) visit(child);
    }
  };
  visit(root);
  return snapshots;
}

function findCloneScrollContainers(cloneRoot: HTMLElement): HTMLElement[] {
  return [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && isScrollContainer(element.style)
  );
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

function hideScrollbars(clone: HTMLElement): void {
  // Overflow hidden keeps the same scroll container layout as auto or scroll, without scrollbars.
  if (isScrollOverflow(clone.style.overflowX)) clone.style.overflowX = 'hidden';
  if (isScrollOverflow(clone.style.overflowY)) clone.style.overflowY = 'hidden';
}

function applySnapshot(clone: HTMLElement, snapshot: ScrollContainerSnapshot, isRoot: boolean) {
  if (snapshot.appliesToViewport) {
    // The viewport scrollbar is outside the captured area; the element itself behaves as visible.
    clone.style.overflowX = 'visible';
    clone.style.overflowY = 'visible';
    return;
  }
  if (isRoot) {
    // Capture dimensions exclude the root's own scrollbar area.
    hideScrollbars(clone);
    return;
  }

  if (isScrollOverflow(snapshot.overflowX))
    clone.style.overflowX = snapshot.showX ? 'scroll' : 'hidden';
  if (isScrollOverflow(snapshot.overflowY))
    clone.style.overflowY = snapshot.showY ? 'scroll' : 'hidden';
  // The copied width and height exclude the scrollbar, which the rendered clone would subtract again.
  if (snapshot.width !== null) clone.style.width = `${snapshot.width}px`;
  if (snapshot.height !== null) clone.style.height = `${snapshot.height}px`;
}

/**
 * Show scrollbars in the capture clone exactly where the live page shows them.
 * When the clone cannot be matched to the snapshot, all scrollbars are hidden,
 * which keeps the live content size and never shows a scrollbar that was not visible.
 */
export function applyScrollbarSnapshot(
  svg: SVGSVGElement,
  snapshots: ScrollContainerSnapshot[] | null
): void {
  if (preparedSvgs.has(svg)) return;
  const cloneRoot = svg.firstElementChild?.firstElementChild;
  if (!(cloneRoot instanceof HTMLElement)) return;
  preparedSvgs.add(svg);

  const clones = findCloneScrollContainers(cloneRoot);
  const matched =
    snapshots !== null &&
    clones.length === snapshots.length &&
    clones.every((clone, index) => matchesSnapshot(clone, snapshots[index]));

  clones.forEach((clone, index) => {
    if (matched && snapshots) {
      applySnapshot(clone, snapshots[index], clone === cloneRoot);
    } else {
      hideScrollbars(clone);
    }
  });
}

/**
 * Run a DOM capture of `root` whose clone shows scrollbars only where the live
 * page shows them. Live scroll containers are measured right before capture.
 */
export function withLiveScrollbars<T>(
  root: HTMLElement,
  isIncluded: (node: Node) => boolean,
  run: () => Promise<T>
): Promise<T> {
  let snapshots: ScrollContainerSnapshot[] | null = null;
  try {
    snapshots = snapshotScrollContainers(root, isIncluded);
  } catch (error) {
    console.warn('[BugPin] Could not measure scrollbars; hiding them in the screenshot:', error);
  }
  return withCaptureSvgPreparer((svg) => applyScrollbarSnapshot(svg, snapshots), run);
}
