// ===============================================
// VANISHING POINT - CLIENT (REAL MULTIPLAYER)
// ===============================================

let ws = null;
let gameData = null;
let playerNumber = null;
let playerName = null;
let currentSceneId = null;
let isReady = false;

// ===============================================
// INIT
// ===============================================
async function init() {
  await loadGameData();
  setupListeners();
}

async function loadGameData() {
  try {
    const response = await fetch('/game-data.json');
    gameData = await response.json();
    console.log('✅ Game data loaded');
  } catch (error) {
    console.error('❌ Failed to load game data:', error);
    showError('Failed to load game data');
  }
}

function setupListeners() {
  document.getElementById('join-btn').addEventListener('click', joinRoom);
  document.getElementById('ready-btn').addEventListener('click', setReady);
  document.getElementById('start-btn').addEventListener('click', startGame);
}

// ===============================================
// WEBSOCKET CONNECTION
// ===============================================
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('✅ Connected to server');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('📨 Received:', data.type);
    handleServerMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
    showError('Connection error');
  };
  
  ws.onclose = () => {
    console.log('📴 Disconnected');
    showError('Disconnected from server');
  };
}

function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    console.log('📤 Sent:', data.type);
  }
}

// ===============================================
// HANDLE SERVER MESSAGES
// ===============================================
function handleServerMessage(data) {
  switch (data.type) {
    case 'joinedRoom':
      handleJoinedRoom(data);
      break;
    case 'roomUpdate':
      handleRoomUpdate(data);
      break;
    case 'gameStart':
      handleGameStart();
      break;
    case 'loadScene':
      loadScene(data.sceneId);
      break;
    case 'partnerChoice':
      addActivity(`Partner: ${data.choice}`);
      break;
    case 'error':
      showError(data.message);
      break;
  }
}

// ===============================================
// JOIN ROOM
// ===============================================
function joinRoom() {
  const name = document.getElementById('player-name').value.trim();
  
  if (!name) {
    showError('Please enter your name');
    return;
  }
  
  playerName = name;
  connectWebSocket();
  
  // Wait for connection then join
  setTimeout(() => {
    sendWS({
      type: 'joinRoom',
      roomCode: 'default',
      name: name
    });
  }, 500);
}

function handleJoinedRoom(data) {
  playerNumber = data.playerNumber;
  
  document.getElementById('lobby-screen').querySelector('.lobby-card').classList.add('hidden');
  document.getElementById('room-status').classList.remove('hidden');
  document.getElementById('ready-btn').disabled = false;
  
  document.getElementById('room-code').textContent = data.roomCode;
  
  console.log(`✅ Joined as Player ${playerNumber}`);
}

function handleRoomUpdate(data) {
  // Update Player 1
  if (data.player1) {
    document.getElementById('player1-name').textContent = data.player1.name;
    document.getElementById('player1-status').textContent = data.player1.ready ? '✅ Ready' : '';
    
    const p1Slot = document.querySelector('.players-grid .player-slot:first-child');
    if (data.player1.ready) {
      p1Slot.classList.add('ready');
    }
  }
  
  // Update Player 2
  if (data.player2) {
    document.getElementById('player2-name').textContent = data.player2.name;
    document.getElementById('player2-status').textContent = data.player2.ready ? '✅ Ready' : '';
    
    const p2Slot = document.querySelector('.players-grid .player-slot:last-child');
    if (data.player2.ready) {
      p2Slot.classList.add('ready');
    }
  }
  
  // Show start button if both ready
  if (data.player1 && data.player2 && data.player1.ready && data.player2.ready) {
    document.getElementById('start-btn').classList.remove('hidden');
  }
}

function setReady() {
  isReady = true;
  document.getElementById('ready-btn').disabled = true;
  document.getElementById('ready-btn').textContent = '✅ Ready!';
  
  sendWS({
    type: 'playerReady'
  });
}

function startGame() {
  sendWS({
    type: 'startGame'
  });
}

// ===============================================
// GAME START
// ===============================================
function handleGameStart() {
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  
  document.getElementById('player-badge').textContent = `Player ${playerNumber}`;
  document.getElementById('your-name').textContent = playerName;
  
  console.log('🎮 Game started!');
}

// ===============================================
// LOAD SCENE
// ===============================================
function loadScene(sceneId) {
  currentSceneId = sceneId;
  
  const scene = gameData.scenes.find(s => s.id === sceneId);
  
  if (!scene) {
    console.error('❌ Scene not found:', sceneId);
    return;
  }
  
  console.log(`📖 Loading scene ${sceneId}`);
  
  // Check if ending
  if (scene.endings) {
    showEnding(scene);
    return;
  }
  
  // Display scene
  document.getElementById('scene-text').textContent = scene.description;
  document.getElementById('scene-counter').textContent = `Scene ${sceneId}`;
  
  // Display choices
  const choicesBox = document.getElementById('choices-box');
  choicesBox.innerHTML = '';
  
  if (scene.choices && scene.choices.length > 0) {
    scene.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerHTML = `
        <div class="choice-num">${choice.index}</div>
        <div>${choice.text}</div>
      `;
      btn.onclick = () => makeChoice(choice);
      choicesBox.appendChild(btn);
    });
  }
}

function makeChoice(choice) {
  // Disable all buttons
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });
  
  addActivity(`You chose: ${choice.text}`);
  
  sendWS({
    type: 'makeChoice',
    sceneId: currentSceneId,
    choiceIndex: choice.index,
    choiceText: choice.text,
    nextSceneId: choice.effects.nextSceneId,
    status: choice.effects.status
  });
  
  console.log(`✅ Made choice: ${choice.text}`);
}

// ===============================================
// ACTIVITY FEED
// ===============================================
function addActivity(message) {
  const feed = document.getElementById('activity-feed');
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.textContent = message;
  
  feed.insertBefore(item, feed.firstChild);
  
  // Keep only last 5
  while (feed.children.length > 5) {
    feed.removeChild(feed.lastChild);
  }
}

// ===============================================
// ENDING
// ===============================================
function showEnding(scene) {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('ending-screen').classList.remove('hidden');
  
  document.getElementById('ending-text').textContent = scene.description;
  
  console.log('🎬 Game ended');
}

function showError(message) {
  document.getElementById('error-msg').textContent = message;
  setTimeout(() => {
    document.getElementById('error-msg').textContent = '';
  }, 3000);
}

// ===============================================
// START
// ===============================================
document.addEventListener('DOMContentLoaded', init);
