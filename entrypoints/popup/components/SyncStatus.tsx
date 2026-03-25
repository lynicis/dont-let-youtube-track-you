import { useEffect, useState, useCallback } from 'react';

interface SyncStatusData {
  isPaired: boolean;
  deviceCount: number;
}

export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    browser.runtime
      .sendMessage({ type: 'get-sync-status' })
      .then((res) => {
        if (res?.ok && res.data) {
          setStatus({
            isPaired: res.data.isPaired,
            deviceCount: res.data.deviceCount,
          });
        }
        setSyncing(false);
      })
      .catch(() => {
        setSyncing(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!status) return null;

  let dotClass = 'sync-dot--gray';
  let label = 'Not paired';

  if (syncing) {
    dotClass = 'sync-dot--yellow';
    label = 'Syncing...';
  } else if (status.isPaired) {
    dotClass = 'sync-dot--green';
    label = `Synced \u00B7 ${status.deviceCount} device${status.deviceCount === 1 ? '' : 's'}`;
  }

  return (
    <div className="sync-status">
      <span className={`sync-dot ${dotClass}`} />
      <span className="sync-status__label">{label}</span>
    </div>
  );
}
