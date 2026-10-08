import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { __resetI18nForTests, getLocale, setLocale, subscribe, t } from '../../i18n/index';

describe('widget i18n runtime', () => {
  beforeEach(() => {
    __resetI18nForTests();
  });

  afterEach(() => {
    __resetI18nForTests();
  });

  describe('t()', () => {
    it('returns the active locale entry when present', () => {
      setLocale('en');
      expect(t('tooltip.launcher')).toBe('Found a bug?');
      expect(t('dialog.title')).toBe('Report a Bug');
      expect(t('aria.close')).toBe('Close');
    });

    it('returns the active locale entry for a non-English active locale', () => {
      setLocale('de');
      expect(t('tooltip.launcher')).toBe('Bug gefunden?');
      setLocale('fr');
      expect(t('tooltip.launcher')).toBe('Vous avez trouvé un bug ?');
    });

    it('returns the key itself when no entry exists in either locale', () => {
      // Casting through unknown to bypass the closed key union for this negative test.
      expect((t as unknown as (k: string) => string)('totally.missing.key')).toBe(
        'totally.missing.key'
      );
    });

    it('interpolates {var} placeholders from vars', () => {
      expect(t('annotation.toolbar.strokeWidth', { width: 4 })).toBe('4px');
    });

    it('coerces numeric vars to strings', () => {
      expect(t('annotation.toolbar.zoomReset', { percent: 100 })).toBe(
        'Reset Zoom (100%) - Hold Space to pan'
      );
    });

    it('leaves unknown placeholders intact', () => {
      expect(t('annotation.toolbar.strokeWidth')).toBe('{width}px');
    });

    it('interpolates the missing-key fallback string with vars', () => {
      const tLoose = t as unknown as (k: string, vars?: Record<string, string | number>) => string;
      expect(tLoose('unknown {name}', { name: 'Ada' })).toBe('unknown Ada');
    });
  });

  describe('getLocale / setLocale', () => {
    it('starts at en and updates on setLocale', () => {
      expect(getLocale()).toBe('en');
      setLocale('fr');
      expect(getLocale()).toBe('fr');
    });

    it('is a no-op when the locale is unchanged', () => {
      let calls = 0;
      subscribe(() => {
        calls += 1;
      });
      setLocale('en');
      expect(calls).toBe(0);
    });
  });

  describe('subscribe()', () => {
    it('notifies listeners on setLocale changes', () => {
      const seen: string[] = [];
      subscribe((locale) => {
        seen.push(locale);
      });
      setLocale('de');
      setLocale('fr');
      expect(seen).toEqual(['de', 'fr']);
    });

    it('returns an unsubscribe function', () => {
      const seen: string[] = [];
      const unsubscribe = subscribe((locale) => {
        seen.push(locale);
      });
      setLocale('de');
      unsubscribe();
      setLocale('fr');
      expect(seen).toEqual(['de']);
    });
  });
});
