// ================================================================
// server.js — 隠し字クイズ WebSocketサーバー
// ================================================================
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ── ルーム管理 ──────────────────────────────────────────────
// rooms[roomCode] = {
//   code, hostId, players: [{id, name, score, socketId}],
//   state: 'waiting'|'playing'|'roundEnd'|'matchEnd',
//   settings: { quizType, difficulty, flipMode, flipInterval, totalRounds },
//   round: number, currentAnswer: string,
//   roundWinnerId: string|null,
//   flipInterval: NodeJS.Timeout|null,
//   tilesOpen: number[], openedCount: number,
//   charTilesOpen: number[][], // for multi-char mode
//   timeLeft: number, countdownTimer: NodeJS.Timeout|null,
// }
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId));
}

// ── 単語DB（サーバー側でも保持して改ざん防止） ──────────────
// words.jsと同じデータをここに埋め込む（抜粋版 — 実際には同ファイルをrequireしても良い）
// ここでは words.js を public/ から読み込む代わりにインラインで定義
const WORD_POOLS = require('./words');

function pickWord(quizType, difficulty, recentAnswers) {
  const db = WORD_POOLS[quizType];
  if (!db) return '？';
  const pool = db[difficulty] || db['all'] || Object.values(db).flat();
  const candidates = pool.filter(w => !recentAnswers.includes(w));
  const finalPool = candidates.length > 0 ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

// ── Socket.io イベント ────────────────────────────────────────
io.on('connection', (socket) => {

  // ルーム作成
  socket.on('createRoom', ({ playerName, settings }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    rooms[code] = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || 'ホスト', score: 0, socketId: socket.id }],
      state: 'waiting',
      settings: {
        quizType:     settings.quizType     || 'kanji',
        difficulty:   settings.difficulty   || 'k9',
        flipMode:     settings.flipMode     || 'random',
        flipInterval: settings.flipInterval || 2000,
        totalRounds:  settings.totalRounds  || 7,
      },
      round: 0,
      recentAnswers: [],
      currentAnswer: '',
      charList: [],
      roundWinnerId: null,
      flipTimerHandle: null,
      tilesOpen: [],
      charTilesOpen: [],
      openedCount: 0,
      timeLeft: 0,
      countdownHandle: null,
    };

    socket.join(code);
    socket.emit('roomCreated', { code, room: safeRoom(rooms[code]) });
  });

  // ルーム参加
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'ルームが見つかりません' }); return; }
    if (room.state !== 'waiting') { socket.emit('error', { message: 'ゲームはすでに開始されています' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'ルームが満員です' }); return; }

    room.players.push({ id: socket.id, name: playerName || 'ゲスト', score: 0, socketId: socket.id });
    socket.join(roomCode);

    io.to(roomCode).emit('playerJoined', { room: safeRoom(room) });
    socket.emit('joinedRoom', { room: safeRoom(room) });
  });

  // 設定変更（ホストのみ）
  socket.on('updateSettings', ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    room.settings = { ...room.settings, ...settings };
    io.to(roomCode).emit('settingsUpdated', { settings: room.settings });
  });

  // ゲーム開始（ホストのみ）
  socket.on('startMatch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', { message: '2人必要です' }); return; }

    room.players.forEach(p => p.score = 0);
    room.round = 0;
    room.recentAnswers = [];
    startRound(room);
  });

  // タイル選択（セレクトフリップ）
  socket.on('selectTile', ({ roomCode, charIndex, tileIndex }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'playing') return;

    if (room.settings.quizType === 'kanji') {
      if (room.tilesOpen[tileIndex]) return;
      openKanjiTile(room, tileIndex);
    } else {
      if (room.charTilesOpen[charIndex][tileIndex]) return;
      openCharTile(room, charIndex, tileIndex);
    }
  });

  // 回答
  socket.on('submitAnswer', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const correct = answer.trim() === room.currentAnswer;
    if (correct) {
      // 得点: 正解で1点（シンプル方式）
      const pts = 1;
      player.score += pts;
      room.roundWinnerId = player.id;
      endRound(room, player, pts);
    } else {
      io.to(room.code).emit('wrongAnswer', {
        playerId: player.id,
        playerName: player.name,
      });
    }
  });

  // 降参
  socket.on('giveUp', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'playing') return;
    endRound(room, null, 0);
  });

  // 次ラウンドへ（両プレイヤーが準備できたら）
  socket.on('readyNext', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'roundEnd') return;
    room._readyCount = (room._readyCount || 0) + 1;
    if (room._readyCount >= room.players.length) {
      room._readyCount = 0;
      if (room.round >= room.settings.totalRounds) {
        endMatch(room);
      } else {
        startRound(room);
      }
    }
  });

  // 切断
  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    clearRoomTimers(room);
    io.to(room.code).emit('playerLeft', {
      playerId: socket.id,
      message: '相手が切断しました',
    });
    delete rooms[room.code];
  });
});

// ── ゲームロジック ────────────────────────────────────────────
function startRound(room) {
  room.round += 1;
  room.state = 'playing';
  room.roundWinnerId = null;
  clearRoomTimers(room);

  const word = pickWord(room.settings.quizType, room.settings.difficulty, room.recentAnswers);
  room.currentAnswer = word;
  room.charList = [...word];
  room.recentAnswers.push(word);
  if (room.recentAnswers.length > 15) room.recentAnswers.shift();

  // タイル初期化
  const n = room.charList.length;
  room.tilesOpen = Array(64).fill(false);
  room.charTilesOpen = Array(n).fill(null).map(() => Array(64).fill(false));

  const timeSec = room.settings.quizType === 'kanji' ? 90 : 90 + n * 30;
  room.timeLeft = timeSec;

  io.to(room.code).emit('roundStart', {
    round: room.round,
    totalRounds: room.settings.totalRounds,
    quizType: room.settings.quizType,
    charCount: n,
    charList: room.charList,
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    timeLeft: timeSec,
    settings: room.settings,
  });

  if (room.settings.flipMode === 'random') {
    startFlipTimer(room);
  }
  startCountdown(room);
}

function startFlipTimer(room) {
  let rrCursor = 0;

  room.flipTimerHandle = setInterval(() => {
    if (room.state !== 'playing') return;

    if (room.settings.quizType === 'kanji') {
      const closed = room.tilesOpen.map((o, i) => o ? null : i).filter(x => x !== null);
      if (!closed.length) { clearInterval(room.flipTimerHandle); return; }
      const idx = closed[Math.floor(Math.random() * closed.length)];
      openKanjiTile(room, idx);
    } else {
      const n = room.charList.length;
      let tries = 0;
      while (tries < n) {
        const ci = rrCursor % n;
        rrCursor = (rrCursor + 1) % n;
        const closed = room.charTilesOpen[ci].map((o, i) => o ? null : i).filter(x => x !== null);
        if (closed.length) {
          const idx = closed[Math.floor(Math.random() * closed.length)];
          openCharTile(room, ci, idx);
          break;
        }
        tries++;
      }
    }
  }, room.settings.flipInterval);
}

function startCountdown(room) {
  room.countdownHandle = setInterval(() => {
    if (room.state !== 'playing') return;
    room.timeLeft--;
    io.to(room.code).emit('tick', { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) {
      clearRoomTimers(room);
      endRound(room, null, 0, 'timeup');
    }
  }, 1000);
}

function openKanjiTile(room, i, broadcast = true) {
  if (room.tilesOpen[i]) return;
  room.tilesOpen[i] = true;
  if (broadcast) io.to(room.code).emit('tileOpened', { charIndex: -1, tileIndex: i });
}

function openCharTile(room, ci, i, broadcast = true) {
  if (room.charTilesOpen[ci][i]) return;
  room.charTilesOpen[ci][i] = true;
  if (broadcast) io.to(room.code).emit('tileOpened', { charIndex: ci, tileIndex: i });
}

function endRound(room, winner, pts, reason = 'answer') {
  if (room.state !== 'playing') return;
  room.state = 'roundEnd';
  clearRoomTimers(room);

  io.to(room.code).emit('roundEnd', {
    reason,
    answer: room.currentAnswer,
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : null,
    pts,
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    round: room.round,
    totalRounds: room.settings.totalRounds,
  });
}

function endMatch(room) {
  room.state = 'matchEnd';
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  io.to(room.code).emit('matchEnd', {
    scores: sorted.map(p => ({ id: p.id, name: p.name, score: p.score })),
    winnerId: sorted[0].score !== sorted[1].score ? sorted[0].id : null,
  });
}

function clearRoomTimers(room) {
  if (room.flipTimerHandle)  { clearInterval(room.flipTimerHandle);  room.flipTimerHandle  = null; }
  if (room.countdownHandle)  { clearInterval(room.countdownHandle);  room.countdownHandle  = null; }
}

// 送信用にタイマーハンドルなどを除いた安全なルーム情報
function safeRoom(room) {
  return {
    code: room.code,
    state: room.state,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    settings: room.settings,
    round: room.round,
    hostId: room.hostId,
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`KAKUSHI server running on port ${PORT}`));
