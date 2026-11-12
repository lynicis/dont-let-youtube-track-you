import { describe, expect, test } from 'bun:test';
import {
  detectPageType,
  extractVideoId,
  extractSearchQuery,
} from '../lib/tracker/youtube-tracker';
import type { PageType } from '../lib/tracker/types';

describe('detectPageType', () => {
  const cases: Array<[string, PageType]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video'],
    ['https://www.youtube.com/results?search_query=cats', 'search'],
    ['https://www.youtube.com/shorts/abc123', 'shorts'],
    ['https://www.youtube.com/@somechannel', 'channel'],
    ['https://www.youtube.com/channel/UCabc123', 'channel'],
    ['https://www.youtube.com/c/somechannel', 'channel'],
    ['https://www.youtube.com/playlist?list=PL123', 'playlist'],
    ['https://www.youtube.com/', 'home'],
    ['https://www.youtube.com/feed/subscriptions', 'other'],
  ];

  for (const [url, expected] of cases) {
    test(`${url} → ${expected}`, () => {
      expect(detectPageType(url)).toBe(expected);
    });
  }
});

describe('extractVideoId', () => {
  test('reads the v param', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
  });

  test('returns null without a v param', () => {
    expect(extractVideoId('https://www.youtube.com/')).toBeNull();
  });

  test('returns null for an invalid URL', () => {
    expect(extractVideoId('not a url')).toBeNull();
  });
});

describe('extractSearchQuery', () => {
  test('reads the search_query param', () => {
    expect(
      extractSearchQuery('https://www.youtube.com/results?search_query=hello+world'),
    ).toBe('hello world');
  });

  test('returns null without a search_query param', () => {
    expect(extractSearchQuery('https://www.youtube.com/')).toBeNull();
  });
});
