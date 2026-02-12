import express from 'express';
import roomService from '../services/roomService.js';
import { validate, roomIdSchema } from '../utils/validation.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// createroom
router.post('/rooms', async (req, res) => {
  try {
    const { roomId } = req.body;
    
    let validatedRoomId = null;
    if (roomId) {
      const validated = validate(roomIdSchema, { roomId });
      validatedRoomId = validated.roomId;
    }

    const room = await roomService.createRoom(validatedRoomId);
    
    res.status(201).json({
      success: true,
      roomId: room.roomId,
      createdAt: room.createdAt
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// room data
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = validate(roomIdSchema, { roomId: req.params.roomId });
    
    const room = await roomService.getRoom(roomId, false);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    res.json({
      success: true,
      data: {
        roomId: room.roomId,
        elements: room.elements,
        appState: room.appState,
        files: Object.fromEntries(room.files || new Map()),
        activeUsers: room.activeUsers.length,
        version: room.version,
        lastModified: room.lastModified
      }
    });
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// room stats
router.get('/rooms/:roomId/stats', async (req, res) => {
  try {
    const { roomId } = validate(roomIdSchema, { roomId: req.params.roomId });
    
    const stats = await roomService.getRoomStats(roomId);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting room stats:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = validate(roomIdSchema, { roomId: req.params.roomId });
    
    const room = await roomService.getRoom(roomId, false);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }
    if (room.activeUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete room with active users'
      });
    }

    await room.deleteOne();
    
    res.json({
      success: true,
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// serverstats (admin endpoint)
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      activeRooms: roomService.getActiveRoomsCount(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }
  });
});

export default router;