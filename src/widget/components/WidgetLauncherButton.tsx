import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.js';
import { cn } from '../lib/utils';
import { useEffectiveTheme } from '../hooks/use-effective-theme.js';
import { useDraggableLauncher } from '../hooks/use-draggable-launcher.js';
import { useLauncherMenu, resolveNewsUrl } from '../hooks/use-launcher-menu.js';
import { useLocale } from '../hooks/use-locale.js';
import { getLocale, t } from '../i18n/index.js';
import { resolveLauncherText } from '../i18n/resolve-launcher-text.js';
import type { LauncherTextBundle } from '../config.js';

interface WidgetLauncherButtonProps {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: LauncherTextBundle;
  buttonShape: 'round' | 'rectangle';
  buttonIcon: string | null;
  buttonIconSize: number;
  buttonIconStroke: number;
  theme: 'auto' | 'light' | 'dark';
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: LauncherTextBundle;
  onClick: () => void;
  /** Opens the dialog preset to a feature request; null hides the menu entry */
  onRequestFeature?: (() => void) | null;
  /** "What's new" link (`{tld}` filled from the page); null hides the menu entry */
  newsUrl?: string | null;
}

const menuItemClass =
  'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-full border-none shadow-lg cursor-pointer whitespace-nowrap no-underline animate-[bugpin-tooltip-fade-in_0.2s_ease-in-out_forwards]';

const menuItemStyle = { opacity: 0 };

const positionClasses: Record<string, string> = {
  'bottom-right': 'bottom-5 right-5',
  'bottom-left': 'bottom-5 left-5',
  'top-right': 'top-5 right-5',
  'top-left': 'top-5 left-5',
};

export const WidgetLauncherButton: FunctionComponent<WidgetLauncherButtonProps> = ({
  position,
  buttonText,
  buttonShape,
  buttonIcon,
  buttonIconSize,
  buttonIconStroke,
  theme,
  lightButtonColor,
  lightTextColor,
  lightButtonHoverColor,
  lightTextHoverColor,
  darkButtonColor,
  darkTextColor,
  darkButtonHoverColor,
  darkTextHoverColor,
  enableHoverScaleEffect,
  tooltipEnabled,
  tooltipText,
  onClick,
  onRequestFeature = null,
  newsUrl = null,
}) => {
  useLocale();
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipOffset, setTooltipOffset] = useState({
    left: '50%',
    transform: 'translateX(-50%)',
    arrowLeft: '50%',
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const draggable = useDraggableLauncher(wrapperRef, onClick);
  const tooltipBelow = draggable.style ? draggable.isNearTop : position.startsWith('top');
  const alignLeft = draggable.dockedSide
    ? draggable.dockedSide === 'left'
    : position.endsWith('left');
  const resolvedNewsUrl = newsUrl ? resolveNewsUrl(newsUrl, window.location.hostname) : null;
  const hasMenu = Boolean(onRequestFeature || resolvedNewsUrl);
  const menu = useLauncherMenu(hasMenu && !draggable.isDragging);
  const menuRef = useRef<HTMLDivElement>(null);

  const focusMenuItem = (step: 1 | -1 | 0) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const root = menuRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const current = items.indexOf(root?.activeElement as HTMLElement);
    const next = step === 0 || current < 0 ? 0 : (current + step + items.length) % items.length;
    items[next].focus();
  };

  // Keyboard opens move focus into the menu once it has rendered
  const focusMenuOnOpen = useRef(false);
  useEffect(() => {
    if (menu.isOpen && focusMenuOnOpen.current) {
      focusMenuOnOpen.current = false;
      focusMenuItem(0);
    }
  }, [menu.isOpen]);

  const openMenuFromKeyboard = () => {
    focusMenuOnOpen.current = true;
    menu.open();
  };

  const onLauncherKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey && hasMenu && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      openMenuFromKeyboard();
      return;
    }
    draggable.handlers.onKeyDown(event);
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      menu.close();
      buttonRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusMenuItem(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  const onWrapperFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (menu.isOpen && !(next && wrapperRef.current?.contains(next))) menu.close();
  };
  const effectiveTheme = useEffectiveTheme(theme);
  const isDarkMode = effectiveTheme === 'dark';
  const activeLocale = getLocale();
  const resolvedButtonText = resolveLauncherText(
    buttonText.project,
    buttonText.global,
    activeLocale,
    buttonText.builtin?.[activeLocale] ?? null
  );
  const tooltipBuiltinForActive = tooltipText.builtin?.[activeLocale] ?? null;
  const resolvedTooltipText =
    resolveLauncherText(
      tooltipText.project,
      tooltipText.global,
      activeLocale,
      tooltipBuiltinForActive
    ) ?? t('tooltip.launcher');

  // Calculate tooltip position to ensure 4px margin from window edges
  useEffect(() => {
    if (isHovered && tooltipRef.current && buttonRef.current) {
      const tooltip = tooltipRef.current;
      const button = buttonRef.current;

      // Small delay to ensure tooltip is rendered
      requestAnimationFrame(() => {
        const tooltipRect = tooltip.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const margin = 4;

        // Calculate button center in viewport coordinates
        const buttonCenter = buttonRect.left + buttonRect.width / 2;
        const tooltipHalfWidth = tooltipRect.width / 2;

        // Calculate how much to shift from centered position
        let shift = 0;
        const centeredLeft = buttonCenter - tooltipHalfWidth;

        // Check if tooltip would go off-screen on the left
        if (centeredLeft < margin) {
          shift = margin - centeredLeft;
        }
        // Check if tooltip would go off-screen on the right
        else if (centeredLeft + tooltipRect.width > windowWidth - margin) {
          shift = windowWidth - margin - (centeredLeft + tooltipRect.width);
        }

        setTooltipOffset({
          left: '50%',
          transform: `translateX(-50%) translateX(${shift}px)`,
          arrowLeft: '50%',
        });
      });
    }
  }, [isHovered, resolvedTooltipText]);

  // Select colors based on theme and hover state
  const buttonColor = isDarkMode
    ? isHovered
      ? darkButtonHoverColor
      : darkButtonColor
    : isHovered
      ? lightButtonHoverColor
      : lightButtonColor;

  const textColor = isDarkMode
    ? isHovered
      ? darkTextHoverColor
      : darkTextColor
    : isHovered
      ? lightTextHoverColor
      : lightTextColor;

  // Base colors for tooltip (always use non-hover colors)
  const tooltipBgColor = isDarkMode ? darkButtonColor : lightButtonColor;
  const tooltipTextColor = isDarkMode ? darkTextColor : lightTextColor;

  const borderRadius = buttonShape === 'round' ? '50%' : '8px';
  const ariaLabel = resolvedButtonText || t('aria.launcher');

  // For round shape, padding scales with icon size (half the icon size)
  const padding = buttonShape === 'round' ? `${buttonIconSize / 2}px` : '12px 20px';

  return (
    <div
      ref={wrapperRef}
      class={cn('fixed z-[2147483647]', !draggable.style && positionClasses[position])}
      style={draggable.style ?? undefined}
      onPointerEnter={menu.onPointerEnter}
      onPointerLeave={menu.onPointerLeave}
      onFocusOut={onWrapperFocusOut}
    >
      {menu.isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          class={cn(
            'absolute flex gap-2',
            tooltipBelow ? 'top-full pt-2 flex-col' : 'bottom-full pb-2 flex-col-reverse',
            alignLeft ? 'left-0 items-start' : 'right-0 items-end'
          )}
          onKeyDown={onMenuKeyDown}
        >
          {onRequestFeature && (
            <button
              type="button"
              role="menuitem"
              class={menuItemClass}
              style={{ ...menuItemStyle, backgroundColor: tooltipBgColor, color: tooltipTextColor }}
              onClick={() => {
                menu.close();
                onRequestFeature();
              }}
            >
              <Icon name="lightbulb" size={16} strokeWidth={2} />
              <span>{t('launcher.menu.feature')}</span>
            </button>
          )}
          {resolvedNewsUrl && (
            <a
              role="menuitem"
              href={resolvedNewsUrl}
              target="_blank"
              rel="noopener noreferrer"
              class={menuItemClass}
              style={{ ...menuItemStyle, backgroundColor: tooltipBgColor, color: tooltipTextColor }}
              onClick={() => menu.close()}
            >
              <Icon name="newspaper" size={16} strokeWidth={2} />
              <span>{t('launcher.menu.news')}</span>
            </a>
          )}
        </div>
      )}

      <button
        ref={buttonRef}
        class={cn(
          'relative flex items-center justify-center gap-2 border-none text-sm font-medium shadow-lg transition-all duration-200',
          draggable.isDragging ? 'cursor-grabbing' : 'cursor-pointer',
          enableHoverScaleEffect &&
            !draggable.isDragging &&
            'hover:scale-110 hover:shadow-xl active:scale-105'
        )}
        style={{
          backgroundColor: buttonColor,
          color: textColor,
          borderRadius: borderRadius,
          padding: padding,
          touchAction: 'none',
        }}
        {...draggable.handlers}
        onPointerDown={(event: PointerEvent) => {
          menu.close();
          draggable.handlers.onPointerDown(event);
        }}
        onKeyDown={onLauncherKeyDown}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? menu.isOpen : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={ariaLabel}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
      >
        {buttonIcon && (
          <Icon name={buttonIcon} size={buttonIconSize} strokeWidth={buttonIconStroke} />
        )}
        {resolvedButtonText && <span>{resolvedButtonText}</span>}
      </button>

      {tooltipEnabled &&
        resolvedTooltipText &&
        isHovered &&
        !draggable.isDragging &&
        !menu.isOpen && (
          <div
            ref={tooltipRef}
            class={cn(
              'absolute px-3 py-1.5 text-xs rounded whitespace-nowrap pointer-events-none z-[2147483647] animate-[bugpin-tooltip-fade-in_0.2s_ease-in-out_forwards] shadow-md',
              tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'
            )}
            style={{
              backgroundColor: tooltipBgColor,
              color: tooltipTextColor,
              opacity: 0,
              left: tooltipOffset.left,
              transform: tooltipOffset.transform,
            }}
          >
            {resolvedTooltipText}
            <div
              class={cn(
                'absolute border-4 border-solid border-transparent',
                tooltipBelow ? 'bottom-full' : 'top-full'
              )}
              style={
                tooltipBelow
                  ? {
                      left: tooltipOffset.arrowLeft,
                      transform: 'translateX(-50%)',
                      marginBottom: '-4px',
                      borderBottomColor: tooltipBgColor,
                    }
                  : {
                      left: tooltipOffset.arrowLeft,
                      transform: 'translateX(-50%)',
                      marginTop: '-4px',
                      borderTopColor: tooltipBgColor,
                    }
              }
            />
          </div>
        )}
    </div>
  );
};
