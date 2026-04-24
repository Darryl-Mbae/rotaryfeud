import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from './socket';

export function useGameState() {
  const [state, setState] = useState(null);
  const [socketError, setSocketError] = useState(null);
  const [isHostAuthed, setIsHostAuthed] = useState(false);
  const pendingAction = useRef(null);
  const joinedRoom = useRef(false);

  useEffect(() => {
    const roomCode = sessionStorage.getItem('roomCode');
    const token    = sessionStorage.getItem('hostToken');

    if (!roomCode) {
      // No room yet — just set empty state so app can render landing
      setState(null);
      return;
    }

    function joinRoom() {
      if (joinedRoom.current) return;
      joinedRoom.current = true;
      socket.emit('joinRoom', { roomCode, token: token || undefined });
    }

    // Fetch initial state for page refresh
    fetch(`/api/state?room=${roomCode}`)
      .then(r => r.json())
      .then(setState)
      .catch(err => console.error('Failed to fetch state:', err));

    socket.on('stateSync', setState);
    socket.on('roomError', ({ message }) => {
      console.error('Room error:', message);
      setSocketError(message);
    });
    socket.on('error', ({ message }) => {
      setSocketError(message);
      console.error('Server error:', message);
    });
    socket.on('hostAuthResult', ({ success }) => {
      setIsHostAuthed(success);
      if (!success) sessionStorage.removeItem('hostToken');
      if (success && pendingAction.current) {
        socket.emit('action', pendingAction.current);
        pendingAction.current = null;
      }
    });

    socket.on('connect', joinRoom);
    joinRoom();

    return () => {
      socket.off('stateSync', setState);
      socket.off('roomError');
      socket.off('error');
      socket.off('hostAuthResult');
      socket.off('connect', joinRoom);
      joinedRoom.current = false;
    };
  }, []);

  const dispatch = useCallback((action) => {
    setSocketError(null);
    const token = sessionStorage.getItem('hostToken');
    if (token && !isHostAuthed) {
      pendingAction.current = action;
      const roomCode = sessionStorage.getItem('roomCode');
      socket.emit('joinRoom', { roomCode, token });
    } else {
      socket.emit('action', action);
    }
  }, [isHostAuthed]);

  return { state, dispatch, socketError, isHostAuthed };
}
