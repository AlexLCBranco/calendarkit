// Where the app is served, as a path on the test site (the build's base).
export const APP = '/calendar/';

/**
 * The shared layout (NAV_PATTERN.md): the page rows (and the page's top padding) scroll away under the pinned header.
 * A view "fits the window" when, scrolled to its end, nothing is below the window and nothing is hidden under the
 * header — so the page may scroll by up to this many px (the space above the view's content less the header's).
 */
export const scrollAway = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const rows = document.querySelector('[data-testid="page-rows"]')!;
    const h = document.querySelector('[data-testid="top-bar"]')!;
    const contentTop = rows.getBoundingClientRect().bottom + window.scrollY + parseFloat(getComputedStyle(rows).marginBottom);
    return Math.ceil(contentTop - h.getBoundingClientRect().height - parseFloat(getComputedStyle(h).marginBottom));
  });
