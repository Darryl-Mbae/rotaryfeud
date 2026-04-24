import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import '../styles/tournament.css';

export default function Leaderboard({ state, dispatch }) {
  const navigate = useNavigate();
  if (!state) return null;
  if (state.phase !== 'leaderboard') return <Navigate to={`/${state.phase === 'game' ? 'audience' : state.phase}`} replace />;

  const sorted = [...state.tournament.teams].sort((a, b) => b.score - a.score);
  const isHost = window.location.pathname === '/leaderboard' &&
    document.referrer.includes('/host');

  function proceed() {
    dispatch({ type: 'PROCEED_TO_SEMIFINAL' });
    navigate('/host');
  }

  return (
    <div className="leaderboardPage">
      <div className="leaderboardContainer">
        <h1>🏆 Round 1 Complete!</h1>
        <div className="roundTitle">Leaderboard</div>
        <table className="leaderboardTable">
          <thead>
            <tr><th>Rank</th><th>Team</th><th>Score</th></tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => (
              <tr key={team.id}>
                <td className="rank">#{i + 1}</td>
                <td className="teamName">{team.name}</td>
                <td className="score">{team.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="proceedBtn" onClick={proceed}>
          Proceed to Semi-Final
        </button>
      </div>
    </div>
  );
}
