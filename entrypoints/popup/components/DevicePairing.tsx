import { useCallback, useEffect, useState } from 'react';

interface Device {
  id: string;
  name: string;
  lastSeen: string;
}

interface SyncStatusFull {
  isPaired: boolean;
  groupId: string | null;
  pairingCode: string | null;
  deviceCount: number;
  devices: Device[];
}

export function DevicePairing() {
  const [status, setStatus] = useState<SyncStatusFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await browser.runtime.sendMessage({ type: 'get-sync-status' });
      if (res?.ok && res.data) {
        setStatus(res.data as SyncStatusFull);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCreateGroup = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await browser.runtime.sendMessage({ type: 'create-sync-group' });
      if (res?.ok) {
        setSuccess('Sync group created!');
        await fetchStatus();
      } else {
        setError(res?.error ?? 'Failed to create group');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    const trimmed = joinCode.trim();
    if (trimmed.length < 6) {
      setError('Pairing code must be 6 characters');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'join-sync-group',
        data: { code: trimmed },
      });
      if (res?.ok) {
        setSuccess('Connected successfully!');
        setJoinCode('');
        await fetchStatus();
      } else {
        setError(res?.error ?? 'Invalid code');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    setConfirmLeave(false);
    try {
      const res = await browser.runtime.sendMessage({ type: 'leave-sync-group' });
      if (res?.ok) {
        setSuccess('Left sync group');
        await fetchStatus();
      } else {
        setError(res?.error ?? 'Failed to leave group');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  function formatLastSeen(iso: string): string {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <div className="pairing">
        <div className="pairing__loading">
          <div className="history-list__spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // ── Paired view ──
  if (status?.isPaired) {
    return (
      <div className="pairing">
        {error && <div className="pairing__msg pairing__msg--error">{error}</div>}
        {success && <div className="pairing__msg pairing__msg--success">{success}</div>}

        <div className="pairing__connected">
          <span className="sync-dot sync-dot--green" />
          <span className="pairing__connected-label">Connected</span>
        </div>

        {status.pairingCode && (
          <div className="pairing__code-section">
            <label className="pairing__label">Pairing Code</label>
            <div className="pairing__code-display">
              <code className="pairing__code">{status.pairingCode}</code>
              <button
                className="pairing__copy-btn"
                onClick={() => handleCopyCode(status.pairingCode!)}
                type="button"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="pairing__hint">Share this code with your other devices</p>
          </div>
        )}

        <div className="pairing__devices">
          <label className="pairing__label">
            Devices ({status.deviceCount})
          </label>
          <ul className="pairing__device-list">
            {status.devices.map((device) => (
              <li key={device.id} className="pairing__device">
                <span className="pairing__device-name">{device.name}</span>
                <span className="pairing__device-seen">{formatLastSeen(device.lastSeen)}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          className={`pairing__btn pairing__btn--danger ${confirmLeave ? 'pairing__btn--confirm' : ''}`}
          onClick={handleLeaveGroup}
          disabled={actionLoading}
          type="button"
        >
          {actionLoading
            ? 'Leaving...'
            : confirmLeave
              ? 'Confirm Leave'
              : 'Leave Group'}
        </button>
        {confirmLeave && (
          <button
            className="pairing__btn pairing__btn--cancel"
            onClick={() => setConfirmLeave(false)}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // ── Unpaired view ──
  return (
    <div className="pairing">
      {error && <div className="pairing__msg pairing__msg--error">{error}</div>}
      {success && <div className="pairing__msg pairing__msg--success">{success}</div>}

      <div className="pairing__section">
        <label className="pairing__label">Create a Sync Group</label>
        <p className="pairing__hint">
          Start a new group and share the code with your other devices.
        </p>
        <button
          className="pairing__btn pairing__btn--primary"
          onClick={handleCreateGroup}
          disabled={actionLoading}
          type="button"
        >
          {actionLoading ? 'Creating...' : 'Create Group'}
        </button>
      </div>

      <div className="pairing__divider">
        <span>or</span>
      </div>

      <div className="pairing__section">
        <label className="pairing__label">Join an Existing Group</label>
        <p className="pairing__hint">
          Enter the 6-character code from another device.
        </p>
        <div className="pairing__join-row">
          <input
            className="pairing__input"
            type="text"
            maxLength={6}
            placeholder="ABC123"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            className="pairing__btn pairing__btn--primary"
            onClick={handleJoinGroup}
            disabled={actionLoading || joinCode.trim().length < 6}
            type="button"
          >
            {actionLoading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
