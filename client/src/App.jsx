import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useGameState } from './useGameState';
import Registration from './pages/Registration';
import Host        from './pages/Host';
import Audience    from './pages/Audience';
import Leaderboard from './pages/Leaderboard';
import Winner      from './pages/Winner';

// Phase → canonical route mapping
const PHASE_ROUTES = {
  registration: '/registration',
  game:         null, // host/audience decide themselves
  leaderboard:  '/leaderboard',
  winner:       '/winner'
};

export default function App() {
  const { state, dispatch } = useGameState();
  const navigate = useNavigate();

  // Auto-redirect audience/non-host pages when phase changes
  useEffect(() => {
    if (!state) return;
    const path = window.location.pathname;
    const isHost = path === '/host';

    if (state.phase === 'registration' && path !== '/registration') {
      navigate('/registration');
    } else if (state.phase === 'game' && !isHost && path !== '/audience') {
      navigate('/audience');
    } else if (state.phase === 'leaderboard' && path !== '/leaderboard' && !isHost) {
      navigate('/leaderboard');
    } else if (state.phase === 'winner' && path !== '/winner') {
      navigate('/winner');
    }
  }, [state?.phase]);

  if (!state) {
    return (
      <div className="loading">
        <div className="loadingSpinner" />
        <p>Connecting…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/"             element={<Navigate to="/registration" replace />} />
      <Route path="/registration" element={<Registration state={state} dispatch={dispatch} />} />
      <Route path="/host"         element={<Host         state={state} dispatch={dispatch} />} />
      <Route path="/audience"     element={<Audience     state={state} dispatch={dispatch} />} />
      <Route path="/leaderboard"  element={<Leaderboard  state={state} dispatch={dispatch} />} />
      <Route path="/winner"       element={<Winner       state={state} dispatch={dispatch} />} />
    </Routes>
  );
}
