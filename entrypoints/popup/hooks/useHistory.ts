import { useState, useEffect, useCallback, useRef } from 'react';
import type { BrowsingHistoryEntry } from '@/lib/db/types';

export function useHistory() {
  const [entries, setEntries] = useState<BrowsingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Debounce timer ref for search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'get-recent-history',
        data: { limit: 50, offset: 0 },
      });
      if (response?.ok) {
        setEntries(response.data as BrowsingHistoryEntry[]);
      } else {
        setError(response?.error ?? 'Failed to fetch history');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const searchHistory = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'search-history',
        data: { query },
      });
      if (response?.ok) {
        setEntries(response.data as BrowsingHistoryEntry[]);
      } else {
        setError(response?.error ?? 'Search failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // React to filter changes with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (filter.length > 2) {
        searchHistory(filter);
      } else {
        fetchRecent();
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filter, fetchRecent, searchHistory]);

  return {
    entries,
    loading,
    error,
    filter,
    setFilter,
    refresh: fetchRecent,
  };
}
