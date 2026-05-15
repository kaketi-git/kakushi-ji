// ================================================================
// game.js — 隠し字クイズ ゲームロジック
// ================================================================

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────
const st = {
  playerMode: 'solo',
  quizType: 'kanji',   // 'kanji' | 'jukugo' | 'yoji'
  difficulty: 'sho',
  flipMode: 'random',
  flipInterval: 2000,
  answer: '',
  // kanji
  tiles: [],
  openedCount: 0,
  // multi-char
  charList: [],
  charTiles: [],
  charOpenCount: [],
  totalTiles: 0,
  totalOpen: 0,
  // shared
  gameActive: false,
  flipTimer: null,
  countdownTimer: null,
  timeLeft: 90,
  _timerTotal: 90,
  players: [],
  currentPlayer: 0,
  roomCode: null,
  // history to avoid repeats
  recentAnswers: [],
};

// ────────────────────────────────────────────────
// NAVIGATION
// ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startFlow(playerMode) {
  st.playerMode = playerMode;
  st.quizType = 'kanji';
  refreshTypeUI();
  showScreen('type-screen');
}

function showJoin() {
  st.playerMode = 'guest';
  showScreen('room-screen');
  setupJoinRoom();
}

// ────────────────────────────────────────────────
// QUIZ TYPE
// ────────────────────────────────────────────────
function selectQuizType(t) {
  st.quizType = t;
  refreshTypeUI();
}

function refreshTypeUI() {
  ['kanji', 'jukugo', 'yoji'].forEach(t =>
    document.getElementById('qt-' + t).classList.toggle('selected', t === st.quizType)
  );
}

function goToDifficulty() {
  buildDiffScreen();
  showScreen('diff-screen');
}

// ────────────────────────────────────────────────
// DIFFICULTY
// ────────────────────────────────────────────────
function buildDiffScreen() {
  const isKanji = st.quizType === 'kanji';
  document.getElementById('diff-title').textContent =
    isKanji ? '漢字の難易度' : `${getQuizTypeLabel()}の難易度（漢検レベル）`;
  const el = document.getElementById('diff-content');

  if (isKanji) {
    el.innerHTML = `
      <span class="label-sm">▍ 学習レベルを選択</span>
      <div class="diff-grid">
        <button class="diff-btn selected" id="d-sho" onclick="selectDiff('sho')">小学校レベル<span class="diff-sub">小1〜6年生の漢字</span></button>
        <button class="diff-btn"          id="d-chu" onclick="selectDiff('chu')">中学校レベル<span class="diff-sub">中学生の常用漢字</span></button>
        <button class="diff-btn"          id="d-ko"  onclick="selectDiff('ko')">高校・大学レベル<span class="diff-sub">難読・人名・古語</span></button>
        <button class="diff-btn"          id="d-dai" onclick="selectDiff('dai')">超難問<span class="diff-sub">画数最多・稀少字</span></button>
      </div>`;
    st.difficulty = 'sho';
  } else {
    el.innerHTML = `
      <span class="label-sm">▍ 漢検レベルを選択</span>
      <div class="diff-grid">
        <button class="diff-btn"          id="d-k10" onclick="selectDiff('k10')">10級<span class="diff-sub">小1レベル</span></button>
        <button class="diff-btn"          id="d-k9"  onclick="selectDiff('k9')">9級<span class="diff-sub">小2レベル</span></button>
        <button class="diff-btn"          id="d-k8"  onclick="selectDiff('k8')">8〜7級<span class="diff-sub">小3〜4レベル</span></button>
        <button class="diff-btn"          id="d-k7"  onclick="selectDiff('k7')">7〜6級<span class="diff-sub">小5〜6レベル</span></button>
        <button class="diff-btn"          id="d-k6"  onclick="selectDiff('k6')">6〜5級<span class="diff-sub">小5〜中学入口</span></button>
        <button class="diff-btn"          id="d-k4"  onclick="selectDiff('k4')">4〜3級<span class="diff-sub">中学レベル</span></button>
        <button class="diff-btn"          id="d-k2"  onclick="selectDiff('k2')">準2〜2級<span class="diff-sub">高校レベル</span></button>
        <button class="diff-btn"          id="d-k1"  onclick="selectDiff('k1')">準1〜1級<span class="diff-sub">大学・専門レベル</span></button>
        <button class="diff-btn selected" id="d-all" onclick="selectDiff('all')">総合<span class="diff-sub">全レベルミックス</span></button>
      </div>`;
    st.difficulty = 'all';
  }
}

function selectDiff(d) {
  st.difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
  const el = document.getElementById('d-' + d);
  if (el) el.classList.add('selected');
}

// ────────────────────────────────────────────────
// FLIP MODE
// ────────────────────────────────────────────────
function goToFlipMode() {
  showScreen('flip-screen');
  selectFlipMode('random');
}

function selectFlipMode(m) {
  st.flipMode = m;
  document.getElementById('mode-random').classList.toggle('selected', m === 'random');
  document.getElementById('mode-select').classList.toggle('selected', m === 'select');
  document.getElementById('interval-row').style.display = m === 'random' ? '' : 'none';
}

function selectInterval(ms) {
  st.flipInterval = ms;
  [1, 2, 3, 5].forEach(k => {
    document.getElementById('int-' + k).classList.toggle('selected', { 1: 1000, 2: 2000, 3: 3500, 5: 5000 }[k] === ms);
  });
}

function confirmSettings() {
  setupRoom(st.playerMode === 'host');
}

// ────────────────────────────────────────────────
// ROOM
// ────────────────────────────────────────────────
function setupRoom(isHost) {
  showScreen('room-screen');
  document.getElementById('room-content').innerHTML =
    '<div class="loading"><div class="loading-spin"></div><span>データ取得中...</span></div>';
  document.getElementById('room-title').textContent = isHost ? 'ルーム作成' : '準備完了';
  document.getElementById('room-actions').style.display = 'none';

  pickWord().then(data => {
    st.answer = data.answer;
    st.charList = data.chars;

    if (isHost) {
      st.roomCode = generateRoomCode();
      document.getElementById('room-title').textContent = '📋 ルームコード';
      document.getElementById('room-content').innerHTML = `
        <div class="room-code">${st.roomCode}</div>
        <div class="text-sm text-center" style="margin-bottom:10px;">このコードを相手に伝えてください</div>
        <div class="players-list">
          <div class="player-item"><div class="player-dot"></div> あなた（ホスト）</div>
          <div class="player-item" id="guest-waiting" style="opacity:0.4;"><div class="player-dot red"></div> 参加待ち...</div>
        </div>
        <div class="text-sm text-center" style="margin-top:8px;color:var(--paper2);">※ デモではCPU対戦でシミュレート</div>`;
      document.getElementById('room-actions').style.display = 'flex';
      setTimeout(() => {
        const g = document.getElementById('guest-waiting');
        if (g) { g.innerHTML = '<div class="player-dot red"></div> プレイヤー2（接続済み）'; g.style.opacity = '1'; }
        showToast('プレイヤーが参加しました！', 'success');
      }, 2000);
    } else {
      document.getElementById('room-title').textContent = '✅ 準備完了';
      document.getElementById('room-content').innerHTML = `
        <div class="text-center" style="margin-bottom:12px;">
          <div style="font-size:2rem;margin-bottom:6px;">⚡</div>
          <div style="font-family:'Zen Antique Solid',serif;font-size:1rem;letter-spacing:0.2em;">${getQuizTypeLabel()} — ${getDiffLabel()}</div>
          <div class="text-sm" style="margin-top:5px;color:var(--paper2);">モード: ${getFlipModeLabel()}</div>
        </div>`;
      document.getElementById('room-actions').style.display = 'flex';
    }
  }).catch(() => {
    document.getElementById('room-content').innerHTML = `
      <div class="text-sm text-center" style="color:var(--red);">データ取得に失敗しました。</div>
      <div class="flex-gap mt-14"><button class="btn btn-dark btn-sm" onclick="confirmSettings()">再試行</button></div>`;
  });
}

function setupJoinRoom() {
  document.getElementById('room-title').textContent = 'ルームに参加';
  document.getElementById('room-content').innerHTML = `
    <span class="label-sm">▍ ルームコードを入力</span>
    <input class="input-field" id="join-code-input" type="text" maxlength="6" placeholder="000000" oninput="this.value=this.value.toUpperCase()"/>
    <div class="text-sm text-center mt-8" style="color:var(--paper2);">ホストから受け取ったコードを入力</div>`;
  document.getElementById('room-actions').style.display = 'flex';
  document.getElementById('room-start-btn').textContent = '参加する →';
  document.getElementById('room-start-btn').onclick = () => {
    const code = document.getElementById('join-code-input').value;
    if (code.length < 4) { showToast('コードを入力してください'); return; }
    showToast('接続中...', 'success');
    setTimeout(() => { st.roomCode = code; setupRoom(false); }, 1000);
  };
}

function startGameFromRoom() { initGame(); }
function restartGame() { setupRoom(false); }

// ────────────────────────────────────────────────
// PICK WORD (重複回避付き)
// ────────────────────────────────────────────────
async function pickWord() {
  let pool;
  if (st.quizType === 'kanji') {
    pool = KANJI_DB[st.difficulty] || KANJI_DB.sho;
  } else if (st.quizType === 'jukugo') {
    pool = JUKUGO_DB[st.difficulty] || JUKUGO_DB.all;
  } else {
    pool = YOJI_DB[st.difficulty] || YOJI_DB.all;
  }

  // Avoid recent repeats (keep last 10)
  const HISTORY_SIZE = 10;
  let candidates = pool.filter(w => !st.recentAnswers.includes(w));
  if (candidates.length === 0) {
    // All used — reset history
    st.recentAnswers = [];
    candidates = pool;
  }

  const w = candidates[Math.floor(Math.random() * candidates.length)];
  st.recentAnswers.push(w);
  if (st.recentAnswers.length > HISTORY_SIZE) st.recentAnswers.shift();

  return { answer: w, chars: [...w] };
}

// ────────────────────────────────────────────────
// LABELS
// ────────────────────────────────────────────────
function getQuizTypeLabel() {
  return { kanji: '漢字モード', jukugo: '熟語モード', yoji: '四字熟語モード' }[st.quizType];
}
function getFlipModeLabel() {
  return { random: 'ランダムフリップ', select: 'セレクトフリップ' }[st.flipMode];
}
function getDiffLabel() {
  const map = {
    sho: '小学校', chu: '中学校', ko: '高校・大学', dai: '超難問',
    k10: '漢検10級', k9: '漢検9級', k8: '漢検8〜7級', k7: '漢検7〜6級',
    k6: '漢検6〜5級', k4: '漢検4〜3級', k2: '漢検準2〜2級', k1: '漢検準1〜1級', all: '漢検総合'
  };
  return map[st.difficulty] || '--';
}

// ────────────────────────────────────────────────
// GAME INIT
// ────────────────────────────────────────────────
function initGame() {
  clearTimers();
  st.gameActive = true;
  st.currentPlayer = 0;
  st.players = st.playerMode === 'solo'
    ? [{ name: 'あなた', score: 0 }]
    : [{ name: 'あなた', score: 0 }, { name: 'CPU', score: 0 }];

  showScreen('game-screen');
  document.getElementById('answer-input').value = '';
  document.getElementById('answer-hint').textContent = '';
  document.getElementById('timer-chip').style.display = 'none';
  document.getElementById('timer-bar-wrap').classList.add('hidden');
  document.getElementById('turn-display').style.display = 'none';
  document.getElementById('score-board').classList.add('hidden');
  document.getElementById('mode-label').textContent = getFlipModeLabel();
  document.getElementById('diff-label').textContent = getDiffLabel();

  if (st.quizType === 'kanji') initKanjiGame();
  else initMultiGame();

  buildScoreBoard();
  setTimeout(() => document.getElementById('answer-input').focus(), 300);
}

// ────────────────────────────────────────────────
// KANJI MODE
// ────────────────────────────────────────────────
function initKanjiGame() {
  st.tiles = Array(64).fill(null).map(() => ({ open: false }));
  st.openedCount = 0;
  document.getElementById('kanji-grid-wrap').classList.remove('hidden');
  document.getElementById('multi-grids-outer').classList.add('hidden');
  document.getElementById('hidden-kanji').textContent = st.answer;
  document.getElementById('open-total').textContent = '64';
  buildKanjiGrid();
  updateOpenCount();
  if (st.flipMode === 'select') initSelect();
  else initRandom(90);
}

function buildKanjiGrid() {
  const g = document.getElementById('grid');
  g.innerHTML = '';
  for (let i = 0; i < 64; i++) g.appendChild(makeTile(i, 'k', i));
}

// ────────────────────────────────────────────────
// MULTI-CHAR MODE (熟語 / 四字熟語)
// 全グリッド同時にラウンドロビンでフリップ
// ────────────────────────────────────────────────
function initMultiGame() {
  const n = st.charList.length;
  st.charTiles = Array(n).fill(null).map(() => Array(64).fill(null).map(() => ({ open: false })));
  st.charOpenCount = Array(n).fill(0);
  st.totalTiles = n * 64;
  st.totalOpen = 0;

  document.getElementById('kanji-grid-wrap').classList.add('hidden');
  document.getElementById('multi-grids-outer').classList.remove('hidden');
  document.getElementById('open-total').textContent = String(st.totalTiles);
  buildMultiGrids();
  updateOpenCount();
  if (st.flipMode === 'select') initSelect();
  else initRandom(90 + n * 30);
}

function buildMultiGrids() {
  const row = document.getElementById('multi-grids-row');
  row.innerHTML = '';
  const n = st.charList.length;
  const maxW = Math.min(window.innerWidth - 32, 780);
  const gap = 8;
  const rawSize = Math.floor((maxW - (n - 1) * gap) / n);
  const size = Math.max(Math.min(rawSize, 180), 60);

  st.charList.forEach((ch, ci) => {
    const block = document.createElement('div');
    block.className = 'char-grid-block';

    const lbl = document.createElement('div');
    lbl.className = 'char-grid-label';
    lbl.textContent = `第${ci + 1}字`;
    block.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.className = 'char-grid-wrap';
    wrap.id = 'cgw-' + ci;
    wrap.style.cssText = `width:${size}px;height:${size}px;`;

    const hid = document.createElement('div');
    hid.className = 'char-hidden';
    const hidSpan = document.createElement('span');
    hidSpan.style.fontSize = Math.round(size * 0.86) + 'px';
    hidSpan.textContent = ch;
    hid.appendChild(hidSpan);
    wrap.appendChild(hid);

    const grid = document.createElement('div');
    grid.className = 'char-grid-el';
    grid.id = 'cgrid-' + ci;
    for (let i = 0; i < 64; i++) grid.appendChild(makeTile(i, 'j' + ci, i));
    wrap.appendChild(grid);
    block.appendChild(wrap);

    const cnt = document.createElement('div');
    cnt.className = 'char-open-count';
    cnt.id = 'ccount-' + ci;
    cnt.textContent = '0/64';
    block.appendChild(cnt);

    row.appendChild(block);
  });

  buildMultiProgress();
}

function buildMultiProgress() {
  const pr = document.getElementById('multi-progress');
  pr.innerHTML = '';
  st.charList.forEach((_, ci) => {
    const b = document.createElement('div');
    b.className = 'char-badge';
    b.id = 'cbadge-' + ci;
    b.textContent = '？';
    pr.appendChild(b);
  });
}

// ────────────────────────────────────────────────
// TILE FACTORY
// ────────────────────────────────────────────────
function makeTile(index, prefix, num) {
  const t = document.createElement('div');
  t.className = 'tile closed';
  t.dataset.index = index;
  const n = document.createElement('div');
  n.className = 'tile-num';
  n.textContent = num + 1;
  t.appendChild(n);
  t.addEventListener('click', () => onTileClick(prefix, index));
  return t;
}

// ────────────────────────────────────────────────
// TILE OPEN
// ────────────────────────────────────────────────
function openKanjiTile(i, animate = true) {
  if (st.tiles[i].open) return;
  st.tiles[i].open = true;
  st.openedCount++;
  animateTileOpen('#grid', i, animate);
  updateOpenCount();
}

function openCharTile(ci, i, animate = true) {
  if (st.charTiles[ci][i].open) return;
  st.charTiles[ci][i].open = true;
  st.charOpenCount[ci]++;
  st.totalOpen++;
  animateTileOpen('#cgrid-' + ci, i, animate);

  const cnt = document.getElementById('ccount-' + ci);
  if (cnt) cnt.textContent = st.charOpenCount[ci] + '/64';
  if (st.charOpenCount[ci] === 64) onCharFullyRevealed(ci);
  updateOpenCount();
}

function animateTileOpen(gridSelector, i, animate) {
  const el = document.querySelector(`${gridSelector} .tile[data-index="${i}"]`);
  if (!el) return;
  if (animate) {
    el.classList.add('flipping');
    setTimeout(() => {
      el.classList.remove('closed', 'flipping');
      el.classList.add('open', 'just-opened');
      el.innerHTML = '';
      setTimeout(() => el.classList.remove('just-opened'), 400);
    }, 140);
  } else {
    el.classList.remove('closed');
    el.classList.add('open');
    el.innerHTML = '';
  }
}

function onCharFullyRevealed(ci) {
  const wrap = document.getElementById('cgw-' + ci);
  if (wrap) wrap.classList.add('done-char');
  const badge = document.getElementById('cbadge-' + ci);
  if (badge) { badge.textContent = st.charList[ci]; badge.classList.add('revealed'); }
}

function updateOpenCount() {
  const c = st.quizType === 'kanji' ? st.openedCount : st.totalOpen;
  document.getElementById('open-count').textContent = c;
}

// ────────────────────────────────────────────────
// RANDOM FLIP (ラウンドロビン)
// ────────────────────────────────────────────────
function initRandom(timeSec) {
  document.getElementById('timer-chip').style.display = '';
  document.getElementById('timer-bar-wrap').classList.remove('hidden');
  st.timeLeft = timeSec;
  st._timerTotal = timeSec;
  updateTimerLabel(); updateTimerBar();
  startFlipTimer(); startCountdown();
}

function startFlipTimer() {
  let rrCursor = 0;

  st.flipTimer = setInterval(() => {
    if (!st.gameActive) return;

    if (st.quizType === 'kanji') {
      const closed = st.tiles.map((t, i) => t.open ? null : i).filter(x => x !== null);
      if (!closed.length) { clearInterval(st.flipTimer); return; }
      openKanjiTile(closed[Math.floor(Math.random() * closed.length)]);
    } else {
      // ラウンドロビン: 全文字を均等に開く
      const n = st.charList.length;
      let tries = 0;
      while (tries < n) {
        const ci = rrCursor % n;
        rrCursor = (rrCursor + 1) % n;
        const closed = st.charTiles[ci].map((t, i) => t.open ? null : i).filter(x => x !== null);
        if (closed.length) {
          openCharTile(ci, closed[Math.floor(Math.random() * closed.length)]);
          break;
        }
        tries++;
      }
      if (st.totalOpen >= st.totalTiles) clearInterval(st.flipTimer);
    }
  }, st.flipInterval);
}

function startCountdown() {
  st.countdownTimer = setInterval(() => {
    st.timeLeft--;
    updateTimerLabel(); updateTimerBar();
    if (st.timeLeft <= 0) { clearTimers(); if (st.gameActive) timeUp(); }
  }, 1000);
}

function updateTimerLabel() { document.getElementById('timer-label').textContent = st.timeLeft; }
function updateTimerBar() { document.getElementById('timer-bar').style.width = (st.timeLeft / st._timerTotal * 100) + '%'; }
function timeUp() { st.gameActive = false; showResult(false, 'タイムアップ！'); }

// ────────────────────────────────────────────────
// SELECT MODE
// ────────────────────────────────────────────────
function initSelect() {
  document.getElementById('turn-display').style.display = '';
  if (st.playerMode !== 'solo') {
    document.getElementById('score-board').classList.remove('hidden');
    renderScoreBoard();
  }
  updateTurnDisplay();
}

function updateTurnDisplay() {
  const p = st.players[st.currentPlayer];
  const td = document.getElementById('turn-display');
  td.textContent = `${p.name} のターン`;
  td.style.borderColor = st.currentPlayer === 0 ? 'var(--gold)' : 'var(--red)';
}

function nextTurn() {
  if (st.playerMode === 'solo') return;
  st.currentPlayer = (st.currentPlayer + 1) % st.players.length;
  updateTurnDisplay(); renderScoreBoard();
  if (st.currentPlayer === 1 && st.gameActive) setTimeout(cpuSelectTile, 700);
}

function cpuSelectTile() {
  if (!st.gameActive) return;
  if (st.quizType === 'kanji') {
    const closed = st.tiles.map((t, i) => t.open ? null : i).filter(x => x !== null);
    if (!closed.length) return;
    openKanjiTile(closed[Math.floor(Math.random() * closed.length)]);
    if (closed.length > 1) nextTurn();
  } else {
    const n = st.charList.length;
    const candidates = [];
    for (let ci = 0; ci < n; ci++) {
      st.charTiles[ci].map((t, i) => t.open ? null : i).filter(x => x !== null)
        .forEach(i => candidates.push({ ci, i }));
    }
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    openCharTile(pick.ci, pick.i);
    if (candidates.length > 1) nextTurn();
  }
}

// ────────────────────────────────────────────────
// TILE CLICK
// ────────────────────────────────────────────────
function onTileClick(prefix, i) {
  if (!st.gameActive || st.flipMode !== 'select') return;
  if (st.playerMode !== 'solo' && st.currentPlayer !== 0) {
    showToast('あなたのターンではありません'); return;
  }
  if (prefix === 'k') {
    if (st.tiles[i].open) return;
    openKanjiTile(i);
    if (st.playerMode !== 'solo') nextTurn();
  } else {
    const ci = parseInt(prefix.slice(1));
    if (st.charTiles[ci][i].open) return;
    openCharTile(ci, i);
    if (st.playerMode !== 'solo') nextTurn();
  }
}

// ────────────────────────────────────────────────
// ANSWER
// ────────────────────────────────────────────────
function submitAnswer() {
  if (!st.gameActive) return;
  const input = document.getElementById('answer-input').value.trim();
  if (!input) return;
  if (input === st.answer) {
    clearTimers(); st.gameActive = false;
    document.getElementById('answer-input').value = '';
    showResult(true, '正解！');
  } else {
    showToast('不正解... もう少し！');
    document.getElementById('answer-hint').textContent = `ヒント: ${st.answer.length}文字`;
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAnswer();
  });
});

function giveUp() {
  if (!st.gameActive) return;
  clearTimers(); st.gameActive = false;
  showResult(false, '降参...');
}

// ────────────────────────────────────────────────
// SCORE BOARD
// ────────────────────────────────────────────────
function buildScoreBoard() {
  const sb = document.getElementById('score-board');
  sb.innerHTML = '';
  st.players.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'score-card' + (idx === st.currentPlayer ? ' active' : '');
    card.id = 'score-card-' + idx;
    card.innerHTML = `<div class="score-name">${p.name}</div><div class="score-val">${p.score}</div>`;
    sb.appendChild(card);
  });
}

function renderScoreBoard() {
  st.players.forEach((p, idx) => {
    const c = document.getElementById('score-card-' + idx);
    if (!c) return;
    c.classList.toggle('active', idx === st.currentPlayer);
    c.querySelector('.score-val').textContent = p.score;
  });
}

// ────────────────────────────────────────────────
// RESULT
// ────────────────────────────────────────────────
function showResult(won, label) {
  if (st.quizType === 'kanji') {
    for (let i = 0; i < 64; i++) if (!st.tiles[i].open) {
      const el = document.querySelector(`#grid .tile[data-index="${i}"]`);
      if (el) { el.classList.remove('closed'); el.classList.add('open'); el.innerHTML = ''; }
    }
  } else {
    st.charList.forEach((_, ci) => {
      for (let i = 0; i < 64; i++) if (!st.charTiles[ci][i].open) {
        const el = document.querySelector(`#cgrid-${ci} .tile[data-index="${i}"]`);
        if (el) { el.classList.remove('closed'); el.classList.add('open'); el.innerHTML = ''; }
      }
      const wrap = document.getElementById('cgw-' + ci);
      if (wrap) wrap.classList.add('done-char');
      const badge = document.getElementById('cbadge-' + ci);
      if (badge) { badge.textContent = st.charList[ci]; badge.classList.add('revealed'); }
    });
  }

  showScreen('result-screen');
  const opened = st.quizType === 'kanji' ? st.openedCount : st.totalOpen;
  const total = st.quizType === 'kanji' ? 64 : st.totalTiles;
  document.getElementById('result-winner-text').textContent = won ? '🎊 正解！' : '💀 ' + label;
  document.getElementById('result-answer-display').textContent = st.answer;
  document.getElementById('result-sub').textContent = won
    ? `${total - opened} マス残して正解！`
    : `正解は「${st.answer}」でした`;
  if (won) launchConfetti();
}

// ────────────────────────────────────────────────
// CONFETTI
// ────────────────────────────────────────────────
function launchConfetti() {
  const c = document.getElementById('confetti');
  c.innerHTML = '';
  const cols = ['#c9a227', '#c0392b', '#2980b9', '#f5eed8', '#27ae60'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[Math.floor(Math.random() * cols.length)]};width:${6 + Math.random() * 8}px;height:${6 + Math.random() * 8}px;border-radius:${Math.random() > .5 ? '50%' : '0'};animation-duration:${1.5 + Math.random() * 2}s;animation-delay:${Math.random() * .8}s;`;
    c.appendChild(p);
  }
  setTimeout(() => c.innerHTML = '', 4000);
}

// ────────────────────────────────────────────────
// TOAST / UTILS
// ────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'success' ? ' success' : '');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), 2200);
}

function clearTimers() {
  clearInterval(st.flipTimer); clearInterval(st.countdownTimer);
  st.flipTimer = null; st.countdownTimer = null;
}

function generateRoomCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ────────────────────────────────────────────────
// BOOT
// ────────────────────────────────────────────────
selectFlipMode('random');
selectInterval(2000);
