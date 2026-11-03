import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const listeners = new Map();
const MAX_ANSWERS = 10;

const PROMPTS = {
  daily: [
    ['夏天', '季节'], ['下雨天', '天气'], ['深夜', '时刻'], ['火锅', '食物'],
    ['海边', '地点'], ['旅行', '出发'], ['周末', '休息'], ['生日', '纪念'],
    ['耳机', '随身'], ['第一场雪', '季节'], ['小猫', '动物'], ['便利店', '城市'],
    ['被窝', '休息'], ['下班', '时刻'], ['月亮', '夜晚'], ['咖啡', '饮品'],
    ['公园', '地点'], ['电影', '娱乐'], ['秋天的风', '季节'], ['童年', '回忆'],
    ['大学', '回忆'], ['清晨', '时刻'], ['蛋糕', '食物'], ['拥抱', '心动'],
    ['争吵', '关系'], ['告别', '关系'], ['回家', '地点'], ['手机没电', '日常'],
    ['一个人', '状态'], ['好朋友', '关系'], ['第一条消息', '心动'], ['一起散步', '约会']
  ],
  spark: [
    ['如果明天是世界末日', '假如'], ['突然拥有超能力', '假如'], ['捡到一只会说话的猫', '奇遇'],
    ['时间暂停一小时', '假如'], ['可以瞬间移动', '假如'], ['变成透明人', '假如'],
    ['可以读懂人心', '假如'], ['回到十八岁', '假如'], ['一夜暴富', '假如'],
    ['和喜欢的人困在孤岛', '奇遇'], ['见到十年后的自己', '假如'], ['可以删除一段记忆', '假如'],
    ['全世界只剩你一个人', '假如'], ['收到一封来自未来的信', '奇遇'], ['穿越到古代', '假如'],
    ['拥有一扇任意门', '假如'], ['一觉醒来变成猫', '奇遇'], ['最后一天上班', '假如'],
    ['突然长出一双翅膀', '奇遇'], ['在月球上散步', '奇遇'], ['忘记带手机出门', '日常'],
    ['电梯里只有你和喜欢的人', '心动'], ['拥有一个秘密基地', '奇遇'], ['所有人都会读心术', '假如'],
    ['醒来发现时间循环', '奇遇'], ['可以去任何一部电影里', '假如'], ['明天不用早起', '日常'],
    ['收到一束匿名花', '心动'], ['在陌生城市迷路', '奇遇'], ['听到一首熟悉的歌', '日常'],
    ['发现朋友的小秘密', '关系'], ['和十年后的朋友吃饭', '关系']
  ]
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function randomId() {
  return crypto.randomUUID();
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makePrompts(pack, rounds) {
  const source = PROMPTS[pack] || PROMPTS.daily;
  const shuffled = [...source];
  const random = mulberry32(Date.now() + Math.floor(Math.random() * 100000));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, rounds).map(([text, kicker], index) => ({ id: index + 1, text, kicker }));
}

function cleanName(value, fallback = '玩家') {
  const name = String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 12);
  return name || fallback;
}

function cleanAvatar(value) {
  const avatar = String(value || '').trim().slice(0, 8);
  return avatar || '🐶';
}

function normalizeAnswers(input, rounds) {
  if (!Array.isArray(input) || input.length !== rounds) throw new Error('答案数量不正确');
  return input.map((word) => String(word || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, MAX_ANSWERS));
}

function publicRoom(room, clientId) {
  const you = room.players.findIndex((player) => player.id === clientId);
  return {
    code: room.code,
    status: room.status,
    rounds: room.rounds,
    pack: room.pack,
    prompts: room.prompts,
    createdAt: room.createdAt,
    players: room.players.map((player) => ({
      name: player.name,
      avatar: player.avatar,
      answerCount: player.progress ?? player.answers?.length ?? 0,
      submitted: Boolean(player.submittedAt),
      answers: room.status === 'results' ? player.answers : undefined
    })),
    you: you >= 0 ? you : undefined
  };
}

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = `event: state\ndata: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const res of listeners.get(code) || []) {
    res.write(payload);
  }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('请求内容过大');
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('请求格式不正确');
  }
}

function findRoom(code) {
  return rooms.get(String(code || '').toUpperCase());
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const code = parts[2]?.toUpperCase();

  try {
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(req);
      const rounds = Number(body.rounds) === 20 ? 20 : 10;
      const pack = body.pack === 'spark' ? 'spark' : 'daily';
      const room = {
        code: randomCode(),
        status: 'waiting',
        rounds,
        pack,
        prompts: makePrompts(pack, rounds),
        createdAt: Date.now(),
        players: [{
          id: randomId(),
          name: cleanName(body.name),
          avatar: cleanAvatar(body.avatar),
          answers: [],
          progress: 0,
          submittedAt: null
        }]
      };
      rooms.set(room.code, room);
      return json(res, 201, { clientId: room.players[0].id, playerIndex: 0, room: publicRoom(room, room.players[0].id) });
    }

    if (req.method === 'POST' && parts[1] === 'rooms' && parts[3] === 'join') {
      const room = findRoom(code);
      if (!room) return json(res, 404, { error: '房间不存在或已过期' });
      const body = await readBody(req);
      const existing = room.players.findIndex((player) => player.id === body.clientId);
      if (existing >= 0) {
        return json(res, 200, { clientId: body.clientId, playerIndex: existing, room: publicRoom(room, body.clientId) });
      }
      if (room.status !== 'waiting') return json(res, 409, { error: '这场挑战已经开始啦' });
      if (room.players.length >= 2) return json(res, 409, { error: '房间里已经有两个人了' });
      const player = {
        id: randomId(),
        name: cleanName(body.name, '神秘朋友'),
        avatar: cleanAvatar(body.avatar),
        answers: [],
        progress: 0,
        submittedAt: null
      };
      room.players.push(player);
      broadcast(room.code);
      return json(res, 201, { clientId: player.id, playerIndex: 1, room: publicRoom(room, player.id) });
    }

    const room = findRoom(code);
    if (!room) return json(res, 404, { error: '房间不存在或已过期' });

    if (req.method === 'GET' && parts[1] === 'rooms' && parts.length === 3) {
      const clientId = url.searchParams.get('clientId');
      return json(res, 200, publicRoom(room, clientId));
    }

    if (req.method === 'GET' && parts[1] === 'rooms' && parts[3] === 'events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`retry: 2500\n\n`);
      res.write(`event: state\ndata: ${JSON.stringify(publicRoom(room))}\n\n`);
      if (!listeners.has(room.code)) listeners.set(room.code, new Set());
      listeners.get(room.code).add(res);
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heartbeat);
        listeners.get(room.code)?.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && parts[1] === 'rooms' && parts[3] === 'start') {
      const body = await readBody(req);
      const player = room.players.find((item) => item.id === body.clientId);
      if (!player) return json(res, 403, { error: '你不在这个房间里' });
      if (room.players.length < 2) return json(res, 409, { error: '等朋友进来再开始吧' });
      if (room.status === 'waiting') {
        room.status = 'playing';
        room.startedAt = Date.now();
        room.players.forEach((item) => { item.progress = 0; });
        broadcast(room.code);
      }
      return json(res, 200, { room: publicRoom(room, body.clientId) });
    }

    if (req.method === 'POST' && parts[1] === 'rooms' && parts[3] === 'progress') {
      const body = await readBody(req);
      const player = room.players.find((item) => item.id === body.clientId);
      if (!player) return json(res, 403, { error: '你不在这个房间里' });
      if (room.status !== 'playing') return json(res, 200, { room: publicRoom(room, body.clientId) });
      const count = Math.max(0, Math.min(room.rounds, Number(body.count) || 0));
      player.progress = Math.max(player.progress || 0, count);
      broadcast(room.code);
      return json(res, 200, { room: publicRoom(room, body.clientId) });
    }
    if (req.method === 'POST' && parts[1] === 'rooms' && parts[3] === 'answers') {
      const body = await readBody(req);
      const player = room.players.find((item) => item.id === body.clientId);
      if (!player) return json(res, 403, { error: '你不在这个房间里' });
      if (room.status === 'waiting') return json(res, 409, { error: '挑战还没有开始' });
      if (room.status === 'results') return json(res, 200, { room: publicRoom(room, body.clientId) });
      const answers = normalizeAnswers(body.answers, room.rounds);
      if (answers.some((answer) => !answer)) return json(res, 400, { error: '每一题都要写一个词' });
      player.answers = answers;
      player.progress = room.rounds;
      player.submittedAt = Date.now();
      if (room.players.length === 2 && room.players.every((item) => item.submittedAt)) {
        room.status = 'results';
        room.finishedAt = Date.now();
      }
      broadcast(room.code);
      return json(res, 200, { room: publicRoom(room, body.clientId) });
    }

    return json(res, 404, { error: '接口不存在' });
  } catch (error) {
    return json(res, 400, { error: error.message || '请求失败' });
  }
}

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('Method not allowed');
  }
  return serveStatic(res, url.pathname);
});

setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      rooms.delete(code);
      for (const res of listeners.get(code) || []) res.end();
      listeners.delete(code);
    }
  }
}, 30 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  const addresses = [`http://localhost:${PORT}`];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(`http://${item.address}:${PORT}`);
    }
  }
  console.log('\n  同词相见已启动');
  console.log(`  本机访问  ${addresses[0]}`);
  if (addresses[1]) console.log(`  同一网络  ${addresses[1]}`);
  console.log('  按 Ctrl+C 停止\n');
});


