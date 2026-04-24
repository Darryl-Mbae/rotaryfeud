import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import '../styles/registration.css';

export default function Registration({ state, dispatch }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState(Array(6).fill(''));
  const [starting, setStarting] = useState(false);

  const token = sessionStorage.getItem('hostToken');
  const roomCode = sessionStorage.getItem('roomCode');

  if (!token) return <Navigate to="/" replace />;

  // When phase changes to 'game', navigate to host board
  useEffect(() => {
    if (state?.phase === 'game') {
      navigate('/host');
    }
  }, [state?.phase]);

  function handleStart() {
    setStarting(true);
    dispatch({ type: 'START_TOURNAMENT', teams });
    // navigate happens via the useEffect above once server confirms phase change
  }

  return (
    <div className="coverpage">
      <div className="setupPage">
        <div className="setupContainer">
          <h1>ROTARY FEUD</h1>
          <div className="subtitle">Tournament Setup</div>

          {roomCode && (
            <div className="roomCodeBanner">
              <span className="roomCodeLabel">ROOM CODE</span>
              <span className="roomCodeValue">{roomCode}</span>
              <span className="roomCodeHint">Share this with your audience</span>
            </div>
          )}

          <div className="teamsGrid">
            {teams.map((name, i) => (
              <div className="teamInput" key={i}>
                <label>Team {i + 1} Name:</label>
                <input
                  type="text"
                  placeholder="Enter team name"
                  value={name}
                  onChange={e => {
                    const next = [...teams];
                    next[i] = e.target.value;
                    setTeams(next);
                  }}
                />
              </div>
            ))}
          </div>

          <button
            className="startTournamentBtn"
            onClick={handleStart}
            disabled={starting}
            style={{ opacity: starting ? 0.7 : 1 }}
          >
            {starting ? 'Starting...' : 'START TOURNAMENT'}
          </button>
        </div>
      </div>
    </div>
  );
}
