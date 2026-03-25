import type { PageType, PageVisit } from './types';

/**
 * Detect the YouTube page type from a URL.
 */
export function detectPageType(url: string): PageType {
  const parsed = new URL(url);
  const pathname = parsed.pathname;

  if (pathname === '/watch' && parsed.searchParams.has('v')) {
    return 'video';
  }
  if (pathname === '/results' && parsed.searchParams.has('search_query')) {
    return 'search';
  }
  if (pathname.startsWith('/shorts/')) {
    return 'shorts';
  }
  if (
    pathname.startsWith('/@') ||
    pathname.startsWith('/channel/') ||
    pathname.startsWith('/c/')
  ) {
    return 'channel';
  }
  if (pathname === '/playlist' && parsed.searchParams.has('list')) {
    return 'playlist';
  }
  if (pathname === '/') {
    return 'home';
  }
  return 'other';
}

/**
 * Extract the video ID (`v` param) from a YouTube URL.
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

/**
 * Extract the search query (`search_query` param) from a YouTube URL.
 */
export function extractSearchQuery(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('search_query');
  } catch {
    return null;
  }
}

/**
 * Extract channel name and ID from the current DOM.
 *
 * YouTube renders channel info in various elements depending on context.
 * We try multiple selectors to cover video pages, channel pages, etc.
 */
export function extractChannelInfo(): {
  name: string | null;
  id: string | null;
} {
  // On video pages, the channel link lives in the owner section
  const channelLink =
    document.querySelector<HTMLAnchorElement>(
      '#owner #channel-name a, #upload-info #channel-name a',
    ) ??
    document.querySelector<HTMLAnchorElement>(
      'ytd-channel-name a, #channel-name a',
    );

  const name = channelLink?.textContent?.trim() ?? null;

  // Channel ID can be extracted from the channel link href
  let id: string | null = null;
  const href = channelLink?.getAttribute('href');
  if (href) {
    const match = href.match(/\/channel\/(UC[\w-]+)/);
    if (match) {
      id = match[1];
    }
  }

  // Fallback: try the canonical link on channel pages
  if (!id) {
    const canonicalLink = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const canonical = canonicalLink?.href;
    if (canonical) {
      const match = canonical.match(/\/channel\/(UC[\w-]+)/);
      if (match) {
        id = match[1];
      }
    }
  }

  return { name, id };
}

/**
 * Extract the page title, stripping the " - YouTube" suffix.
 */
export function extractTitle(): string {
  return document.title.replace(/\s*-\s*YouTube\s*$/, '');
}

/**
 * Build a thumbnail URL for a given video ID.
 */
export function constructThumbnailUrl(videoId: string | null): string | null {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Build a full PageVisit snapshot from the current page state.
 */
export function buildPageVisit(url: string): PageVisit {
  const pageType = detectPageType(url);
  const videoId = extractVideoId(url);
  const channelInfo = extractChannelInfo();

  return {
    url,
    pageType,
    title: extractTitle(),
    videoId,
    channelName: channelInfo.name,
    channelId: channelInfo.id,
    searchQuery: extractSearchQuery(url),
    thumbnailUrl: constructThumbnailUrl(videoId),
    visitedAt: Date.now(),
    durationSeconds: null,
  };
}
