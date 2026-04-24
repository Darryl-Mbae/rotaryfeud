import { useState, useEffect } from 'react';
import { socket } from './socket';

export function useGameState() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Fetch initial state (handles page refresh)
    fetch('/api/state')
      .then(r => r.json())
      .then(setState)
      .catch(console.error);

    // Live updates from server
    socket.on('stateSync', setState);
    return () => socket.off('stateSync', setState);
  }, []);

  function dispatch(action) {
    socket.emit('action', action);
  }

  return { state, dispatch };
}
