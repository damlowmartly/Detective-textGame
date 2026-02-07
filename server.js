// ===============================================
// VANISHING POINT - SERVER
// ===============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

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
// GAME STATE
// ===============================================
const games = new Map(); // sessionId -> game state

function createGame() {
  return {
    players: new Map(), // playerNumber -> {ws, name, currentScene}
    choices: new Map(), // sceneId -> {player1Choice, player2Choice}
    started: false
  };
}

// ===============================================
// WEBSOCKET
// ===============================================
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let sessionId = null;
  let playerNumber = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    if (sessionId && playerNumber) {
      const game = games.get(sessionId);
      if (game) {
        game.players.delete(playerNumber);
        if (game.players.size === 0) {
          games.delete(sessionId);
        }
      }
    }
    console.log('Client disconnected');
  });
  
  function handleMessage(ws, data) {
    switch (data.type) {
      case 'playerJoin':
        sessionId = 'default'; // For simplicity, one game session
        playerNumber = data.playerNumber;
        
        if (!games.has(sessionId)) {
          games.set(sessionId, createGame());
        }
        
        const game = games.get(sessionId);
        game.players.set(playerNumber, {
          ws: ws,
          name: data.playerName,
          partnerName: data.partnerName,
          currentScene: 1
        });
        
        console.log(`Player ${playerNumber} (${data.playerName}) joined`);
        
        // Start game if both players joined
        if (game.players.size === 2 && !game.started) {
          game.started = true;
          broadcastToGame(sessionId, {
            type: 'gameStart'
          });
        }
        break;
        
      case 'playerChoice':
        handlePlayerChoice(sessionId, data);
        break;
    }
  }
});

// ===============================================
// GAME LOGIC
// ===============================================
function handlePlayerChoice(sessionId, data) {
  const game = games.get(sessionId);
  if (!game) return;
  
  const player = game.players.get(data.playerNumber);
  if (!player) return;
  
  console.log(`Player ${data.playerNumber} chose option ${data.choiceIndex} at scene ${data.sceneId}`);
  
  // Update player's current scene
  if (data.effects && data.effects.nextSceneId) {
    player.currentScene = data.effects.nextSceneId;
  }
  
  // Notify partner
  const partnerNumber = data.playerNumber === 1 ? 2 : 1;
  const partner = game.players.get(partnerNumber);
  
  if (partner) {
    sendToPlayer(partner.ws, {
      type: 'partnerChoice',
      playerNumber: data.playerNumber,
      sceneId: data.sceneId,
      choiceIndex: data.choiceIndex
    });
  }
  
  // Check if this choice triggers scene for partner
  // (This is simplified - in a real game, you'd check the game data)
  
  // Check for game ending
  if (data.effects.nextSceneId >= 100) {
    broadcastToGame(sessionId, {
      type: 'gameOver',
      endingId: data.effects.nextSceneId
    });
  }
}

// ===============================================
// BROADCAST
// ===============================================
function broadcastToGame(sessionId, data) {
  const game = games.get(sessionId);
  if (!game) return;
  
  const message = JSON.stringify(data);
  game.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
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
});
