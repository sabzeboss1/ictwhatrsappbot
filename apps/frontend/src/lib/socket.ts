import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    socketInstance = io(socketUrl, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('✓ Socket.IO connecté au backend');
    });

    socketInstance.on('disconnect', () => {
      console.log('✗ Socket.IO déconnecté');
    });
  }

  return socketInstance;
}
