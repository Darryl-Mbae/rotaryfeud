import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useGameState } from './useGameState';
import Landing      from './pages/Landing';
import HostLogin    from './pages/HostLogin';
import AudienceJoin from './pages/AudienceJoin';
import Registration from './pages/Registration';
import Host         from './pages/Host';
import Audience     from './pages/Audience';
import Leaderboard  from './pages/Leaderboard';
import Winner       from './pages/Winner';

const SELF_MANAGED = new Set(['/', '/host-login', '/join', '/registration']);

function ProtectedHost({ state, dispatch }) {
  const token = sessionStorage.getItem('hostToken');
  if (!token) return <Navigate to="/host-login" replace />;
  return <Host state={state} dispatch={dispatch} />;
}

export default function App() {
  const { state, dispatch, socketError } = useGameState();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state) return;
    const p = window.location.pathname;
    if (SELF_MANAGED.has(p)) return;

    const isHost = p === '/host';

    if (state.phase === 'registration' && !isHost && p !== '/registration') {
      if (sessionStorage.getItem('audienceJoined')) navigate('/audience');
    } else if (state.phase === 'game' && !isHost && p !== '/audience') {
      navigate('/audience');
    } else if (state.phase === 'leaderboard' && !isHost && p !== '/leaderboard') {
      navigate('/leaderboard');
    } else if (state.phase === 'winner' && p !== '/winner') {
      navigate('/winner');
    }
  }, [state?.phase]);

  // state is null when no room is joined yet — still render routes so landing/login pages work
  const hasRoom = !!sessionStorage.getItem('roomCode');

  if (!state && hasRoom) {
    return (
      <div className="loading">
        <div className="loadingSpinner" />
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/"             element={<Landing />} />
      <Route path="/host-login"   element={<HostLogin />} />
      <Route path="/join"         element={<AudienceJoin />} />
      <Route path="/registration" element={<Registration state={state} dispatch={dispatch} />} />
      <Route path="/host"         element={<ProtectedHost state={state} dispatch={dispatch} />} />
      <Route path="/audience"     element={<Audience     state={state} dispatch={dispatch} />} />
      <Route path="/leaderboard"  element={<Leaderboard  state={state} dispatch={dispatch} />} />
      <Route path="/winner"       element={<Winner       state={state} dispatch={dispatch} />} />
    </Routes>
  );
}
