import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  connect() {
    if (this.socket?.connected) return;

    // In this environment, the server runs on the same port as the client (proxy)
    this.socket = io(window.location.origin);

    this.socket.on("connect", () => {
      console.log("Connected to Real-time Sync Server");
    });

    this.socket.on("db_change", (payload) => {
      console.log("Real-time DB Change:", payload);
      this.notify("db_change", payload);
      this.notify(`table_update_${payload.table}`, payload);
    });

    this.socket.on("attendance_update", (data) => {
       this.notify("attendance_update", data);
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from Real-time Sync Server");
    });
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);

    this.connect();

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private notify(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
