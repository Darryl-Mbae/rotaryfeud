import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import '../styles/tournament.css';

export default function Winner({ state, dispatch }) {
  const navigate = useNavigate();
  if (!state) return null;
  if (state.phase !== 'winner') return <Navigate to={`/${state.phase === 'game' ? 'audience' : state.phase}`} replace />;

  const sorted = [...state.tournament.teams].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  function restart() {
    dispatch({ type: 'RESTART' });
    navigate('/registration');
  }

  return (
    <div className="winnerPage">
      <div className="winnerContainer">
        <h1>🎉 TOURNAMENT WINNER! 🎉</h1>
        <div className="winnerName">{winner?.name}</div>
        <div className="finalScore">Final Score: {winner?.score}</div>
        <button className="restartBtn" onClick={restart}>
          Start New Tournament
        </button>
      </div>
    </div>
  );
}
