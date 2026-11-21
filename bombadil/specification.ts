import { always } from '@antithesishq/bombadil';
import { actions, extract } from '@antithesishq/bombadil/browser';

export { noUncaughtExceptions, noUnhandledPromiseRejections, noConsoleErrors, defaultActions } from '@antithesishq/bombadil/browser/defaults';

const page = extract(({ document, window }) => {
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  const override = window.localStorage.getItem('theme');
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const themeButton = document.getElementById('theme');
  const foot = document.getElementById('foot');
  const footButton = document.getElementById('foot-btn');
  return {
    width: window.innerWidth,
    scrollWidth: root.scrollWidth,
    theme,
    override,
    dark,
    pressed: themeButton?.getAttribute('aria-pressed') ?? null,
    footOpen: foot?.classList.contains('open') ?? null,
    footExpanded: footButton?.getAttribute('aria-expanded') ?? null,
  };
});

export const noHorizontalOverflow = always(() => page.current.scrollWidth <= page.current.width + 1);
export const themeStateMatchesControls = always(() => {
  const p = page.current;
  return p.pressed === String(p.dark) &&
    (p.override !== 'light' && p.override !== 'dark' || p.theme === p.override);
});
export const buildInfoStateMatchesControl = always(() => {
  const p = page.current;
  return p.footOpen !== null && p.footExpanded === String(p.footOpen);
});

// Exercise the same phone-to-desktop widths used by the acceptance suite in changing order.
export const viewportChanges = actions(() => [
  { SetViewport: { width: 320, height: 568 } },
  { SetViewport: { width: 390, height: 844 } },
  { SetViewport: { width: 1440, height: 900 } },
]);
