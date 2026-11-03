const AVATARS = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐸', '🐯', '🐹', '🐻', '🦄', '🐧', '🐨'];
const SESSION_CLIENT_KEY = 'sameword_client_id';
const PROFILE_KEY = 'sameword_profile';
const LAST_RESULT_KEY = 'sameword_last_result';

const ICONS = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="8" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><path d="M12 12h9m-3 0v3m-3-3v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2c.6 5.2 3 7.5 8 8-5 .5-7.4 2.8-8 8-.6-5.2-3-7.5-8-8 5-.5 7.4-2.8 8-8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke="currentColor" stroke-width="1.6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 11 9-8 9 8M5.5 9.5V21h13V9.5M9 21v-6h6v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S3.8 15.7 3.8 9.6A4.6 4.6 0 0 1 8.4 5c1.8 0 3 1 3.6 2 .6-1 1.8-2 3.6-2a4.6 4.6 0 0 1 4.6 4.6C20.2 15.7 12 21 12 21Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function getSessionClientId() {
  let id = sessionStorage.getItem(SESSION_CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_CLIENT_KEY, id);
  }
  return id;
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional; the game still works without it.
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const savedProfile = readStorage(PROFILE_KEY, {});
const state = {
  screen: 'boot',
  modal: null,
  entryRoom: null,
  entry: null,
  room: null,
  clientId: getSessionClientId(),
  playerIndex: null,
  busy: false,
  profile: {
    name: String(savedProfile.name || ''),
    avatar: savedProfile.avatar || AVATARS[Math.floor(Math.random() * 6)]
  },
  gameAnswers: [],
  currentRound: 0,
  gameInput: '',
  waitingForOpponent: false,
  stream: null,
  pollTimer: null,
  showAllAnswers: false,
  resultShown: false,
  toastTimer: null
};

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toast = document.querySelector('#toast');

function persistProfile() {
  writeStorage(PROFILE_KEY, state.profile);
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2100);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '网络开小差了，再试一次');
  return data;
}

function brandHtml(compact = false) {
  return `
    <div class="brand">
      <span class="brand-mark"><i></i><i></i></span>
      <span>同词相见${compact ? '' : '<small>SAME WORD · SAME US</small>'}</span>
    </div>`;
}

function roomUrl(code) {
  const url = new URL(window.location.href);
  url.search = `?room=${encodeURIComponent(code)}`;
  url.hash = '';
  return url.toString();
}

function avatarPickerHtml(selected, scope) {
  return `<div class="avatar-picker">${AVATARS.map((avatar) => `
    <button type="button" class="avatar-option ${avatar === selected ? 'selected' : ''}" data-action="select-avatar" data-avatar="${avatar}" data-scope="${scope}" aria-label="选择头像 ${avatar}">${avatar}</button>
  `).join('')}</div>`;
}

function roundsHtml(selected) {
  return `<div class="segmented">
    ${[10, 20].map((rounds) => `<button type="button" class="segment ${rounds === selected ? 'selected' : ''}" data-action="select-rounds" data-rounds="${rounds}">${rounds} 题 · ${rounds === 10 ? '刚刚好' : '慢慢聊'}</button>`).join('')}
  </div>`;
}

function packHtml(selected) {
  const packs = [
    ['daily', '☀️', '日常词', '从周末、夏天这样的词出发'],
    ['spark', '🌙', '脑洞词', '从一个奇奇怪怪的念头出发']
  ];
  return `<div class="pack-grid">${packs.map(([value, emoji, title, copy]) => `
    <button type="button" class="pack-option ${value === selected ? 'selected' : ''}" data-action="select-pack" data-pack="${value}">
      <strong>${emoji} ${title}</strong>
      <small>${copy}</small>
    </button>
  `).join('')}</div>`;
}

function lastResultHtml() {
  const last = readStorage(LAST_RESULT_KEY, null);
  if (!last) return '';
  const detail = last.matchedWord
    ? `在「${last.matchedWord}」同词相见`
    : last.matched
      ? `在「${last.matched}」同词相见`
      : '十轮之后仍未同词';
  const badge = last.matchedWord || last.matched ? `第${last.round || '?'}轮` : '10轮';
  return `<div class="last-result-card">
    <div class="last-result-avatars"><span>${escapeHtml(last.avatars?.[0] || '🐶')}</span><span>${escapeHtml(last.avatars?.[1] || '🐱')}</span></div>
    <div class="last-result-copy"><strong>上次和 ${escapeHtml(last.partnerName || 'TA')} 的联想</strong><small>${escapeHtml(detail)}</small></div>
    <div class="last-result-score">${escapeHtml(badge)}</div>
  </div>`;
}

function renderHome() {
  state.screen = 'home';
  state.room = null;
  state.playerIndex = null;
  state.waitingForOpponent = false;
  state.gameAnswers = [];
  state.currentRound = 0;
  state.gameInput = '';
  closeRoomFeed();
  history.replaceState(null, '', window.location.pathname);
  document.title = '同词相见 · 默契挑战';

  app.innerHTML = `
    <div class="screen home-screen">
      <header class="topbar fade-up">
        ${brandHtml()}
        <div class="mini-capsule">默契挑战 <b><i></i><i></i><i></i></b></div>
      </header>

      <div class="home-content">
        <section class="hero-copy fade-up delay-1">
          <div class="eyebrow">A LITTLE GAME FOR TWO</div>
          <h1 class="hero-title">我们，会不会<br><em>想到同一个词？</em></h1>
          <p class="hero-subtitle">从同一个词出发，一轮轮写下联想<br>看看会在哪个词里，刚好相见。</p>
        </section>

        <div class="pair-stage fade-up delay-2" aria-hidden="true">
          <span class="word-bubble one">晚风</span>
          <span class="word-bubble two">小狗</span>
          <span class="word-bubble three">拥抱</span>
          <span class="word-bubble four">月亮</span>
          <div class="connection-line"></div>
          <div class="connection-heart">${ICONS.heart}</div>
          <div class="person person-a">${escapeHtml(state.profile.avatar)}<span class="name-tag">你</span></div>
          <div class="person person-b">🐱<span class="name-tag">TA</span></div>
        </div>
      </div>

      <div class="home-actions fade-up delay-3">
        ${lastResultHtml()}
        <button class="primary-button coral" type="button" data-action="open-create">
          <span>创建默契房间</span>${ICONS.arrow}
        </button>
        <div class="home-secondary-row">
          <button class="secondary-button" type="button" data-action="open-join">${ICONS.key}<span>输入房间号</span></button>
          <button class="secondary-button" type="button" data-action="how-to">${ICONS.spark}<span>怎么玩</span></button>
        </div>
        <p class="home-note">无需注册 <span></span> 最多 10 轮 <span></span> 同词即结束</p>
      </div>
    </div>`;
}

function modalBodyHtml() {
  const modal = state.modal;
  if (!modal) return '';
  if (modal.kind === 'rules') {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-heading">
        <div><h2>怎么玩？</h2><p>从同一个词开始，一轮轮靠近彼此。</p></div>
        <button class="close-button" type="button" data-action="close-modal" aria-label="关闭">${ICONS.close}</button>
      </div>
      <div class="rule-steps">
        <div class="rule-step"><b>01</b><div><strong>邀请一个人</strong><p>创建房间，把链接发给朋友、恋人或那个总和你拌嘴的人。</p></div></div>
        <div class="rule-step"><b>02</b><div><strong>从同一个词出发</strong><p>第一轮两个人看到同一个起始词，各自写下第一个联想到的词。</p></div></div>
        <div class="rule-step"><b>03</b><div><strong>一轮轮继续联想</strong><p>下一轮根据上一轮双方的两个词继续想。两人写出同一个词就结束，最多 10 轮。</p></div></div>
      </div>
      <button class="primary-button coral" type="button" data-action="open-create">知道了，去邀请</button>`;
  }

  if (modal.kind === 'join') {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-heading">
        <div><h2>加入房间</h2><p>输入对方发来的 4 位房间号。</p></div>
        <button class="close-button" type="button" data-action="close-modal" aria-label="关闭">${ICONS.close}</button>
      </div>
      <label class="field-label" for="join-code">房间号</label>
      <input id="join-code" class="code-field" data-field="modal-code" value="${escapeHtml(modal.code || '')}" maxlength="4" autocomplete="off" placeholder="ABCD" />
      <label class="field-label" for="join-name">你的昵称</label>
      <input id="join-name" class="text-field" data-field="modal-name" value="${escapeHtml(modal.name || '')}" maxlength="12" autocomplete="nickname" placeholder="TA 会这样看到你" />
      <div class="field-label">选一个头像 <span>之后还能换</span></div>
      ${avatarPickerHtml(modal.avatar, 'modal')}
      <p class="form-error ${modal.error ? 'visible' : ''}" id="form-error">${escapeHtml(modal.error || '')}</p>
      <button class="primary-button" type="button" data-action="join-room" ${modal.busy ? 'disabled' : ''}>
        ${modal.busy ? '<span class="button-spinner"></span><span>正在进入房间…</span>' : `<span>进入房间</span>${ICONS.arrow}`}
      </button>`;
  }

  return `
    <div class="sheet-handle"></div>
    <div class="sheet-heading">
      <div><h2>创建默契房间</h2><p>选一个起始词频道，再把邀请发给那个人。</p></div>
      <button class="close-button" type="button" data-action="close-modal" aria-label="关闭">${ICONS.close}</button>
    </div>
    <label class="field-label" for="create-name">你的昵称</label>
    <input id="create-name" class="text-field" data-field="modal-name" value="${escapeHtml(modal.name || '')}" maxlength="12" autocomplete="nickname" placeholder="写一个 TA 熟悉的称呼" />
    <div class="field-label">选一个头像 <span>见面先认脸</span></div>
    ${avatarPickerHtml(modal.avatar, 'modal')}
    <div class="round-limit-card"><strong>最多 10 轮</strong><span>每轮根据上一轮双方的两个词继续联想，双方写出同一个词就立即结束。</span></div>
    <div class="field-label">起始词频道 <span>每局随机</span></div>
    ${packHtml(modal.pack)}
    <p class="form-error ${modal.error ? 'visible' : ''}" id="form-error">${escapeHtml(modal.error || '')}</p>
    <button class="primary-button coral" type="button" data-action="create-room" ${modal.busy ? 'disabled' : ''}>
      ${modal.busy ? '<span class="button-spinner"></span><span>正在布置房间…</span>' : `<span>创建并邀请</span>${ICONS.arrow}`}
    </button>`;
}

function renderModal() {
  if (!state.modal) {
    modalRoot.innerHTML = '';
    return;
  }
  modalRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="backdrop-close">
      <section class="sheet" role="dialog" aria-modal="true">
        ${modalBodyHtml()}
      </section>
    </div>`;
}

function openModal(kind) {
  state.busy = false;
  state.modal = {
    kind,
    name: state.profile.name,
    avatar: state.profile.avatar,
    code: '',
    rounds: 10,
    pack: 'daily',
    busy: false,
    error: ''
  };
  renderModal();
  setTimeout(() => {
    const input = modalRoot.querySelector('.text-field, .code-field');
    if (input) input.focus({ preventScroll: true });
  }, 220);
}

function closeModal() {
  state.modal = null;
  renderModal();
}

function renderEntry(room) {
  state.screen = 'entry';
  state.entryRoom = room;
  state.entry = {
    code: room.code,
    name: state.profile.name,
    avatar: state.profile.avatar
  };
  closeRoomFeed();
  document.title = `${room.code} · 同词相见`;

  const host = room.players[0];
  const canJoin = room.status === 'waiting' && room.players.length < 2;
  const statusCopy = room.players.length >= 2
    ? '这个房间已经坐满了'
    : room.status !== 'waiting'
      ? '这场挑战已经开始啦'
      : '房间不存在或已经过期';

  app.innerHTML = canJoin ? `
    <div class="screen entry-screen">
      <header class="subpage-header">
        ${brandHtml(true)}
        <div class="room-code-pill">房间 <b>${escapeHtml(room.code)}</b></div>
      </header>
      <main class="entry-main fade-up">
        <div class="entry-kicker">YOU HAVE BEEN INVITED</div>
        <h1>TA 在等一个<br>和你相同的词</h1>
        <p>${escapeHtml(host.name)} 邀请你完成一场 ${room.rounds} 题的默契挑战。凭第一反应，别偷看答案。</p>
        <div class="host-card">
          <div class="host-card-top">
            <div class="mini-avatar">${escapeHtml(host.avatar)}</div>
            <div><strong>${escapeHtml(host.name)} 的房间</strong><small>${room.pack === 'spark' ? '脑洞频道' : '日常心动'} · 等你落座</small></div>
          </div>
          <div class="field-label">你的昵称</div>
          <input class="text-field" data-field="entry-name" value="${escapeHtml(state.entry.name)}" maxlength="12" placeholder="TA 会这样看到你" />
          <div class="field-label">选一个头像 <span>让 TA 认出你</span></div>
          ${avatarPickerHtml(state.entry.avatar, 'entry')}
        </div>
        <p class="form-error" id="entry-error"></p>
      </main>
      <button class="primary-button coral" type="button" data-action="join-room">${ICONS.heart}<span>进入房间</span>${ICONS.arrow}</button>
    </div>` : `
    <div class="screen entry-screen">
      <header class="subpage-header">${brandHtml(true)}<div class="room-code-pill">房间 <b>${escapeHtml(room.code)}</b></div></header>
      <main class="entry-main fade-up">
        <div class="entry-kicker">ROOM CLOSED</div>
        <h1>晚了一步，<br>这次没有空位了</h1>
        <p>${statusCopy}。你可以回到首页，创建一场只属于你们的新挑战。</p>
        <div class="host-card"><div class="host-card-top"><div class="mini-avatar">${escapeHtml(host.avatar)}</div><div><strong>${escapeHtml(host.name)} 的房间</strong><small>${statusCopy}</small></div></div></div>
      </main>
      <button class="primary-button" type="button" data-action="go-home">${ICONS.home}<span>回到首页</span></button>
    </div>`;
}

function renderMissingRoom(message) {
  state.screen = 'entry';
  closeRoomFeed();
  app.innerHTML = `
    <div class="screen entry-screen">
      <header class="subpage-header">${brandHtml(true)}</header>
      <main class="entry-main fade-up">
        <div class="entry-kicker">WHERE ARE YOU?</div>
        <h1>没有找到<br>这个房间</h1>
        <p>${escapeHtml(message || '链接可能已经过期，或者房间号写错了一位。')}</p>
      </main>
      <button class="primary-button coral" type="button" data-action="go-home">${ICONS.home}<span>去创建一间</span>${ICONS.arrow}</button>
    </div>`;
}

function closeRoomFeed() {
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function connectRoomFeed(code) {
  closeRoomFeed();
  if (!('EventSource' in window)) return;
  const source = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events`);
  source.addEventListener('state', (event) => {
    try {
      handleRoomState(JSON.parse(event.data));
    } catch {
      // Ignore malformed events and let polling recover.
    }
  });
  state.stream = source;
  state.pollTimer = setInterval(async () => {
    if (!state.room || state.screen === 'home') return;
    try {
      const room = await api(`/api/rooms/${encodeURIComponent(state.room.code)}?clientId=${encodeURIComponent(state.clientId)}`);
      handleRoomState(room);
    } catch {
      // The initial page already explains expired rooms; transient errors can recover.
    }
  }, 4500);
}

function enterRoom(payload) {
  if (payload.clientId) {
    state.clientId = payload.clientId;
    sessionStorage.setItem(SESSION_CLIENT_KEY, payload.clientId);
  }
  const room = payload.room;
  state.room = { ...room, you: payload.playerIndex ?? room.you ?? state.playerIndex };
  state.playerIndex = payload.playerIndex ?? room.you ?? state.playerIndex;
  state.waitingForOpponent = false;
  state.gameAnswers = [];
  state.currentRound = 0;
  state.gameInput = '';
  state.showAllAnswers = false;
  state.resultShown = false;
  history.replaceState(null, '', `?room=${encodeURIComponent(room.code)}`);
  connectRoomFeed(room.code);
  handleRoomState(room);
}

function playerCardHtml(player, index, empty = false) {
  if (empty) {
    return `<div class="player-card empty">
      <div class="player-avatar">?</div>
      <strong>还在路上</strong>
      <small>分享链接邀请 TA</small>
    </div>`;
  }
  return `<div class="player-card">
    <div class="player-avatar">${escapeHtml(player.avatar)}${index === 1 ? '<span class="ready-dot"></span>' : ''}</div>
    <strong>${escapeHtml(player.name)}${roomIsSelf(index) ? ' · 你' : ''}</strong>
    <small>${index === 0 ? '房间主人' : '已经落座'}</small>
  </div>`;
}

function roomIsSelf(index) {
  return Number(state.playerIndex) === Number(index);
}

function renderRoomLobby(room = state.room) {
  if (!room) return;
  state.screen = 'room';
  state.room = room;
  document.title = `等一个同频的人 · ${room.code}`;
  const bothHere = room.players.length === 2;
  const secondPlayer = room.players[1];
  const waitingText = bothHere ? '两个人都到齐了，准备好就一起开始' : '房间已经准备好了，只差 TA 推门进来';

  app.innerHTML = `
    <div class="screen room-screen">
      <header class="subpage-header fade-up">
        <span class="subpage-title">默契房间 · 最多 10 轮</span>
        <button class="room-code-pill" type="button" data-action="copy-room" aria-label="复制房间号">房间 <b>${escapeHtml(room.code)}</b></button>
      </header>

      <main class="room-main">
        <div class="room-heading fade-up delay-1">
          <div class="eyebrow">${bothHere ? 'TWO HEARTS READY' : 'WAITING FOR YOU'}</div>
          <h1>${bothHere ? '两个人都到齐了' : '等一个同频的人'}</h1>
          <p>${waitingText}</p>
        </div>

        <div class="connections fade-up delay-2">
          ${playerCardHtml(room.players[0], 0)}
          <div class="connection-dash"></div>
          ${playerCardHtml(secondPlayer, 1, !secondPlayer)}
        </div>

        <div class="waiting-copy fade-up delay-2">
          ${bothHere ? '<span>♥</span><span>默契正在加载</span>' : '<span>正在等 TA 推门进来</span><span class="waiting-dots"><i></i><i></i><i></i></span>'}
        </div>

        <div class="room-rules fade-up delay-3">
          <strong>这一局怎么玩</strong>
          <p>两个人从同一个起始词出发。每轮根据上一轮双方写下的两个词继续联想；如果这一轮写出同一个词就结束，否则进入下一轮，最多 10 轮。</p>
        </div>
      </main>

      <div class="room-actions fade-up delay-3">
        ${bothHere
          ? `<button class="primary-button coral" type="button" data-action="start-game"><span>一起开始</span>${ICONS.arrow}</button>`
          : `<button class="primary-button coral" type="button" data-action="share-room">${ICONS.share}<span>邀请 TA 来同词相见</span></button>`}
        <div class="share-row" style="margin-top: 9px">
          <button class="secondary-button" type="button" data-action="${bothHere ? 'share-room' : 'copy-room'}">${bothHere ? ICONS.share : ICONS.copy}<span>${bothHere ? '分享房间链接' : '复制房间号'}</span></button>
          <button class="share-code-button" type="button" data-action="how-to">玩法</button>
        </div>
      </div>
    </div>`;
}

function opponentIndex(room = state.room) {
  if (Number(state.playerIndex) === 0) return 1;
  if (Number(state.playerIndex) === 1) return 0;
  return 0;
}

function opponentStatusText(room = state.room) {
  const opponent = room?.players?.[opponentIndex(room)];
  if (!opponent) return '等待 TA 加入';
  if (opponent.submittedThisRound) return `${opponent.name} 已经想好，等你`;
  return `${opponent.name} 正在想`;
}

function renderGame() {
  const room = state.room;
  if (!room || room.status !== 'playing') return;
  state.screen = 'game';
  state.currentRound = room.currentRound || 1;
  const round = state.currentRound;
  const previous = room.history?.[room.history.length - 1];
  const baseWords = round === 1 ? [room.seed] : (previous?.answers || []);
  const progress = Math.round(((round - 1) / room.rounds) * 100);
  const dots = Array.from({ length: room.rounds }, (_, index) => `<i class="${index + 1 < round ? 'done' : index + 1 === round ? 'current' : ''}"></i>`).join('');
  const sourceHtml = round === 1
    ? `<span class="soft">这一局，两个人都从</span><br><span class="prompt-word">「${escapeHtml(room.seed)}」</span><br><span class="soft">开始</span>`
    : `<div class="chain-source">
        <span class="chain-source-word">${escapeHtml(baseWords[0] || '')}</span>
        <span class="chain-plus">+</span>
        <span class="chain-source-word">${escapeHtml(baseWords[1] || '')}</span>
      </div>`;
  const question = round === 1
    ? '各自写下第一个联想到的词'
    : '这两个词，让你们各自想到什么？';

  document.title = `第 ${round} 轮 · 同词相见`;
  app.innerHTML = `
    <div class="screen game-screen">
      <header class="game-top fade-up">
        <div class="game-round-count"><span>${String(round).padStart(2, '0')}</span> / ${room.rounds}</div>
        <div class="opponent-live"><i class="live-dot"></i><span>${escapeHtml(opponentStatusText(room))}</span></div>
      </header>
      <div class="progress-track fade-up"><div class="progress-fill" style="width: ${progress}%"></div></div>

      <main class="prompt-area">
        <section class="prompt-card fade-up delay-1" aria-labelledby="prompt-text">
          <div class="prompt-meta">
            <span class="prompt-kicker">${round === 1 ? '起始词' : `第 ${round - 1} 轮`}</span>
            <span class="prompt-index">ROUND ${String(round).padStart(2, '0')}</span>
          </div>
          <div class="prompt-sentence" id="prompt-text">${sourceHtml}</div>
          <div class="chain-question">${question}</div>
          <p class="prompt-hint">凭第一反应。两个人写出同一个词，这一局就结束。</p>
        </section>
      </main>

      <form class="answer-form fade-up delay-2" id="answer-form" autocomplete="off">
        <div class="answer-input-wrap">
          <input class="answer-input" id="answer-input" data-field="game-input" value="${escapeHtml(state.gameInput)}" maxlength="10" placeholder="只写一个词…" enterkeyhint="done" autocomplete="off" />
          <button class="answer-submit" type="submit" ${state.gameInput.trim() ? '' : 'disabled'}>就是它</button>
        </div>
        <div class="answer-foot">
          <span>同词结束 · 不一样就进入下一轮</span>
          <span class="round-dots">${dots}</span>
        </div>
      </form>
    </div>`;
  setTimeout(() => {
    const input = document.querySelector('#answer-input');
    if (input && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
  }, 100);
}

function beginGame(room) {
  state.room = { ...room, you: room.you ?? state.room?.you ?? state.playerIndex };
  state.playerIndex = room.you ?? state.room?.you ?? state.playerIndex;
  state.currentRound = room.currentRound || 1;
  state.gameInput = '';
  state.turnAnswer = '';
  state.turnSubmitted = false;
  state.submitError = '';
  renderGame();
}

function syncGameLive(room) {
  const live = document.querySelector('.opponent-live span');
  if (live) live.textContent = opponentStatusText(room);
  const waitingCopy = document.querySelector('[data-wait-copy]');
  if (waitingCopy) {
    const opponent = room.players[opponentIndex(room)];
    waitingCopy.textContent = opponent?.submittedThisRound
      ? 'TA 也已经写好了，正在揭晓这一轮。'
      : `正在等 ${opponent?.name || 'TA'} 写下这一轮的词。先别催，灵感需要两秒钟。`;
  }
}

async function submitCurrentAnswer() {
  const word = String(state.gameInput || '').trim();
  if (!word || !state.room || state.turnSubmitted) return;
  if (word.length > 10) {
    showToast('最多写 10 个字');
    return;
  }
  state.turnAnswer = word;
  state.turnSubmitted = true;
  state.gameInput = '';
  state.submitError = '';
  renderWaiting();
  await sendTurn(word);
}

async function sendTurn(word = state.turnAnswer) {
  if (!state.room || !word) return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/turn`, {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, word })
    });
    state.submitError = '';
    handleRoomState(data.room);
  } catch (error) {
    state.submitError = error.message;
    renderWaiting();
  }
}

async function retryTurn() {
  if (!state.room || !state.turnAnswer) return;
  state.submitError = '';
  renderWaiting();
  await sendTurn(state.turnAnswer);
}

function renderWaiting() {
  const room = state.room;
  if (!room) return;
  state.screen = 'waiting';
  const me = room.players[state.playerIndex] || room.players[0];
  const opponent = room.players[opponentIndex(room)];
  const opponentReady = opponent?.submittedThisRound;
  const error = state.submitError;
  const word = state.turnAnswer || me?.currentAnswer || '';
  document.title = `第 ${room.currentRound} 轮等待中 · 同词相见`;

  app.innerHTML = `
    <div class="screen waiting-screen">
      <header class="subpage-header fade-up">
        ${brandHtml(true)}
        <div class="room-code-pill">第 <b>${room.currentRound}</b> / ${room.rounds} 轮</div>
      </header>
      <main class="waiting-main">
        <div class="waiting-orbit fade-up">
          <div class="waiting-avatar">${escapeHtml(me.avatar)}<span class="heart-badge">♥</span></div>
        </div>
        <div class="submitted-word fade-up delay-1">${error ? '提交遇到问题' : '你写的是'}<strong>「${escapeHtml(word)}」</strong></div>
        <h1 class="fade-up delay-1">${error ? '还差一点点' : '等 TA 写下这一轮'}</h1>
        <p class="fade-up delay-2" data-wait-copy>${error ? escapeHtml(error) : opponentReady ? 'TA 也已经写好了，正在揭晓这一轮。' : `正在等 ${escapeHtml(opponent?.name || 'TA')} 写下这一轮的词。先别催，灵感需要两秒钟。`}</p>
        <div class="waiting-card fade-up delay-3"><span>本轮</span><b>${room.currentRound} / ${room.rounds}</b><span>·</span><span data-live-count>${escapeHtml(opponentStatusText(room))}</span></div>
        ${error ? '<button class="primary-button coral" type="button" data-action="retry-submit" style="margin-top: 20px; width: auto; padding: 0 24px">重新提交</button>' : ''}
      </main>
      <div class="waiting-copy fade-up delay-3"><span class="waiting-dots"><i></i><i></i><i></i></span><span>${opponentReady ? '正在揭晓这一轮' : '不一样的词，会带你们去下一轮'}</span></div>
    </div>`;
}

async function startGame() {
  if (!state.room) return;
  const button = document.querySelector('[data-action="start-game"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner"></span><span>正在开始…</span>';
  }
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.room.code)}/start`, {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId })
    });
    handleRoomState(data.room);
  } catch (error) {
    showToast(error.message);
    if (button) {
      button.disabled = false;
      button.innerHTML = `<span>一起开始</span>${ICONS.arrow}`;
    }
  }
}

async function shareRoom() {
  if (!state.room) return;
  const url = roomUrl(state.room.code);
  const text = `我在「同词相见」等你，看看我们会不会想到同一个词。房间号：${state.room.code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: '同词相见 · 默契挑战', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyText(url, '房间链接已复制');
}

async function copyText(text, successMessage = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast(successMessage);
  }
}

function normalizeWord(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,!?;:'"“”‘’、，。！？；：·…—–\-（）()【】\[\]{}《》<>]/g, '');
}

function resultLevel(result) {
  if (!result.matched) return {
    title: '十轮之后，仍然各自精彩',
    copy: '你们没有在十轮内写出同一个词，但这条联想轨迹已经记录了两个人完全不同的脑回路。'
  };
  if (result.reachedRound <= 2) return {
    title: '第一眼，就同频',
    copy: `只用了 ${result.reachedRound} 轮，你们就在「${result.matchedWord}」相遇。有些默契真的不用解释。`
  };
  if (result.reachedRound <= 5) return {
    title: '绕了几步，刚好遇见',
    copy: `在第 ${result.reachedRound} 轮，你们同时写下了「${result.matchedWord}」。每一次联想，都在悄悄靠近。`
  };
  return {
    title: '兜兜转转，还是同频',
    copy: `走到第 ${result.reachedRound} 轮，你们终于一起想到了「${result.matchedWord}」。这条线索只属于你们。`
  };
}

function calculateResult(room) {
  const history = room.history || [];
  const last = history[history.length - 1];
  return {
    history,
    matched: Boolean(last?.matched),
    matchedWord: last?.matched ? last.answers[0] : '',
    reachedRound: last?.round || room.currentRound || 1,
    maxRounds: room.rounds || 10
  };
}

function saveLastResult(result) {
  const room = state.room;
  if (!room) return;
  const me = room.players[state.playerIndex] || room.players[0];
  const opponent = room.players[opponentIndex(room)] || room.players[1];
  writeStorage(LAST_RESULT_KEY, {
    matched: result.matched,
    matchedWord: result.matchedWord,
    round: result.reachedRound,
    partnerName: opponent?.name || 'TA',
    avatars: [me?.avatar || '🐶', opponent?.avatar || '🐱'],
    at: Date.now()
  });
}

function historyRowsHtml(result) {
  const room = state.room;
  const playerA = room?.players?.[0];
  const playerB = room?.players?.[1];
  const seedRow = `<div class="chain-seed"><span>起始词</span><strong>${escapeHtml(room?.seed || '')}</strong></div>`;
  const rounds = result.history.map((round) => {
    const base = (round.baseWords || []).map((word) => `<em>${escapeHtml(word)}</em>`).join('<i>+</i>');
    return `<article class="chain-round ${round.matched ? 'matched' : ''}">
      <div class="chain-round-head"><b>ROUND ${String(round.round).padStart(2, '0')}</b><span>${round.matched ? '同词相见' : '继续联想'}</span></div>
      <div class="chain-base"><span>从</span>${base}</div>
      <div class="chain-answer-row">
        <div><small>${escapeHtml(playerA?.name || 'A')}</small><strong>${escapeHtml(round.answers[0])}</strong></div>
        <span class="chain-result-mark">${round.matched ? '♥' : '≠'}</span>
        <div><small>${escapeHtml(playerB?.name || 'B')}</small><strong>${escapeHtml(round.answers[1])}</strong></div>
      </div>
    </article>`;
  }).join('');
  return seedRow + rounds;
}

function launchConfetti() {
  const old = document.querySelector('.confetti-layer');
  if (old) old.remove();
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const colors = ['#f26157', '#f6ce66', '#97bfd2', '#a9c5a5', '#fffdf8', '#dc4e45'];
  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${2.3 + Math.random() * 1.8}s`;
    piece.style.setProperty('--drift', `${-90 + Math.random() * 180}px`);
    piece.style.setProperty('--spin', `${360 + Math.random() * 720}deg`);
    if (index % 3 === 0) piece.style.borderRadius = '50%';
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4300);
}

function renderResults(room = state.room) {
  if (!room) return;
  state.screen = 'results';
  state.room = room;
  closeRoomFeed();
  document.title = '我们的同词相见报告';
  const result = calculateResult(room);
  const level = resultLevel(result);
  const me = room.players[state.playerIndex] || room.players[0];
  const opponent = room.players[opponentIndex(room)] || room.players[1];
  saveLastResult(result);
  const shouldCelebrate = !state.resultShown && result.matched;
  state.resultShown = true;

  app.innerHTML = `
    <div class="screen result-screen">
      <header class="result-top fade-up">
        ${brandHtml(true)}
        <button class="icon-button" type="button" data-action="go-home" aria-label="回到首页">${ICONS.close}</button>
      </header>

      <main>
        <section class="result-hero fade-up delay-1">
          <div class="result-eyebrow">YOUR WORD-CHAIN REPORT</div>
          <div class="result-score-wrap">
            <div class="result-ring" style="--score-angle: ${result.matched ? 100 : Math.round((result.reachedRound / result.maxRounds) * 100)}%"></div>
            <div class="result-score">${String(result.reachedRound).padStart(2, '0')}<span>轮</span></div>
          </div>
          <div class="result-avatars">
            <span class="result-avatar">${escapeHtml(me?.avatar || '🐶')}</span>
            <b>×</b>
            <span class="result-avatar">${escapeHtml(opponent?.avatar || '🐱')}</span>
          </div>
          <h1>${level.title}</h1>
          <p>${level.copy}</p>
        </section>

        <section class="match-section fade-up delay-2">
          <div class="section-title">
            <strong>${result.matched ? `第 ${result.reachedRound} 轮，同词相见` : `${result.maxRounds} 轮结束，仍未同词`}</strong>
            <span>${escapeHtml(me?.name || '你')} × ${escapeHtml(opponent?.name || 'TA')}</span>
          </div>
          ${result.matched
            ? `<div class="match-chips"><span class="match-chip">${escapeHtml(result.matchedWord)}<small>第 ${result.reachedRound} 轮</small></span></div>`
            : '<div class="no-match-card">没有相同的词，不代表没有默契。至少你们一起走完了十条完全不同的联想路径。</div>'}
        </section>

        <section class="history-list fade-up delay-3" aria-label="完整联想过程">
          ${historyRowsHtml(result)}
        </section>

        <div class="result-actions fade-up delay-3">
          <button class="primary-button coral" type="button" data-action="play-again">${ICONS.spark}<span>再玩一局</span></button>
          <button class="secondary-button" type="button" data-action="share-result">${ICONS.share}<span>分享结果</span></button>
        </div>
      </main>
    </div>`;

  if (shouldCelebrate) launchConfetti();
}

async function shareResult() {
  if (!state.room) return;
  const result = calculateResult(state.room);
  const base = `${window.location.origin}${window.location.pathname}`;
  const text = result.matched
    ? `我们在「同词相见」走到第 ${result.reachedRound} 轮，同时写下了「${result.matchedWord}」。你也来和在意的人试试：${base}`
    : `我们在「同词相见」联想到了第 ${result.reachedRound} 轮，还是没撞到同一个词。你也来试试：${base}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: '我们的同词相见报告', text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyText(text, '联想报告已复制');
}

async function createRoomWith(name, avatar, rounds, pack) {
  const data = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name, avatar, rounds, pack })
  });
  state.profile.name = name;
  state.profile.avatar = avatar;
  persistProfile();
  closeModal();
  enterRoom(data);
}

async function playAgain() {
  if (!state.room) return;
  const button = document.querySelector('[data-action="play-again"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner"></span><span>正在开新房…</span>';
  }
  const me = state.room.players[state.playerIndex] || state.room.players[0];
  try {
    await createRoomWith(me.name, me.avatar, state.room.rounds, state.room.pack);
  } catch (error) {
    showToast(error.message);
    if (button) {
      button.disabled = false;
      button.innerHTML = `${ICONS.spark}<span>再玩一局</span>`;
    }
  }
}

function handleRoomState(room) {
  if (!room) return;
  const previousYou = state.room?.you ?? state.playerIndex;
  const previousStatus = state.room?.status;
  const previousPlayerCount = state.room?.players?.length || 0;
  const previousRound = state.room?.currentRound;
  state.room = { ...room, you: room.you ?? previousYou };
  if (room.you !== undefined) state.playerIndex = room.you;

  if (room.status === 'waiting') {
    const rosterChanged = previousStatus !== 'waiting' || previousPlayerCount !== room.players.length;
    if (state.screen !== 'room' || rosterChanged) renderRoomLobby(state.room);
    return;
  }

  if (room.status === 'playing') {
    const roundChanged = previousRound !== room.currentRound || state.currentRound !== room.currentRound;
    state.currentRound = room.currentRound;
    const me = room.players[state.playerIndex];
    if (roundChanged) {
      state.gameInput = '';
      state.turnAnswer = '';
      state.submitError = '';
    }
    if (me?.submittedThisRound) {
      state.turnSubmitted = true;
      state.turnAnswer = me.currentAnswer || state.turnAnswer;
      if (state.screen !== 'waiting') renderWaiting();
      else syncGameLive(state.room);
      return;
    }
    state.turnSubmitted = false;
    if (state.screen === 'room' || state.screen === 'entry' || state.screen === 'waiting' || roundChanged) {
      renderGame();
    } else if (state.screen === 'game') {
      syncGameLive(state.room);
    }
    return;
  }

  if (room.status === 'results' && state.screen !== 'results') {
    renderResults(state.room);
  }
}

function toggleSelected(elements, activeElement) {
  elements.forEach((element) => element.classList.toggle('selected', element === activeElement));
}

async function handleJoin(scope) {
  const isEntry = scope === 'entry';
  if (!isEntry && state.modal?.busy) return;
  if (isEntry && document.querySelector('[data-action="join-room"]')?.disabled) return;
  const form = isEntry ? state.entry : state.modal;
  const name = String(form?.name || '').trim();
  const code = String(form?.code || '').trim().toUpperCase();
  if (!name) {
    if (isEntry) {
      const error = document.querySelector('#entry-error');
      error.textContent = '先写一个昵称，让 TA 认出你。';
      error.classList.add('visible');
      document.querySelector('[data-field="entry-name"]')?.focus();
    } else {
      state.modal.error = '先写一个昵称，让 TA 认出你。';
      renderModal();
    }
    return;
  }
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    if (isEntry) {
      const error = document.querySelector('#entry-error');
      error.textContent = '房间号应该是 4 位字母或数字。';
      error.classList.add('visible');
    } else {
      state.modal.error = '房间号应该是 4 位字母或数字。';
      renderModal();
    }
    return;
  }

  if (isEntry) {
    const button = document.querySelector('[data-action="join-room"]');
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner"></span><span>正在进入房间…</span>';
    const error = document.querySelector('#entry-error');
    error.classList.remove('visible');
  } else {
    state.modal.busy = true;
    state.modal.error = '';
    renderModal();
  }

  try {
    const payload = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify({ clientId: state.clientId, name, avatar: form.avatar })
    });
    state.profile.name = name;
    state.profile.avatar = form.avatar || state.profile.avatar;
    persistProfile();
    closeModal();
    enterRoom(payload);
  } catch (error) {
    if (isEntry) {
      const message = document.querySelector('#entry-error');
      message.textContent = error.message;
      message.classList.add('visible');
      const button = document.querySelector('[data-action="join-room"]');
      if (button) {
        button.disabled = false;
        button.innerHTML = `${ICONS.heart}<span>进入房间</span>${ICONS.arrow}`;
      }
    } else {
      state.modal.busy = false;
      state.modal.error = error.message;
      renderModal();
    }
  }
}

async function handleCreate() {
  const modal = state.modal;
  if (!modal) return;
  if (modal.busy) return;
  const name = String(modal.name || '').trim();
  if (!name) {
    state.modal.error = '先写一个昵称，再邀请对方。';
    renderModal();
    return;
  }
  state.modal.busy = true;
  state.modal.error = '';
  renderModal();
  try {
    await createRoomWith(name, modal.avatar, modal.rounds, modal.pack);
  } catch (error) {
    state.modal.busy = false;
    state.modal.error = error.message;
    renderModal();
  }
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const code = String(params.get('room') || '').trim().toUpperCase();
  if (!code) {
    renderHome();
    return;
  }
  try {
    const room = await api(`/api/rooms/${encodeURIComponent(code)}?clientId=${encodeURIComponent(state.clientId)}`);
    if (room.you !== undefined) {
      enterRoom({ room, clientId: state.clientId, playerIndex: room.you });
    } else {
      renderEntry(room);
    }
  } catch (error) {
    renderMissingRoom(error.message);
  }
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;

  if (action === 'backdrop-close') {
    if (event.target === trigger) closeModal();
    return;
  }

  if (action === 'close-modal') return closeModal();
  if (action === 'open-create') {
    closeModal();
    return openModal('create');
  }
  if (action === 'open-join') {
    closeModal();
    return openModal('join');
  }
  if (action === 'how-to') return openModal('rules');
  if (action === 'go-home') return renderHome();
  if (action === 'copy-room') {
    if (!state.room) return;
    await copyText(state.room.code, `房间号 ${state.room.code} 已复制`);
    return;
  }
  if (action === 'share-room') return shareRoom();
  if (action === 'start-game') return startGame();
  if (action === 'retry-submit') return retryTurn();
  if (action === 'play-again') return playAgain();
  if (action === 'share-result') return shareResult();
  if (action === 'create-room') return handleCreate();
  if (action === 'join-room') return handleJoin(state.screen === 'entry' ? 'entry' : 'modal');

  if (action === 'select-avatar') {
    const scope = trigger.dataset.scope;
    const avatar = trigger.dataset.avatar;
    if (scope === 'entry' && state.entry) {
      state.entry.avatar = avatar;
      toggleSelected(trigger.parentElement.querySelectorAll('.avatar-option'), trigger);
    } else if (state.modal) {
      state.modal.avatar = avatar;
      toggleSelected(trigger.parentElement.querySelectorAll('.avatar-option'), trigger);
    }
    return;
  }

  if (action === 'select-rounds' && state.modal) {
    state.modal.rounds = Number(trigger.dataset.rounds);
    toggleSelected(trigger.parentElement.querySelectorAll('.segment'), trigger);
    return;
  }

  if (action === 'select-pack' && state.modal) {
    state.modal.pack = trigger.dataset.pack;
    toggleSelected(trigger.parentElement.querySelectorAll('.pack-option'), trigger);
  }
});

document.addEventListener('input', (event) => {
  const field = event.target.dataset.field;
  if (!field) return;

  if (field === 'modal-name' && state.modal) state.modal.name = event.target.value;
  if (field === 'modal-code' && state.modal) {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    state.modal.code = event.target.value;
  }
  if (field === 'entry-name' && state.entry) state.entry.name = event.target.value;
  if (field === 'game-input') {
    state.gameInput = event.target.value;
    const submit = document.querySelector('.answer-submit');
    if (submit) submit.disabled = !state.gameInput.trim();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) closeModal();
  if (event.key !== 'Enter') return;
  const field = event.target.dataset.field;
  if (field === 'modal-code' && state.modal?.kind === 'join') {
    event.preventDefault();
    handleJoin('modal');
  }
  if (field === 'modal-name' && state.modal) {
    event.preventDefault();
    if (state.modal.kind === 'join') handleJoin('modal');
    if (state.modal.kind === 'create') handleCreate();
  }
  if (field === 'entry-name') {
    event.preventDefault();
    handleJoin('entry');
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'answer-form') return;
  event.preventDefault();
  submitCurrentAnswer();
});

boot();



