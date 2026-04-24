import React from 'react';
import { Navigate } from 'react-router-dom';
import GameBoard from '../components/GameBoard';
import '../styles/board.css';

export default function Audience({ state, dispatch }) {
  // Must have joined via room code
  const joined = sessionStorage.getItem('audienceJoined');
  if (!joined) return <Navigate to="/join" replace />;

  if (!state) return null;
  if (state.phase === 'registration') {
    // Game hasn't started yet — show a waiting screen
    return (
      <div className="loading">
        <div className="loadingSpinner" />
        <p>Waiting for the host to start the game…</p>
      </div>
    );
  }
  if (state.phase === 'leaderboard') return <Navigate to="/leaderboard" replace />;
  if (state.phase === 'winner')      return <Navigate to="/winner"      replace />;

  return <GameBoard state={state} dispatch={dispatch} isHost={false} />;
}
