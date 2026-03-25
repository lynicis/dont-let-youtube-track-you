import { useState, useEffect, useRef } from 'react';
import { browser } from 'wxt/browser';

/** Retention period options. 0 means "forever". */
const RETENTION_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '365 days', value: 365 },
  { label: 'Forever', value: 0 },
] as const;

/** Send a typed message to the background script and return the response. */
async function sendMessage<T = unknown>(
  type: string,
  data?: unknown,
): Promise<T> {
  const res = await browser.runtime.sendMessage({ type, data });
  if (!res?.ok) throw new Error(res?.error ?? 'Unknown error');
  return res.data as T;
}

/** Trigger a file download in the popup context. */
function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const [retention, setRetention] = useState<number>(90);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current retention setting on mount
  useEffect(() => {
    sendMessage<number>('get-retention')
      .then((days) => setRetention(days))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleRetentionChange = async (days: number) => {
    setRetention(days);
    setError(null);
    try {
      await sendMessage('set-retention', { days });
    } catch (err) {
      setError(`Failed to save retention setting: ${err}`);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(format);
    setError(null);
    try {
      const data = await sendMessage<string>(
        format === 'json' ? 'export-json' : 'export-csv',
      );
      const mime =
        format === 'json' ? 'application/json' : 'text/csv';
      const ext = format;
      downloadFile(data, `youtube-history-${Date.now()}.${ext}`, mime);
    } catch (err) {
      setError(`Export failed: ${err}`);
    } finally {
      setExporting(null);
    }
  };

  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setError(null);

    try {
      const text = await file.text();
      const result = await sendMessage<{ imported: number; skipped: number }>(
        'import-json',
        { json: text },
      );
      setImportResult(
        `Imported ${result.imported} entries, ${result.skipped} skipped`,
      );
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(`Import failed: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  const handleClearAll = async () => {
    setError(null);
    try {
      await sendMessage('clear-history');
      setConfirmClear(false);
      setImportResult('All history cleared');
    } catch (err) {
      setError(`Clear failed: ${err}`);
    }
  };

  if (loading) {
    return (
      <div className="settings">
        <div className="settings__loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings">
      {error && <div className="settings__msg settings__msg--error">{error}</div>}

      {/* ── Retention Period ──────────────────────────── */}
      <section className="settings__section">
        <label className="settings__label">Retention Period</label>
        <p className="settings__hint">
          Automatically delete entries older than this.
        </p>
        <select
          className="settings__select"
          value={retention}
          onChange={(e) => handleRetentionChange(Number(e.target.value))}
        >
          {RETENTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {/* ── Export Data ──────────────────────────────── */}
      <section className="settings__section">
        <label className="settings__label">Export Data</label>
        <p className="settings__hint">Download your browsing history.</p>
        <div className="settings__btn-row">
          <button
            className="settings__btn"
            disabled={exporting !== null}
            onClick={() => handleExport('json')}
          >
            {exporting === 'json' ? 'Exporting...' : 'Export as JSON'}
          </button>
          <button
            className="settings__btn"
            disabled={exporting !== null}
            onClick={() => handleExport('csv')}
          >
            {exporting === 'csv' ? 'Exporting...' : 'Export as CSV'}
          </button>
        </div>
      </section>

      {/* ── Import Data ─────────────────────────────── */}
      <section className="settings__section">
        <label className="settings__label">Import Data</label>
        <p className="settings__hint">
          Import history from a previously exported JSON file.
        </p>
        <div className="settings__btn-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="settings__file-input"
          />
          <button
            className="settings__btn"
            disabled={importing}
            onClick={handleImport}
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
        {importResult && (
          <div className="settings__msg settings__msg--success">
            {importResult}
          </div>
        )}
      </section>

      {/* ── Danger Zone ─────────────────────────────── */}
      <section className="settings__section settings__section--danger">
        <label className="settings__label settings__label--danger">
          Danger Zone
        </label>
        {!confirmClear ? (
          <button
            className="settings__btn settings__btn--danger"
            onClick={() => setConfirmClear(true)}
          >
            Clear All History
          </button>
        ) : (
          <div className="settings__confirm">
            <p className="settings__hint">
              This will permanently delete all your browsing history. Are you
              sure?
            </p>
            <div className="settings__btn-row">
              <button
                className="settings__btn settings__btn--danger-confirm"
                onClick={handleClearAll}
              >
                Yes, Delete Everything
              </button>
              <button
                className="settings__btn"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
