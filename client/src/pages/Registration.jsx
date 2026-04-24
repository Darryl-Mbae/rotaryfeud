import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/registration.css';

export default function Registration({ state, dispatch }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState(Array(6).fill(''));

  function handleStart() {
    dispatch({ type: 'START_TOURNAMENT', teams });
    navigate('/host');
  }

  return (
    <div className="coverpage">
      <div className="setupPage">
        <div className="setupContainer">
          <h1>🎯 ROTARY FEUD</h1>
          <div className="subtitle">Tournament Mode — 6 Teams</div>
          <div className="teamsGrid">
            {teams.map((name, i) => (
              <div className="teamInput" key={i}>
                <label>Team {i + 1} Name:</label>
                <input
                  type="text"
                  placeholder={`Enter team name`}
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
          <button className="startTournamentBtn" onClick={handleStart}>
            START TOURNAMENT
          </button>
        </div>
      </div>
    </div>
  );
}
