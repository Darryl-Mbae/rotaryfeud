import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import { Mosaic } from '../components/Mosaic';

function RightPanel() {
  return <div className="landingRight"><Mosaic /></div>;
}

export default function HostLogin() {
  const navigate = useNavigate();
  // mode: 'choose' | 'generate' | 'login'
  const [mode, setMode] = useState('choose');
  const [pin, setPin] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState(null); // { pin, roomCode }

  // ── Generate a new PIN + room ─────────────────────────────────────────────
  async function handleGenerate() {
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-pin', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setGeneratedData(data); // { pin, roomCode }
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  }

  // ── Login with existing PIN + room code ───────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, roomCode: roomCode.toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      sessionStorage.setItem('hostToken', data.token);
      sessionStorage.setItem('roomCode', data.roomCode);
      navigate('/registration');
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  }

  // ── After generating — show PIN + room code once ──────────────────────────
  if (generatedData) {
    return (
      <div className="landingPage">
        <div className="landingLeft">
          <div className="landingCard">
            <h1 className="landingTitle">Your host credentials</h1>
            <p className="landingSubtitle">Save both — they will not be shown again</p>

            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Room Code</p>
              <div className="pinDisplay">{generatedData.roomCode}</div>
              <p style={{ fontSize: '0.75rem', color: '#aaa', margin: '4px 0 16px' }}>Share this with your audience</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Host PIN</p>
              <div className="pinDisplay">{generatedData.pin}</div>
              <p style={{ fontSize: '0.75rem', color: '#aaa', margin: '4px 0 0' }}>Keep this private — use it to log back in</p>
            </div>

            <button className="landingBtn hostBtn" onClick={async () => {
              // Auto-login with the generated credentials
              setLoading(true);
              try {
                const res = await fetch('/api/auth/host', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pin: generatedData.pin, roomCode: generatedData.roomCode })
                });
                const data = await res.json();
                if (res.ok) {
                  sessionStorage.setItem('hostToken', data.token);
                  sessionStorage.setItem('roomCode', data.roomCode);
                  navigate('/registration');
                }
              } finally { setLoading(false); }
            }} disabled={loading}>
              <span className="btnLabel">{loading ? 'Logging in...' : 'Got it — Start setup'}</span>
            </button>
          </div>
        </div>
        <RightPanel />
      </div>
    );
  }

  // ── Choose mode ───────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="landingPage">
        <div className="landingLeft">
          <div className="landingCard">
            <button className="backLink" onClick={() => navigate('/')}>&larr; Back to home</button>
            <h1 className="landingTitle">Host access</h1>
            <p className="landingSubtitle">First time or returning host?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button className="landingBtn hostBtn" onClick={handleGenerate} disabled={loading}>
                <span className="btnLabel">{loading ? 'Creating...' : 'Create a new room'}</span>
                <span className="btnHint">Get a fresh PIN and room code</span>
              </button>
              <button className="landingBtn audienceBtn" onClick={() => { setMode('login'); setError(''); }}>
                <span className="btnLabel">I already have a PIN</span>
                <span className="btnHint">Log back into your room</span>
              </button>
            </div>
            {error && <p className="formError" style={{ marginTop: 12 }}>{error}</p>}
          </div>
        </div>
        <RightPanel />
      </div>
    );
  }

  // ── Login with existing credentials ──────────────────────────────────────
  return (
    <div className="landingPage">
      <div className="landingLeft">
        <div className="landingCard">
          <button className="backLink" onClick={() => { setMode('choose'); setError(''); }}>&larr; Back</button>
          <h1 className="landingTitle">Host login</h1>
          <p className="landingSubtitle">Enter your room code and PIN</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Room Code</p>
              <input className="codeInput" type="text" placeholder="ABC123"
                value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6} autoFocus autoComplete="off" />
            </div>
            <div>
              <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Host PIN</p>
              <input className="codeInput" type="password" placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;"
                value={pin} onChange={e => setPin(e.target.value.toUpperCase())}
                maxLength={6} autoComplete="off" />
            </div>
            {error && <p className="formError">{error}</p>}
            <button className="landingBtn hostBtn" type="submit"
              disabled={loading || pin.length < 4 || roomCode.length < 4} style={{ marginTop: 4 }}>
              <span className="btnLabel">{loading ? 'Verifying...' : 'Continue'}</span>
            </button>
          </form>
        </div>
      </div>
      <RightPanel />
    </div>
  );
}
