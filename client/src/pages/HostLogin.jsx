import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import { Mosaic } from '../components/Mosaic';

function RightPanel() {
  return <div className="landingRight"><Mosaic /></div>;
}

export default function HostLogin() {
  const navigate = useNavigate();
  const [pinExists, setPinExists] = useState(null);
  const [mode, setMode] = useState('login');
  const [pin, setPin] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedPin, setGeneratedPin] = useState(null);

  useEffect(() => {
    fetch('/api/auth/pin-status')
      .then(r => r.json())
      .then(d => { setPinExists(d.exists); setMode(d.exists ? 'login' : 'generate'); })
      .catch(() => { setPinExists(false); setMode('generate'); });
  }, []);

  async function handleGenerate(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: setupSecret })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setGeneratedPin(data.pin);
      setPinExists(true);
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      sessionStorage.setItem('hostToken', data.token);
      sessionStorage.setItem('roomCode', data.roomCode);
      navigate('/registration');
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  }

  if (pinExists === null) {
    return (
      <div className="landingPage">
        <div className="landingLeft">
          <div className="loadingSpinner" style={{ margin: '0 auto' }} />
        </div>
        <RightPanel />
      </div>
    );
  }

  // Show generated PIN once
  if (generatedPin) {
    return (
      <div className="landingPage">
        <div className="landingLeft">
          <div className="landingCard">
            <button className="backLink" onClick={() => { setGeneratedPin(null); setMode('login'); }}>
              &larr; Back
            </button>
            <h1 className="landingTitle">Your Host PIN</h1>
            <p className="landingSubtitle">Save this — it will not be shown again</p>
            <div className="pinDisplay">{generatedPin}</div>
            <p style={{ fontSize: '0.78rem', color: '#aaa', marginBottom: 20 }}>
              Write it down. You need it every time you log in as host.
            </p>
            <button className="landingBtn hostBtn"
              onClick={() => { setGeneratedPin(null); setMode('login'); }}>
              <span className="btnLabel">Got it — Log in now</span>
            </button>
          </div>
        </div>
        <RightPanel />
      </div>
    );
  }

  return (
    <div className="landingPage">
      <div className="landingLeft">
        <div className="landingCard">
          <button className="backLink" onClick={() => navigate('/')}>&larr; Back to home</button>
          <h1 className="landingTitle">Host access</h1>
          <p className="landingSubtitle">Sign in to control the game</p>

          <div className="authTabs">
            <button className={`authTab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); }}>
              Enter PIN
            </button>
            <button className={`authTab ${mode === 'generate' ? 'active' : ''}`}
              onClick={() => { setMode('generate'); setError(''); }}>
              Get a PIN
            </button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <input className="codeInput" type="password" placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;"
                value={pin} onChange={e => setPin(e.target.value.toUpperCase())}
                autoFocus maxLength={6} autoComplete="off" />
              {error && <p className="formError">{error}</p>}
              <button className="landingBtn hostBtn" type="submit"
                disabled={loading || pin.length < 4} style={{ marginTop: 14 }}>
                <span className="btnLabel">{loading ? 'Verifying...' : 'Continue'}</span>
              </button>
            </form>
          ) : (
            <div>
              <p style={{ fontSize: '0.83rem', color: '#666', marginBottom: 20 }}>
                Generate a unique 6-character PIN to control the game. Save it — it won't be shown again.
              </p>
              {error && <p className="formError">{error}</p>}
              <button className="landingBtn hostBtn" onClick={handleGenerate} disabled={loading}>
                <span className="btnLabel">{loading ? 'Generating...' : 'Generate My PIN'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <RightPanel />
    </div>
  );
}
