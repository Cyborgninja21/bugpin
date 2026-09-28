import { useEffect, useRef, useState } from 'preact/hooks';

/** How long the mouse must rest on the launcher before the menu opens (ms) */
export const MENU_OPEN_DELAY = 1000;

/** Grace period after the mouse leaves, so it can travel from the launcher to the menu (ms) */
export const MENU_CLOSE_GRACE = 400;

/**
 * Long-hover menu of the launcher. Opens after the mouse rests on the launcher
 * for MENU_OPEN_DELAY; touch and pen never open it (a tap is a click). Closes
 * shortly after the mouse leaves the launcher and menu.
 */
export function useLauncherMenu(enabled: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  const onPointerEnter = (event: PointerEvent) => {
    if (!enabled || event.pointerType !== 'mouse') return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (!isOpen && !openTimer.current) {
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setIsOpen(true);
      }, MENU_OPEN_DELAY);
    }
  };

  const onPointerLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (isOpen && !closeTimer.current) {
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setIsOpen(false);
      }, MENU_CLOSE_GRACE);
    }
  };

  /** Close now and forget any pending open, e.g. when a drag or click starts */
  const close = () => {
    clearTimers();
    setIsOpen(false);
  };

  /** Open now, for keyboard users */
  const open = () => {
    if (!enabled) return;
    clearTimers();
    setIsOpen(true);
  };

  return { isOpen: enabled && isOpen, open, close, onPointerEnter, onPointerLeave };
}

/** Fill `{tld}` in a news URL with the host page's top-level domain */
export function resolveNewsUrl(template: string, hostname: string): string {
  const tld = hostname.split('.').pop() || '';
  return template.split('{tld}').join(tld);
}
