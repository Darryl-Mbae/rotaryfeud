import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from './socket';

export function useGameState() {
  const [state, setState] = useState(null);
  const [socketError, setSocketError] = useState(null);
  const [isHostAuthed, setIsHostAuthed] = useState(false);
  const pendingAction = useRef(null);

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(setState)
      .catch(err => console.error('Failed to fetch initial state:', err));

    socket.on('stateSync', setState);
    socket.on('error', ({ message }) => {
      setSocketError(message);
      console.error('Server error:', message);
    });

    function tryHostAuth() {
      const token = sessionStorage.getItem('hostToken');
      if (token) socket.emit('hostAuth', { token });
    }

    socket.on('hostAuthResult', ({ success }) => {
      setIsHostAuthed(success);
      if (!success) sessionStorage.removeItem('hostToken');

      // Fire any action that was waiting for auth
      if (success && pendingAction.current) {
        socket.emit('action', pendingAction.current);
        pendingAction.current = null;
      }
    });

    // Auth on connect and reconnect
    socket.on('connect', tryHostAuth);
    tryHostAuth();

    return () => {
      socket.off('stateSync', setState);
      socket.off('error');
      socket.off('hostAuthResult');
      socket.off('connect', tryHostAuth);
    };
  }, []);

  const dispatch = useCallback((action) => {
    setSocketError(null);
    const token = sessionStorage.getItem('hostToken');

    if (token && !isHostAuthed) {
      // Auth not confirmed yet — queue the action and re-auth
      pendingAction.current = action;
      socket.emit('hostAuth', { token });
    } else {
      socket.emit('action', action);
    }
  }, [isHostAuthed]);

  return { state, dispatch, socketError, isHostAuthed };
}
