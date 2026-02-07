// ===============================================
// VANISHING POINT - CLIENT SCRIPT
// ===============================================

let gameData = null;
let currentScene = null;
let playerNumber = null;
let playerName = null;
let partnerName = null;
let ws = null;
let sceneHistory = [];

// ===============================================
// INIT
// ===============================================
async function init() {
  await loadGameData();
  setupLobbyListeners();
}

async function loadGameData() {
  try {
    const response = await fetch('/game-data.json');
    gameData = await response.json();
    console.log('Game data loaded:', gameData);
  } catch (error) {
    console.error('Failed to load game data:', error);
    showError('Failed to load game. Please refresh.');
  }
}

// ===============================================
// LOBBY
// ===============================================
function setupLobbyListeners() {
  const p1Input = document.getElementById('player1-name');
  const p2Input = document.getElementById('player2-name');
  const startBtn = document.getElementById('start-game-btn');
  
  p1Input.addEventListener('input', checkReadyState);
  p2Input.addEventListener('input', checkReadyState);
  
  startBtn.addEventListener('click', startGame);
}

function checkReadyState() {
  const p1 = document.getElementById('player1-name').value.trim();
  const p2 = document.getElementById('player2-name').value.trim();
  const startBtn = document.getElementById('start-game-btn');
  
  if (p1 && p2) {
    startBtn.disabled = false;
    document.getElementById('player1-status').textContent = '✓ Ready';
    document.getElementById('player1-status').classList.add('ready');
    document.getElementById('player2-status').textContent = '✓ Ready';
    document.getElementById('player2-status').classList.add('ready');
  } else {
    startBtn.disabled = true;
  }
}

function startGame() {
  const p1Name = document.getElementById('player1-name').value.trim();
  const p2Name = document.getElementById('player2-name').value.trim();
  
  if (!p1Name || !p2Name) {
    showError('Both players must enter names');
    return;
  }
  
  // Determine which player this browser is
  playerNumber = Math.random() > 0.5 ? 1 : 2;
  playerName = playerNumber === 1 ? p1Name : p2Name;
  partnerName = playerNumber === 1 ? p2Name : p1Name;
  
  initWebSocket();
}

// ===============================================
// WEBSOCKET
// ===============================================
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('Connected to game server');
    sendWS({
      type: 'playerJoin',
      playerNumber: playerNumber,
      playerName: playerName,
      partnerName: partnerName
    });
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  ws.onclose = () => {
    console.log('Disconnected');
    setTimeout(initWebSocket, 3000);
  };
}

function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'gameStart':
      showGameScreen();
      loadScene(1); // Start at scene 1
      break;
    case 'sceneUpdate':
      if (data.playerNumber === playerNumber) {
        loadScene(data.sceneId);
      }
      break;
    case 'partnerChoice':
      addActivityFeed(`${partnerName} made a choice`);
      break;
    case 'gameOver':
      showEnding(data.endingId);
      break;
  }
}

// ===============================================
// GAME SCREEN
// ===============================================
function showGameScreen() {
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  
  document.getElementById('your-player-badge').textContent = `Player ${playerNumber}`;
  document.getElementById('your-name-display').textContent = playerName;
}

function loadScene(sceneId) {
  const scene = gameData.scenes.find(s => s.id === sceneId);
  
  if (!scene) {
    console.error('Scene not found:', sceneId);
    return;
  }
  
  // Check if scene is for this player
  if (scene.player !== playerNumber) {
    // Wait for partner's choice
    showWaitingScreen();
    return;
  }
  
  currentScene = scene;
  sceneHistory.push(sceneId);
  
  renderScene(scene);
}

function renderScene(scene) {
  // Update scene counter
  document.getElementById('scene-counter').textContent = `Scene ${sceneHistory.length}`;
  
  // Update status if available
  if (scene.status) {
    document.getElementById('status-display').textContent = scene.status.replace(/_/g, ' ').toUpperCase();
  }
  
  // Render description
  document.getElementById('scene-description').textContent = scene.description;
  
  // Check if this is an ending scene
  if (scene.endings) {
    showEnding(scene.id);
    return;
  }
  
  // Render choices
  if (scene.choices && scene.choices.length > 0) {
    document.getElementById('choices-container').classList.remove('hidden');
    
    scene.choices.forEach((choice, index) => {
      const btn = document.getElementById(`choice-${choice.index}`);
      const text = document.getElementById(`choice-${choice.index}-text`);
      
      if (btn && text) {
        btn.classList.remove('hidden');
        text.textContent = choice.text;
        btn.onclick = () => makeChoice(choice);
      }
    });
    
    // Hide unused choice buttons
    for (let i = 1; i <= 2; i++) {
      if (!scene.choices.find(c => c.index === i)) {
        document.getElementById(`choice-${i}`).classList.add('hidden');
      }
    }
  } else {
    document.getElementById('choices-container').classList.add('hidden');
  }
}

function makeChoice(choice) {
  // Disable all choices
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
  });
  
  addActivityFeed(`You chose: "${choice.text}"`);
  
  // Send choice to server
  sendWS({
    type: 'playerChoice',
    playerNumber: playerNumber,
    sceneId: currentScene.id,
    choiceIndex: choice.index,
    effects: choice.effects
  });
  
  // Load next scene
  setTimeout(() => {
    const nextSceneId = choice.effects.nextSceneId;
    if (nextSceneId) {
      loadScene(nextSceneId);
    }
    
    // Re-enable choices
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.disabled = false;
    });
  }, 1000);
}

function showWaitingScreen() {
  document.getElementById('scene-description').textContent = 
    `Waiting for ${partnerName} to make their choice...`;
  document.getElementById('choices-container').classList.add('hidden');
}

// ===============================================
// ACTIVITY FEED
// ===============================================
function addActivityFeed(message) {
  const feed = document.getElementById('activity-feed');
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.textContent = message;
  
  feed.insertBefore(item, feed.firstChild);
  
  // Keep only last 5 items
  while (feed.children.length > 5) {
    feed.removeChild(feed.lastChild);
  }
}

// ===============================================
// ENDING
// ===============================================
function showEnding(sceneId) {
  const scene = gameData.scenes.find(s => s.id === sceneId);
  
  if (!scene) return;
  
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('ending-screen').classList.remove('hidden');
  
  document.getElementById('ending-title').textContent = 'THE END';
  document.getElementById('ending-description').textContent = scene.description;
  
  if (scene.endings && scene.endings.length > 0) {
    const endingName = scene.endings[0];
    const ending = gameData.endings.find(e => e.name === endingName);
    if (ending) {
      document.getElementById('ending-stats').innerHTML = `
        <h3>${ending.text}</h3>
        <p>Scenes visited: ${sceneHistory.length}</p>
        <p>Your journey has reached its vanishing point.</p>
      `;
    }
  }
}

function showError(message) {
  document.getElementById('lobby-error').textContent = message;
  setTimeout(() => {
    document.getElementById('lobby-error').textContent = '';
  }, 3000);
}

// ===============================================
// START
// ===============================================
document.addEventListener('DOMContentLoaded', init);
