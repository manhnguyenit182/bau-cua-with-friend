import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  const socketUrl = import.meta.env.DEV ? 'http://localhost:5000' : '/';
  
  socket = io(socketUrl, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket kết nối thành công');
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Socket lỗi:', err.message);
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
