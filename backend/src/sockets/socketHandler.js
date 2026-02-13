import roomService from '../services/roomService.js';
import {
  validate,
  roomIdSchema,
  sceneUpdateSchema,
  incrementalUpdateSchema,
  pointerSchema,
  userJoinSchema
} from '../utils/validation.js';

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.socketRoomMap = new Map(); // Maps socketId - roomId
  }

  handleConnection(socket) {
    console.log(`client connected: ${socket.id}`);

    socket.on('join-room', async (data) => {
      try {
        console.log(`client ${socket.id} attempting to join room: ${data.roomId}`);
        const { roomId } = validate(roomIdSchema, { roomId: data.roomId });
        const userData = validate(userJoinSchema, data.user || {});

        await this.handleLeaveRoom(socket);

        socket.join(roomId);
        this.socketRoomMap.set(socket.id, roomId);

        console.log(`adding user to room ${roomId} in DB..`);
        // Add user to room
        const room = await roomService.addUser(
          roomId,
          socket.id,
          userData.username,
          userData.color
        );
        console.log(`user added. current elements: ${room.elements?.length || 0}`);

        // Sendind current scene to th user
        socket.emit('scene-init', {
          elements: room.elements,
          appState: room.appState,
          files: Object.fromEntries(room.files || new Map()),
          users: room.activeUsers.map(u => ({
            socketId: u.socketId,
            username: u.username,
            color: u.color
          }))
        })

        // Notify others about new user
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          username: userData.username,
          color: userData.color
        });

        console.log(`user ${socket.id} successfully joined room ${roomId}`);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: error.message });
      }
    });


    // handle scene updates full sync
    socket.on('scene-update', async (data) => {
      try {
        const roomId = this.socketRoomMap.get(socket.id);
        if (!roomId) return socket.emit('error', { message: 'Not in a room' });

        const validated = validate(sceneUpdateSchema, data);

        //  zoom sanitization
        if (validated.appState) {
          const rawZoom = validated.appState.zoom;
          const zoomValue = typeof rawZoom === 'object' ? rawZoom.value : rawZoom;
          const safeZoom = (isNaN(zoomValue) || zoomValue <= 0) ? 1 : zoomValue;
          validated.appState.zoom = { value: safeZoom };

          if (isNaN(validated.appState.scrollX)) validated.appState.scrollX = 0;
          if (isNaN(validated.appState.scrollY)) validated.appState.scrollY = 0;
        }

        console.log(`broadcasting scene update for room ${roomId} (${validated.elements?.length || 0} elements)`);

        // Broadcast to all other users
        socket.to(roomId).emit('scene-update', {
          elements: validated.elements,
          appState: validated.appState,
          files: validated.files
        });

        // Update db in background
        roomService.updateRoomElements(
          roomId,
          validated.elements,
          validated.appState,
          validated.files
        ).catch(err => console.error('db save error:', err.message));

      } catch (error) {
        console.error('scene-update error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });


    // handle incremental updates
    socket.on('incremental-update', async (data) => {
      try {
        const roomId = this.socketRoomMap.get(socket.id);
        if (!roomId) {
          return socket.emit('error', { message: 'Not in a room' });
        }

        const validated = validate(incrementalUpdateSchema, data);
        await roomService.incrementalUpdate(roomId, validated);

        socket.to(roomId).emit('incremental-update', validated);

      } catch (error) {
        console.error('Error in incremental update:', error);
        socket.emit('error', { message: error.message });
      }
    });
    socket.on('pointer-update', async (data) => {
      try {
        const roomId = this.socketRoomMap.get(socket.id);
        if (!roomId) {
          return;
        }

        const validated = validate(pointerSchema, data);

        await roomService.updateUserPointer(roomId, socket.id, validated);

        socket.to(roomId).emit('pointer-update', {
          socketId: socket.id,
          pointer: validated
        });

      } catch (error) {
      }
    });
    socket.on('idle-status', async (data) => {
      try {
        const roomId = this.socketRoomMap.get(socket.id);
        if (!roomId) {
          return;
        }

        socket.to(roomId).emit('idle-status', {
          socketId: socket.id,
          idle: data.idle
        });

      } catch (error) {
        console.error('Error updating idle status:', error);
      }
    });

    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket);
    });

    socket.on('leave-room', async () => {
      await this.handleLeaveRoom(socket);
    });
  }

  async handleLeaveRoom(socket) {
    const roomId = this.socketRoomMap.get(socket.id);
    if (!roomId) {
      return;
    }

    try {

      await roomService.removeUser(roomId, socket.id);

      // Leave socket room
      socket.leave(roomId);

      // Remove from map
      this.socketRoomMap.delete(socket.id);

      socket.to(roomId).emit('user-left', {
        socketId: socket.id
      });

      console.log(`User ${socket.id} left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  async handleDisconnect(socket) {
    console.log(`Client disconnected: ${socket.id}`);
    await this.handleLeaveRoom(socket);
  }

  // Admin/utility methods
  getRoomStats(roomId) {
    return roomService.getRoomStats(roomId);
  }

  getActiveConnectionsCount() {
    return this.socketRoomMap.size;
  }

  getActiveRoomsCount() {
    return roomService.getActiveRoomsCount()
  }
}

export default SocketHandler