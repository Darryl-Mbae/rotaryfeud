import React from 'react';
import { Navigate } from 'react-router-dom';
import GameBoard from '../components/GameBoard';

export default function Host({ state, dispatch }) {
  if (!state) return null;
  if (state.phase === 'registration') return <Navigate to="/registration" replace />;
  if (state.phase === 'leaderboard')  return <Navigate to="/leaderboard"  replace />;
  if (state.phase === 'winner')       return <Navigate to="/winner"        replace />;

  return <GameBoard state={state} dispatch={dispatch} isHost={true} />;
}
