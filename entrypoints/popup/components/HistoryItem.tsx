import type { BrowsingHistoryEntry } from '@/lib/db/types';

const PAGE_TYPE_ICONS: Record<string, string> = {
  video: '\u25B6',      // play
  search: '\uD83D\uDD0D', // magnifier
  shorts: '\uD83C\uDFAC', // film
  channel: '\uD83D\uDC64', // person
  playlist: '\uD83D\uDCCB', // list
  home: '\uD83C\uDFE0',   // house
  other: '\uD83C\uDF10',  // globe
};

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

interface HistoryItemProps {
  entry: BrowsingHistoryEntry;
}

export function HistoryItem({ entry }: HistoryItemProps) {
  const icon = PAGE_TYPE_ICONS[entry.page_type] ?? PAGE_TYPE_ICONS.other;
  const title = entry.title ? truncate(entry.title, 50) : truncate(entry.url, 50);
  const showThumbnail =
    (entry.page_type === 'video' || entry.page_type === 'shorts') &&
    entry.thumbnail_url;

  const handleClick = () => {
    browser.tabs.create({ url: entry.url });
  };

  return (
    <button
      className="history-item"
      onClick={handleClick}
      type="button"
      title={entry.url}
    >
      {showThumbnail ? (
        <img
          className="history-item__thumb"
          src={entry.thumbnail_url!}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="history-item__icon">{icon}</span>
      )}

      <div className="history-item__content">
        <span className="history-item__title">{title}</span>
        {entry.channel_name && (
          <span className="history-item__channel">{entry.channel_name}</span>
        )}
      </div>

      <span className="history-item__time">
        {formatTimeAgo(entry.visited_at)}
      </span>
    </button>
  );
}
