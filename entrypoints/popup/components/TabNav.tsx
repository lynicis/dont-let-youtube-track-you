import { useEffect, useState } from 'react';

type Tab = 'history' | 'devices' | 'settings';

interface TabNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const [isPaired, setIsPaired] = useState(false);

  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'get-sync-status' })
      .then((res) => {
        if (res?.ok && res.data) {
          setIsPaired(res.data.isPaired);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <nav className="popup__tabs">
      <button
        className={`popup__tab ${activeTab === 'history' ? 'popup__tab--active' : ''}`}
        onClick={() => onTabChange('history')}
        type="button"
      >
        History
      </button>
      <button
        className={`popup__tab ${activeTab === 'devices' ? 'popup__tab--active' : ''}`}
        onClick={() => onTabChange('devices')}
        type="button"
      >
        Devices
        <span
          className={`tab-dot ${isPaired ? 'tab-dot--paired' : 'tab-dot--unpaired'}`}
        />
      </button>
      <button
        className={`popup__tab ${activeTab === 'settings' ? 'popup__tab--active' : ''}`}
        onClick={() => onTabChange('settings')}
        type="button"
      >
        Settings
      </button>
    </nav>
  );
}
