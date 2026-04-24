import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from './socket';

export function useGameState() {
  const [state, setState] = useState(null);
  const [socketError, setSocketError] = useState(null);
  const [roomCode, setRoomCode] = useState(() => sessionStorage.getItem('roomCode'));
  const isHostAuthed = useRef(false);
  const pendingAction = useRef(null);
  const joinedRoom = useRef(false);

  // Listen for roomCode being set from HostLogin (same-tab and cross-tab)
  useEffect(() => {
    function onRoomSet(e) { setRoomCode(e.detail); }
    function onStorage(e) { if (e.key === 'roomCode') setRoomCode(e.newValue); }
    window.addEventListener('roomCodeSet', onRoomSet);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('roomCodeSet', onRoomSet);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setState(null);
      return;
    }

    const token = sessionStorage.getItem('hostToken');
    isHostAuthed.current = false;
    joinedRoom.current = false;

    function joinRoom() {
      if (joinedRoom.current) return;
      joinedRoom.current = true;
      socket.emit('joinRoom', { roomCode, token: token || undefined });
    }

    fetch(`/api/state?room=${roomCode}`)
      .then(r => r.json())
      .then(setState)
      .catch(err => console.error('Failed to fetch state:', err));

    socket.on('stateSync', setState);
    socket.on('roomError', ({ message }) => setSocketError(message));
    socket.on('error', ({ message }) => setSocketError(message));
    socket.on('hostAuthResult', ({ success }) => {
      isHostAuthed.current = success;
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
      isHostAuthed.current = false;
    };
  }, [roomCode]);

  const dispatch = useCallback((action) => {
    setSocketError(null);
    const token = sessionStorage.getItem('hostToken');

    if (token && !isHostAuthed.current) {
      // Auth hasn't completed yet — queue the action and wait for hostAuthResult
      pendingAction.current = action;
      if (!joinedRoom.current) {
        const rc = sessionStorage.getItem('roomCode');
        socket.emit('joinRoom', { roomCode: rc, token });
      }
    } else {
      socket.emit('action', action);
    }
  }, []);

  return { state, dispatch, socketError };
}
