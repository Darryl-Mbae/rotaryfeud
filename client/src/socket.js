import { io } from 'socket.io-client';

// In dev, Vite proxies /socket.io → localhost:3001
// In prod, connect to same origin
const URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

export const socket = io(URL, { autoConnect: true });
