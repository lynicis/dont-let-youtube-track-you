import { buildPageVisit } from '@/lib/tracker/youtube-tracker';
import type { PageVisit } from '@/lib/tracker/types';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],

  main(ctx) {
    let currentVisit: PageVisit | null = null;
    let entryTimestamp: number | null = null;
    let lastNavigatedUrl: string | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const DEBOUNCE_MS = 500;

    /**
     * Send the duration update for the current visit before navigating away.
     */
    function finalizePreviousVisit(): void {
      if (currentVisit && entryTimestamp !== null) {
        const durationSeconds = Math.round((Date.now() - entryTimestamp) / 1000);
        browser.runtime.sendMessage({
          type: 'update-duration',
          data: {
            url: currentVisit.url,
            durationSeconds,
          },
        });
      }
    }

    /**
     * Handle a navigation event: detect page type, extract metadata, and
     * notify the background script of the new page visit.
     */
    function handleNavigation(): void {
      const url = location.href;

      // Debounce: YouTube can fire multiple events for a single navigation.
      // If the same URL fires within DEBOUNCE_MS, ignore the duplicate.
      if (url === lastNavigatedUrl) {
        if (debounceTimer !== null) {
          // Still within the debounce window for this URL — skip.
          return;
        }
      }

      // Clear any previous debounce timer
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      lastNavigatedUrl = url;

      // Set debounce window — during this period, duplicate events for the
      // same URL are silently ignored.
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
      }, DEBOUNCE_MS);

      // Finalize the previous visit's duration before recording the new one
      finalizePreviousVisit();

      // Build and record the new visit
      const visit = buildPageVisit(url);
      currentVisit = visit;
      entryTimestamp = visit.visitedAt;

      browser.runtime.sendMessage({
        type: 'page-visit',
        data: visit,
      });
    }

    // --- Event listeners (using ctx for automatic cleanup) ---

    // YouTube SPA navigation event
    ctx.addEventListener(document, 'yt-navigate-finish', () => {
      handleNavigation();
    });

    // Browser back/forward
    ctx.addEventListener(window, 'popstate', () => {
      handleNavigation();
    });

    // Send duration update when user closes the tab or navigates away entirely
    ctx.addEventListener(window, 'beforeunload', () => {
      finalizePreviousVisit();
    });

    // Initial page load
    handleNavigation();
  },
});
