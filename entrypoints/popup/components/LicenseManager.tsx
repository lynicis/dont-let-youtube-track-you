import { useCallback, useEffect, useState } from 'react';
import type { LicenseState } from '@/lib/licensing/types';
import { FREE_DEVICE_LIMIT } from '@/lib/licensing/types';

export function LicenseManager() {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showActivation, setShowActivation] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const fetchLicense = useCallback(async () => {
    try {
      const res = await browser.runtime.sendMessage({ type: 'get-license-status' });
      if (res?.ok && res.data) {
        setLicense(res.data as LicenseState);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicense();
  }, [fetchLicense]);

  const handleActivate = async () => {
    const trimmed = licenseInput.trim();
    if (!trimmed) {
      setError('Please enter a license key');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'activate-license',
        data: { key: trimmed },
      });
      if (res?.ok) {
        setSuccess('License activated successfully!');
        setLicenseInput('');
        setShowActivation(false);
        await fetchLicense();
      } else {
        setError(res?.error ?? 'Activation failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    setConfirmDeactivate(false);
    try {
      const res = await browser.runtime.sendMessage({ type: 'deactivate-license' });
      if (res?.ok) {
        setSuccess('License deactivated');
        await fetchLicense();
      } else {
        setError(res?.error ?? 'Deactivation failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCheckout = async () => {
    try {
      await browser.runtime.sendMessage({ type: 'open-checkout' });
    } catch (err) {
      setError(String(err));
    }
  };

  if (loading) {
    return (
      <div className="license">
        <div className="license__loading">Loading license info...</div>
      </div>
    );
  }

  const isActive = license?.status === 'active';

  return (
    <div className="license">
      {error && <div className="license__msg license__msg--error">{error}</div>}
      {success && <div className="license__msg license__msg--success">{success}</div>}

      {/* Status badge */}
      <div className="license__status">
        <span className={`license__badge license__badge--${isActive ? 'pro' : 'free'}`}>
          {isActive ? `Pro Sync (${license?.tier})` : 'Free Plan'}
        </span>
      </div>

      {!isActive && (
        <>
          <p className="license__info">
            Free plan includes sync for up to {FREE_DEVICE_LIMIT} devices.
            Upgrade to Pro Sync for unlimited devices.
          </p>

          {/* Pricing & upgrade */}
          <div className="license__plans">
            <div className="license__plan-info">
              <span className="license__plan-price">$5/year</span>
              <span className="license__plan-or">or</span>
              <span className="license__plan-price">$15 lifetime</span>
            </div>
            <button
              className="license__btn license__btn--primary license__btn--upgrade"
              onClick={handleOpenCheckout}
              type="button"
            >
              Upgrade to Pro Sync
            </button>
          </div>

          {/* Activation form */}
          {!showActivation ? (
            <button
              className="license__toggle-activate"
              onClick={() => setShowActivation(true)}
              type="button"
            >
              I already have a license key
            </button>
          ) : (
            <div className="license__activation">
              <label className="license__label">License Key</label>
              <div className="license__input-row">
                <input
                  className="license__input"
                  type="text"
                  placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                />
                <button
                  className="license__btn license__btn--primary"
                  onClick={handleActivate}
                  disabled={actionLoading || !licenseInput.trim()}
                  type="button"
                >
                  {actionLoading ? 'Activating...' : 'Activate'}
                </button>
              </div>
              <button
                className="license__toggle-activate"
                onClick={() => {
                  setShowActivation(false);
                  setLicenseInput('');
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {isActive && (
        <div className="license__active-info">
          <p className="license__info">
            Pro Sync is active. Unlimited device sync enabled.
          </p>
          {license?.expiresAt && (
            <p className="license__expires">
              {license.tier === 'yearly'
                ? `Renews: ${new Date(license.expiresAt).toLocaleDateString()}`
                : 'Lifetime access'}
            </p>
          )}
          <button
            className={`license__btn license__btn--danger ${confirmDeactivate ? 'license__btn--confirm' : ''}`}
            onClick={handleDeactivate}
            disabled={actionLoading}
            type="button"
          >
            {actionLoading
              ? 'Deactivating...'
              : confirmDeactivate
                ? 'Confirm Deactivate'
                : 'Deactivate License'}
          </button>
          {confirmDeactivate && (
            <button
              className="license__btn license__btn--cancel"
              onClick={() => setConfirmDeactivate(false)}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
