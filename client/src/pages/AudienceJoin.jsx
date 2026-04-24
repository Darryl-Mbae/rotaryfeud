import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import { Mosaic } from '../components/Mosaic';

export default function AudienceJoin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not join'); return; }
      sessionStorage.setItem('audienceJoined', '1');
      navigate('/audience');
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="landingPage">
      <div className="landingLeft">
        <div className="landingCard">
          <button className="backLink" onClick={() => navigate('/')}>&larr; Back to home</button>
          <h1 className="landingTitle">Join audience</h1>
          <p className="landingSubtitle">Enter the room code shown by your host</p>

          <form onSubmit={handleJoin}>
            <input className="codeInput" type="text" placeholder="ABC123"
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={6} autoFocus autoComplete="off" spellCheck={false} />
            {error && <p className="formError">{error}</p>}
            <button className="landingBtn hostBtn" type="submit"
              disabled={loading || code.length < 4} style={{ marginTop: 14 }}>
              <span className="btnLabel">{loading ? 'Joining...' : 'Join'}</span>
            </button>
          </form>
        </div>
      </div>
      <div className="landingRight"><Mosaic /></div>
    </div>
  );
}
