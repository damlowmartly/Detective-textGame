// ===============================================
// VANISHING POINT - REAL MULTIPLAYER SERVER
// ===============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve game data
app.get('/game-data.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'game-data.json'));
});

// ===============================================
// GAME ROOMS (Each room = 1 game with 2 players)
// ===============================================
const rooms = new Map(); // roomCode -> {player1, player2, scenes, started}

function createRoom(roomCode) {
  return {
    roomCode: roomCode,
    player1: null, // {ws, name, sceneId, status}
    player2: null,
    started: false,
    scenes: {}
  };
}

// ===============================================
// WEBSOCKET CONNECTION
// ===============================================
wss.on('connection', (ws) => {
  console.log('📱 New client connected');
  
  let currentRoom = null;
  let playerSlot = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Received:', data.type);
      handleMessage(ws, data);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('📴 Client disconnected');
    if (currentRoom && playerSlot) {
      const room = rooms.get(currentRoom);
      if (room) {
        if (playerSlot === 'player1') room.player1 = null;
        if (playerSlot === 'player2') room.player2 = null;
        
        // Notify other player
        broadcastToRoom(currentRoom, {
          type: 'playerLeft',
          slot: playerSlot
        });
        
        // Delete room if empty
        if (!room.player1 && !room.player2) {
          rooms.delete(currentRoom);
          console.log(`🗑️ Room ${currentRoom} deleted`);
        }
      }
    }
  });
  
  function handleMessage(ws, data) {
    switch (data.type) {
      case 'joinRoom':
        handleJoinRoom(ws, data);
        break;
      case 'playerReady':
        handlePlayerReady(data);
        break;
      case 'makeChoice':
        handleMakeChoice(data);
        break;
      case 'startGame':
        handleStartGame(data);
        break;
    }
  }
  
  function handleJoinRoom(ws, data) {
    const roomCode = data.roomCode || 'default';
    
    // Get or create room
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, createRoom(roomCode));
      console.log(`🆕 Room created: ${roomCode}`);
    }
    
    const room = rooms.get(roomCode);
    
    // Assign player slot
    if (!room.player1) {
      room.player1 = {
        ws: ws,
        name: data.name,
        sceneId: 1,
        status: 'waiting',
        ready: false
      };
      playerSlot = 'player1';
      currentRoom = roomCode;
      
      sendToPlayer(ws, {
        type: 'joinedRoom',
        roomCode: roomCode,
        playerNumber: 1,
        playerName: data.name
      });
      
      console.log(`✅ ${data.name} joined as Player 1`);
    } else if (!room.player2) {
      room.player2 = {
        ws: ws,
        name: data.name,
        sceneId: 50,
        status: 'waiting',
        ready: false
      };
      playerSlot = 'player2';
      currentRoom = roomCode;
      
      sendToPlayer(ws, {
        type: 'joinedRoom',
        roomCode: roomCode,
        playerNumber: 2,
        playerName: data.name
      });
      
      console.log(`✅ ${data.name} joined as Player 2`);
      
      // Notify both players about each other
      broadcastToRoom(roomCode, {
        type: 'roomUpdate',
        player1: { name: room.player1.name, ready: room.player1.ready },
        player2: { name: room.player2.name, ready: room.player2.ready }
      });
    } else {
      // Room is full
      sendToPlayer(ws, {
        type: 'error',
        message: 'Room is full'
      });
    }
  }
  
  function handlePlayerReady(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    if (playerSlot === 'player1' && room.player1) {
      room.player1.ready = true;
    } else if (playerSlot === 'player2' && room.player2) {
      room.player2.ready = true;
    }
    
    // Broadcast room update
    broadcastToRoom(currentRoom, {
      type: 'roomUpdate',
      player1: room.player1 ? { name: room.player1.name, ready: room.player1.ready } : null,
      player2: room.player2 ? { name: room.player2.name, ready: room.player2.ready } : null
    });
    
    console.log(`✅ ${playerSlot} is ready`);
  }
  
  function handleStartGame(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    // Check if both players ready
    const p1Ready = room.player1 && room.player1.ready;
    const p2Ready = room.player2 && room.player2.ready;
    
    if (p1Ready && p2Ready && !room.started) {
      room.started = true;
      
      broadcastToRoom(currentRoom, {
        type: 'gameStart'
      });
      
      // Send initial scenes
      if (room.player1) {
        sendToPlayer(room.player1.ws, {
          type: 'loadScene',
          sceneId: 1
        });
      }
      
      if (room.player2) {
        sendToPlayer(room.player2.ws, {
          type: 'loadScene',
          sceneId: 50
        });
      }
      
      console.log(`🎮 Game started in room ${currentRoom}`);
    }
  }
  
  function handleMakeChoice(data) {
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    const player = playerSlot === 'player1' ? room.player1 : room.player2;
    if (!player) return;
    
    // Update scene
    player.sceneId = data.nextSceneId;
    player.status = data.status || 'active';
    
    // Notify the player
    sendToPlayer(player.ws, {
      type: 'loadScene',
      sceneId: data.nextSceneId
    });
    
    // Notify partner
    const partner = playerSlot === 'player1' ? room.player2 : room.player1;
    if (partner) {
      sendToPlayer(partner.ws, {
        type: 'partnerChoice',
        playerSlot: playerSlot,
        choice: data.choiceText
      });
    }
    
    console.log(`${playerSlot} chose: ${data.choiceText}`);
  }
});

// ===============================================
// HELPER FUNCTIONS
// ===============================================
function broadcastToRoom(roomCode, data) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const message = JSON.stringify(data);
  
  if (room.player1 && room.player1.ws.readyState === WebSocket.OPEN) {
    room.player1.ws.send(message);
  }
  
  if (room.player2 && room.player2.ws.readyState === WebSocket.OPEN) {
    room.player2.ws.send(message);
  }
}

function sendToPlayer(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ===============================================
// START SERVER
// ===============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎭 Vanishing Point server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} on 2 devices`);
});
