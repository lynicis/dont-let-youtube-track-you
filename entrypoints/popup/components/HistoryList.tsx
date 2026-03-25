import type { BrowsingHistoryEntry } from '@/lib/db/types';
import { HistoryItem } from './HistoryItem';
import { useHistory } from '../hooks/useHistory';

interface TimeGroup {
  label: string;
  entries: BrowsingHistoryEntry[];
}

function groupByTime(entries: BrowsingHistoryEntry[]): TimeGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const groups: Record<string, BrowsingHistoryEntry[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  for (const entry of entries) {
    const t = entry.visited_at;
    if (t >= todayStart) {
      groups.Today.push(entry);
    } else if (t >= yesterdayStart) {
      groups.Yesterday.push(entry);
    } else if (t >= weekStart) {
      groups['This Week'].push(entry);
    } else {
      groups.Older.push(entry);
    }
  }

  // Only return non-empty groups, in order
  return ['Today', 'Yesterday', 'This Week', 'Older']
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, entries: groups[label] }));
}

export function HistoryList() {
  const { entries, loading, error, filter, setFilter } = useHistory();

  const groups = groupByTime(entries);

  return (
    <div className="history-list">
      <div className="history-list__search">
        <span className="history-list__search-icon">{'\uD83D\uDD0D'}</span>
        <input
          className="history-list__search-input"
          type="text"
          placeholder="Search history..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="history-list__scroll">
        {loading && (
          <div className="history-list__loading">
            <div className="history-list__spinner" />
            <span>Loading history...</span>
          </div>
        )}

        {error && (
          <div className="history-list__error">
            <span>Failed to load history</span>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="history-list__empty">
            <span>No history yet</span>
            <span className="history-list__empty-sub">
              Browse YouTube to start tracking
            </span>
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <div key={group.label} className="history-list__group">
              <div className="history-list__group-label">{group.label}</div>
              {group.entries.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
