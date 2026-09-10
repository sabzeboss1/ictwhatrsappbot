import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let ioInstance: SocketIOServer | null = null;

export function initSocketIO(server: HttpServer, corsOrigin: string = '*') {
  ioInstance = new SocketIOServer(server, {
    cors: {
      origin: corsOrigin === '*' ? true : corsOrigin,
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connecté: ${socket.id}`);

    socket.on('join:lead', (leadId: string) => {
      socket.join(`lead:${leadId}`);
    });

    socket.on('leave:lead', (leadId: string) => {
      socket.leave(`lead:${leadId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client déconnecté: ${socket.id}`);
    });
  });

  return ioInstance;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function emitLeadUpdated(lead: any) {
  if (ioInstance) {
    ioInstance.emit('lead:updated', lead);
    ioInstance.to(`lead:${lead.id}`).emit('lead:updated', lead);
  }
}

export function emitNewMessage(message: any, lead?: any) {
  if (ioInstance) {
    ioInstance.emit('message:new', { message, lead });
    ioInstance.to(`lead:${message.leadId}`).emit('message:new', { message, lead });
  }
}

export function emitLeadAlert(payload: { leadId: string; reason: string; lead: any }) {
  if (ioInstance) {
    ioInstance.emit('lead:alert', payload);
  }
}
