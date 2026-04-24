import React from 'react';
import { Navigate } from 'react-router-dom';
import GameBoard from '../components/GameBoard';
import '../styles/board.css';

export default function Audience({ state, dispatch }) {
  if (!state) return null;
  if (state.phase === 'registration') return <Navigate to="/registration" replace />;
  if (state.phase === 'leaderboard')  return <Navigate to="/leaderboard"  replace />;
  if (state.phase === 'winner')       return <Navigate to="/winner"        replace />;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <GameBoard state={state} dispatch={dispatch} isHost={false} />
      <button
        className="beHostBtn"
        onClick={() => window.open('/host', '_blank')}
      >
        🎙 Be the Host
      </button>
    </div>
  );
}
