/**
 * Launcher position that a user chose by dragging the button.
 *
 * Stored per origin in localStorage, so a position picked on one site sticks to
 * every page of that site without any per-page configuration.
 */

export interface LauncherPosition {
  /** Screen edge the launcher is docked to */
  side: 'left' | 'right';
  /** Vertical placement, 0 = top of the viewport, 1 = bottom */
  y: number;
}

/** Gap between the launcher and the viewport edge, matching the corner classes (1.25rem) */
export const LAUNCHER_EDGE_MARGIN = 20;

const STORAGE_KEY = 'bugpin:launcher-position';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function loadLauncherPosition(): LauncherPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LauncherPosition>;
    if (parsed.side !== 'left' && parsed.side !== 'right') return null;
    if (typeof parsed.y !== 'number') return null;
    return { side: parsed.side, y: clamp01(parsed.y) };
  } catch {
    return null;
  }
}

export function saveLauncherPosition(position: LauncherPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage blocked or full: the position still applies for this page view
  }
}

export function clearLauncherPosition(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, or storage blocked
  }
}

/**
 * Snap a dropped launcher to the nearest left/right edge, keeping its height.
 * Coordinates are the launcher's top-left corner in viewport pixels.
 */
export function snapLauncherPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
): LauncherPosition {
  const side = left + width / 2 < viewportWidth / 2 ? 'left' : 'right';
  const travel = viewportHeight - 2 * LAUNCHER_EDGE_MARGIN - height;
  const y = travel > 0 ? clamp01((top - LAUNCHER_EDGE_MARGIN) / travel) : 1;
  return { side, y };
}

/**
 * CSS for a docked launcher. `top` and the matching translate keep it inside the
 * viewport at any window size, so no resize listener is needed.
 */
export function launcherPositionStyle(position: LauncherPosition): Record<string, string> {
  const y = clamp01(position.y);
  return {
    top: `calc(${LAUNCHER_EDGE_MARGIN}px + (100% - ${2 * LAUNCHER_EDGE_MARGIN}px) * ${y})`,
    transform: `translateY(${-y * 100}%)`,
    [position.side]: `${LAUNCHER_EDGE_MARGIN}px`,
  };
}
