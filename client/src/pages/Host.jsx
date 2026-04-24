import React from 'react';
import { Navigate } from 'react-router-dom';
import GameBoard from '../components/GameBoard';

export default function Host({ state, dispatch }) {
  if (!state) return null;
  // Only redirect away for leaderboard/winner — registration is handled by Registration page
  if (state.phase === 'leaderboard') return <Navigate to="/leaderboard" replace />;
  if (state.phase === 'winner')      return <Navigate to="/winner"      replace />;

  return <GameBoard state={state} dispatch={dispatch} isHost={true} />;
}
