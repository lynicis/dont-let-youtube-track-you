export type PageType =
  | 'video'
  | 'search'
  | 'shorts'
  | 'channel'
  | 'playlist'
  | 'home'
  | 'other';

export interface PageVisit {
  url: string;
  pageType: PageType;
  title: string;
  videoId: string | null;
  channelName: string | null;
  channelId: string | null;
  searchQuery: string | null;
  thumbnailUrl: string | null;
  visitedAt: number; // unix timestamp ms
  durationSeconds: number | null; // filled in when user leaves page
}
