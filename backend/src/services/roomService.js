import Room from '../models/Room.js';
import cacheManager from '../config/cache.js';
import { nanoid } from 'nanoid';

class RoomService {
  constructor() {
    this.activeRooms = new Map(); // In-memory cache for active rooms
  }

  async createRoom(roomId = null) {
    try {
      const id = roomId || nanoid(10);
      const existing = await Room.findOne({ roomId: id });
      if (existing) {
        return existing;
      }

      const room = new Room({
        roomId: id,
        elements: [],
        appState: {
          viewBackgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 }
        },
        files: new Map(),
        activeUsers: [],
        version: 1
      });

      await room.save();

      // Cache the room
      this.activeRooms.set(id, room);
      await cacheManager.set(`room:${id}`, room.toObject(), 7200);

      console.log(`room created: ${id}`);
      return room;
    } catch (error) {
      console.error('rrror creating room:', error);
      throw error;
    }
  }

  async getRoom(roomId, createIfNotExists = true) {
    try {
      // Check in-memory cache first
      if (this.activeRooms.has(roomId)) {
        return this.activeRooms.get(roomId);
      }

      // Check Redis cache
      if (cacheManager.isActive()) {
        const cached = await cacheManager.get(`room:${roomId}`);
        if (cached) {
          const room = new Room(cached);
          this.activeRooms.set(roomId, room);
          return room;
        }
      }

      // Fetch from database
      console.log(`DB Query: Room ${roomId}...`);
      let room = await Room.findOne({ roomId }).maxTimeMS(5000);
      console.log(`db Result: ${room ? 'Found' : 'Not Found'}`);

      if (!room && createIfNotExists) {
        console.log(`creating new room: ${roomId}`);
        room = await this.createRoom(roomId);
      }

      if (room) {
        this.activeRooms.set(roomId, room);
        await cacheManager.set(`room:${roomId}`, room.toObject(), 7200);
      }

      return room;
    } catch (error) {
      console.error('error getting room', error);
      throw error;
    }
  }

  async updateRoomElements(roomId, elements, appState = null, files = null) {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      room.elements = elements;
      if (appState) {
        const current = room.appState || {};
        room.appState = { ...current, ...appState };
      }
      if (files) {
        room.files = new Map(Object.entries(files));
      }
      room.version += 1;
      room.lastModified = new Date();

      room.markModified('elements');
      room.markModified('appState');
      room.markModified('files');

      await room.save();

      // Update caches
      this.activeRooms.set(roomId, room);
      await cacheManager.set(`room:${roomId}`, room.toObject(), 7200);

      return room;
    } catch (error) {
      console.error('Error updating room elements:', error);
      throw error;
    }
  }

  async incrementalUpdate(roomId, updates) {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      await room.incrementalUpdate(updates);

      // Update caches
      this.activeRooms.set(roomId, room);
      await cacheManager.set(`room:${roomId}`, room.toObject(), 7200);

      return room;
    } catch (error) {
      console.error('Error in incremental update:', error);
      throw error;
    }
  }

  async addUser(roomId, socketId, username, color) {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      console.log(`adding user ${socketId} to room ${roomId}`);
      await room.addUser(socketId, username, color);
      console.log(`user ${socketId} added successfully`);

      // Update caches
      this.activeRooms.set(roomId, room);
      await cacheManager.set(`room:${roomId}`, room.toObject(), 7200);

      return room;
    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  }

  async removeUser(roomId, socketId) {
    try {
      const room = await this.getRoom(roomId, false);
      if (!room) {
        return null;
      }

      await room.removeUser(socketId);

      // Update caches
      this.activeRooms.set(roomId, room);
      await cacheManager.set(`room:${roomId}`, room.toObject(), 7200);

      // Clean up empty rooms
      if (room.activeUsers.length === 0) {
        setTimeout(() => this.cleanupEmptyRoom(roomId), 60000); // Clean after 1 minute
      }

      return room;
    } catch (error) {
      console.error('Error removing user:', error);
      throw error;
    }
  }

  async updateUserPointer(roomId, socketId, pointer) {
    try {
      // Usieng direct atomic update to avoid ParallelSaveError and locking
      await Room.updateOne(
        { roomId, 'activeUsers.socketId': socketId },
        {
          $set: {
            'activeUsers.$.pointer': pointer,
            'activeUsers.$.lastActive': new Date()
          }
        }
      );

      // Update in-memory cache for the specific user object
      const room = this.activeRooms.get(roomId);
      if (room) {
        const user = room.activeUsers.find(u => u.socketId === socketId);
        if (user) {
          user.pointer = pointer;
          user.lastActive = new Date();
        }
      }
      return true;
    } catch (error) {
      console.error('Error updating user pointer:', error);
      return null;
    }
  }


  async cleanupEmptyRoom(roomId) {
    try {
      const room = await this.getRoom(roomId, false);
      if (room && room.activeUsers.length === 0) {
        this.activeRooms.delete(roomId);
        await cacheManager.del(`room:${roomId}`);
        console.log(`cleaned up empty room: ${roomId}`);
      }
    } catch (error) {
      console.error('Error cleaning up room:', error);
    }
  }

  async cleanupInactiveRooms() {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const inactiveRooms = await Room.find({
        lastModified: { $lt: cutoffTime },
        activeUsers: { $size: 0 }
      });

      for (const room of inactiveRooms) {
        this.activeRooms.delete(room.roomId);
        await cacheManager.del(`room:${room.roomId}`);
      }

      if (inactiveRooms.length > 0) {
        console.log(`cleaned up ${inactiveRooms.length} inactive rooms`);
      }
    } catch (error) {
      console.error('Error cleaning up inactive rooms:', error);
    }
  }

  async getRoomStats(roomId) {
    try {
      const room = await this.getRoom(roomId, false);
      if (!room) {
        return null;
      }

      return {
        roomId: room.roomId,
        elementCount: room.elements.length,
        activeUsersCount: room.activeUsers.length,
        version: room.version,
        lastModified: room.lastModified,
        createdAt: room.createdAt
      };
    } catch (error) {
      console.error('Error getting room stats:', error);
      return null;
    }
  }

  getActiveRoomsCount() {
    return this.activeRooms.size;
  }

  clearMemoryCache() {
    this.activeRooms.clear();
  }
}

export default new RoomService();