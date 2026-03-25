import { useState } from 'react';
import { HistoryList } from './components/HistoryList';
import './App.css';

type Tab = 'history' | 'devices' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('history');

  return (
    <div className="popup">
      <header className="popup__header">
        <h1 className="popup__title">YouTube History</h1>
      </header>

      <nav className="popup__tabs">
        <button
          className={`popup__tab ${activeTab === 'history' ? 'popup__tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
          type="button"
        >
          History
        </button>
        <button
          className={`popup__tab ${activeTab === 'devices' ? 'popup__tab--active' : ''}`}
          onClick={() => setActiveTab('devices')}
          type="button"
        >
          Devices
        </button>
        <button
          className={`popup__tab ${activeTab === 'settings' ? 'popup__tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
          type="button"
        >
          Settings
        </button>
      </nav>

      <main className="popup__content">
        {activeTab === 'history' && <HistoryList />}
        {activeTab === 'devices' && (
          <div className="popup__placeholder">
            <span>Devices — coming soon</span>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="popup__placeholder">
            <span>Settings — coming soon</span>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
