import { useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  LAUNCHER_EDGE_MARGIN,
  clearLauncherPosition,
  launcherPositionStyle,
  loadLauncherPosition,
  saveLauncherPosition,
  snapLauncherPosition,
  type LauncherPosition,
} from '../storage/launcher-position.js';

/** Pointer travel (px) before a press becomes a drag instead of a click */
export const DRAG_THRESHOLD = 5;

/** Vertical step for Alt+ArrowUp/ArrowDown, as a share of the viewport */
const KEYBOARD_STEP = 0.05;

interface DragState {
  pointerId: number | undefined;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  moved: boolean;
}

/**
 * Lets the user drag the launcher to any height on either screen edge.
 * The chosen spot is remembered per site; Alt+Arrow keys move it and
 * Alt+Home returns it to the configured corner.
 */
export function useDraggableLauncher(wrapperRef: RefObject<HTMLDivElement>, onClick: () => void) {
  const [position, setPosition] = useState<LauncherPosition | null>(() => loadLauncherPosition());
  const [livePosition, setLivePosition] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const commit = (next: LauncherPosition | null) => {
    setPosition(next);
    if (next) saveLauncherPosition(next);
    else clearLauncherPosition();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    // Capture now, not after the drag threshold: a quick flick can leave the
    // button between two pointermove events, and uncaptured moves then go to
    // the page instead, so the drag never starts.
    const target = event.currentTarget as Element | null;
    if (event.pointerId !== undefined && target?.setPointerCapture) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Pointer already released
      }
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    if (!state.moved) {
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (distance < DRAG_THRESHOLD) return;
      state.moved = true;
    }
    const maxLeft = window.innerWidth - state.width - LAUNCHER_EDGE_MARGIN;
    const maxTop = window.innerHeight - state.height - LAUNCHER_EDGE_MARGIN;
    setLivePosition({
      left: Math.max(LAUNCHER_EDGE_MARGIN, Math.min(maxLeft, event.clientX - state.offsetX)),
      top: Math.max(LAUNCHER_EDGE_MARGIN, Math.min(maxTop, event.clientY - state.offsetY)),
    });
  };

  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    const state = drag.current;
    drag.current = null;
    const target = event.currentTarget as Element | null;
    if (state?.pointerId !== undefined && target?.hasPointerCapture?.(state.pointerId)) {
      target.releasePointerCapture(state.pointerId);
    }
    if (!state?.moved) return;
    suppressClick.current = !cancelled;
    const left = Math.max(0, event.clientX - state.offsetX);
    const top = Math.max(0, event.clientY - state.offsetY);
    setLivePosition(null);
    commit(
      snapLauncherPosition(
        left,
        top,
        state.width,
        state.height,
        window.innerWidth,
        window.innerHeight
      )
    );
  };

  const onButtonClick = (event: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey) return;
    const current = position ?? { side: 'right' as const, y: 1 };
    let next: LauncherPosition | null | undefined;
    switch (event.key) {
      case 'ArrowUp':
        next = { ...current, y: Math.max(0, current.y - KEYBOARD_STEP) };
        break;
      case 'ArrowDown':
        next = { ...current, y: Math.min(1, current.y + KEYBOARD_STEP) };
        break;
      case 'ArrowLeft':
        next = { ...current, side: 'left' };
        break;
      case 'ArrowRight':
        next = { ...current, side: 'right' };
        break;
      case 'Home':
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  const style: Record<string, string> | null = livePosition
    ? { left: `${livePosition.left}px`, top: `${livePosition.top}px` }
    : position
      ? launcherPositionStyle(position)
      : null;

  return {
    style,
    isDragging: livePosition !== null,
    /** Whether the launcher sits in the upper half, so the tooltip should open below it */
    isNearTop: livePosition
      ? livePosition.top < window.innerHeight / 2
      : position !== null && position.y < 0.5,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent) => endDrag(event, false),
      onPointerCancel: (event: PointerEvent) => endDrag(event, true),
      onClick: onButtonClick,
      onKeyDown,
    },
  };
}
