import { useState, useEffect } from 'react';
import { HistoryList } from './components/HistoryList';
import { TabNav } from './components/TabNav';
import { DevicePairing } from './components/DevicePairing';
import { Settings } from './components/Settings';
import { SyncStatus } from './components/SyncStatus';
import './App.css';

type Tab = 'history' | 'devices' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [memoryMode, setMemoryMode] = useState(false);

  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'get-persistence-mode' })
      .then((res) => {
        if (res?.ok && res.data === 'memory') {
          setMemoryMode(true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="popup">
      {memoryMode && (
        <div className="popup__warning">
          Storage unavailable — history will not persist across restarts.
          Private browsing mode or restrictive browser settings may be blocking database access.
        </div>
      )}

      <header className="popup__header">
        <h1 className="popup__title">YouTube History</h1>
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="popup__content">
        {activeTab === 'history' && <HistoryList />}
        {activeTab === 'devices' && <DevicePairing />}
        {activeTab === 'settings' && <Settings />}
      </main>

      <SyncStatus />
    </div>
  );
}

export default App;
