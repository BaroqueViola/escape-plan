// Chat, emotes and spectating.
//
// - Chat: players and spectators of a game type to each other (80 characters).
//   Players can tick "Speak" to have the message read aloud in their role's voice.
// - Emotes: players get the three for their current role, voiced by ElevenLabs
//   (plain sound effect if voice is unavailable). Spectators get silent crowd emotes.
// - Spectating: a waiting player can watch a running game (Socket.IO room
//   watch:<id>) and keeps their place in the queue; when they get a match they
//   stop watching automatically.
// - Admin: mute a player, turn chat off for everyone, a live feed, watch any
//   game with its chat and emotes (and write in its chat as ADMIN), and kick a
//   player or spectator with a reason.
// Which of these a game has depends on its mode (modes.ts).

import type { ChatMessage, EmoteId, FeedEntry, GameServer, GameSocket, LiveGame, PlayerEmote, SocialFeatures } from './events.js';
import { CROWD_EMOTES, PRISONER_EMOTES, WARDEN_EMOTES } from './events.js';
import { AdminChat, AdminKick, AdminMute, AdminSay, AdminWatch, ChatSend, Emote, GameId } from './schema.js';
import { findGame, gameChannel, gameOfPlayer, getGames, roleOf, summarize, type Game } from './game.js';
import { DEFAULT_MODE, features } from './modes.js';
import { cachedClip, canSpeak, speak } from './voice.js';
import { sendDashboard } from './dashboard.js';
import { players } from './state.js';

// What each player emote says out loud
const EMOTE_LINES: Record<PlayerEmote, string> = {
  laugh: 'Heh heh heh... HAH!', // the Clash Royale "HEHEHE HA"
  cry: 'Nooo!',
  taunt: 'Catch me if you can!',
  angry: 'Grrr!',
  shock: 'What?!',
  nice: 'Nice move.',
};

// Spam limits (also keep voice credits low)
const CHAT_GAP_MS = 1_000;
const SPEAK_GAP_MS = 20_000; // one spoken message per player every 20 s
const EMOTE_GAP_MS = 3_000;
const HISTORY_SIZE = 30; // chat messages kept per game (sent to new spectators)
const FEED_SIZE = 40; // admin live feed

const watching = new Map<string, string>(); // socket id -> game id it is watching
const history = new Map<string, ChatMessage[]>(); // game id -> recent chat
const muted = new Set<string>(); // nicknames muted by the admin
const lastSent = new Map<string, number>(); // `${kind}:${socket id}` -> time of last chat/speak/emote
const feed: FeedEntry[] = [];
const kicked = new Set<string>(); // socket ids being kicked right now (game.ts words the opponent's message)
let chatEnabled = true;
let nextMessageId = 1;

const watchRoom = (gameId: string): string => `watch:${gameId}`;
const nameOf = (socketId: string): string => players.get(socketId) ?? 'Someone';

// ---- Read by game.ts and dashboard.ts ----------------------------------------

export function spectatorsOf(gameId: string): string[] {
  return [...watching].filter(([, id]) => id === gameId).map(([socketId]) => nameOf(socketId));
}

export const isChatEnabled = (): boolean => chatEnabled;
export const mutedPlayers = (): string[] => [...muted];
export const recentFeed = (): FeedEntry[] => feed;
export const wasKicked = (socketId: string): boolean => kicked.has(socketId);

// Send the board to everyone watching this game
export function sendSpectatorState(io: GameServer, g: Game): void {
  if (spectatorsOf(g.id).length > 0) io.to(watchRoom(g.id)).emit('spectate:state', summarize(g));
}

// Live games a waiting player can watch (sent to everyone; players in a game ignore it)
export function broadcastSpectateList(io: GameServer): void {
  const list: LiveGame[] = getGames()
    .filter((g) => { const game = findGame(g.id); return !!game && features(game.mode).spectate; })
    .map((g) => ({
      id: g.id,
      players: g.players.map((p) => ({ nickname: p.nickname, role: p.role })),
      status: g.status,
      spectators: g.spectators.length,
    }));
  io.emit('spectate:list', list);
}

// The game ended: send its spectators back to the lobby
export function endSpectating(io: GameServer, gameId: string, message: string): void {
  for (const [socketId, id] of watching) {
    if (id !== gameId) continue;
    watching.delete(socketId);
    const socket = io.sockets.sockets.get(socketId);
    socket?.leave(watchRoom(gameId));
    socket?.emit('spectate:ended', message);
  }
  history.delete(gameId);
}

// A new game was created: its players stop watching and get the game's features
export function startGameSocial(io: GameServer, g: Game): void {
  history.delete(g.id);
  for (const id of g.session.players) {
    stopWatching(io, id, 'You have a match!');
    io.to(id).emit('social:features', featuresFor(id));
  }
  io.to(gameChannel(g)).emit('social:spectators', { count: 0, names: [] });
}

// Make the six emote voice lines once at startup (cached on disk, so this is free after the first run)
export async function warmEmoteVoices(): Promise<void> {
  for (const emote of [...PRISONER_EMOTES, ...WARDEN_EMOTES]) {
    const role = (PRISONER_EMOTES as readonly string[]).includes(emote) ? 'prisoner' : 'warden';
    if (!cachedClip(EMOTE_LINES[emote], role) && canSpeak(EMOTE_LINES[emote])) await speak(EMOTE_LINES[emote], role);
  }
}

// ---- Helpers --------------------------------------------------------------------

function featuresFor(socketId: string): SocialFeatures {
  const g = gameOfPlayer(socketId) ?? findGame(watching.get(socketId) ?? '');
  const f = features(g?.mode ?? DEFAULT_MODE);
  return { chat: f.chat && chatEnabled, emotes: f.emotes, spectate: f.spectate, voice: f.voice && canSpeak() };
}

// Who is sending, and to which game
function contextOf(socketId: string): { g: Game; kind: 'player' | 'spectator'; role: 'warden' | 'prisoner' | null } | null {
  const own = gameOfPlayer(socketId);
  if (own) return { g: own, kind: 'player', role: roleOf(own, socketId) };
  const watched = findGame(watching.get(socketId) ?? '');
  return watched ? { g: watched, kind: 'spectator', role: null } : null;
}

// Players and spectators of a game, plus admins watching it (admins are in the
// '/admin' namespace, so they need their own emit)
function audience(io: GameServer, g: Game) {
  const game = io.to([gameChannel(g), watchRoom(g.id)]);
  const admins = io.of('/admin').to(watchRoom(g.id));
  return {
    emit: ((...args: unknown[]) => {
      (game.emit as (...a: unknown[]) => boolean)(...args);
      return (admins.emit as (...a: unknown[]) => boolean)(...args);
    }) as typeof game.emit,
  };
}

// Add a message to a game's chat (players, spectators and watching admins see it)
function postChat(io: GameServer, g: Game, message: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
  const full: ChatMessage = { ...message, id: nextMessageId++, at: Date.now() };
  const recent = history.get(g.id) ?? [];
  recent.push(full);
  history.set(g.id, recent.slice(-HISTORY_SIZE));
  audience(io, g).emit('chat:message', full);
  return full;
}

// true = too soon since this socket last did `kind`
function tooSoon(kind: string, socketId: string, gapMs: number): boolean {
  const key = `${kind}:${socketId}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < gapMs) return true;
  lastSent.set(key, now);
  return false;
}

function addFeed(io: GameServer, gameId: string, text: string): void {
  feed.unshift({ gameId, at: Date.now(), text });
  feed.length = Math.min(feed.length, FEED_SIZE);
  sendDashboard(io);
}

function sendSpectatorCount(io: GameServer, gameId: string): void {
  const g = findGame(gameId);
  if (!g) return;
  const names = spectatorsOf(gameId);
  audience(io, g).emit('social:spectators', { count: names.length, names });
}

function stopWatching(io: GameServer, socketId: string, message?: string): void {
  const gameId = watching.get(socketId);
  if (gameId === undefined) return;
  watching.delete(socketId);
  const socket = io.sockets.sockets.get(socketId);
  socket?.leave(watchRoom(gameId));
  if (message) socket?.emit('spectate:ended', message);
  sendSpectatorCount(io, gameId);
  addFeed(io, gameId, `${nameOf(socketId)} stopped watching`);
  broadcastSpectateList(io);
}

// ---- Player and spectator events ---------------------------------------------

export function registerSocial(io: GameServer, socket: GameSocket): void {
  socket.emit('social:features', featuresFor(socket.id));
  broadcastSpectateList(io);

  socket.on('chat:send', (raw) => {
    const parsed = ChatSend.safeParse(raw);
    if (!parsed.success) {
      socket.emit('game:rejected', parsed.error.issues[0]?.message ?? 'Invalid message');
      return;
    }
    const ctx = contextOf(socket.id);
    if (!ctx) {
      socket.emit('game:rejected', 'Join a game or watch one to chat');
      return;
    }
    const { g, kind, role } = ctx;
    const from = nameOf(socket.id);
    if (!features(g.mode).chat || !chatEnabled) {
      socket.emit('game:rejected', 'Chat is turned off');
      return;
    }
    if (muted.has(from)) {
      socket.emit('game:rejected', 'The admin has muted you');
      return;
    }
    if (tooSoon('chat', socket.id, CHAT_GAP_MS)) {
      socket.emit('game:rejected', 'Slow down a little');
      return;
    }

    const message = postChat(io, g, { from, kind, role, text: parsed.data.text });
    addFeed(io, g.id, `${from}${kind === 'spectator' ? ' (watching)' : ''}: "${message.text}"`);

    // "Speak": players only, in their role's voice
    if (!parsed.data.speak || kind !== 'player' || !role || !features(g.mode).voice) return;
    if (tooSoon('speak', socket.id, SPEAK_GAP_MS)) {
      socket.emit('game:rejected', 'You can speak one message every 20 seconds. This one was sent as text.');
      return;
    }
    void speak(message.text, role).then((clip) => {
      if (clip) audience(io, g).emit('chat:spoken', message.id, clip);
      else socket.emit('game:rejected', 'Voice is not available right now. Your message was sent as text.');
      socket.emit('social:features', featuresFor(socket.id)); // the Speak switch turns off when credits run out
      sendDashboard(io); // credits used
    });
  });

  socket.on('emote:send', (raw) => {
    const parsed = Emote.safeParse(raw);
    if (!parsed.success) {
      socket.emit('game:rejected', parsed.error.issues[0]?.message ?? 'Unknown emote');
      return;
    }
    const ctx = contextOf(socket.id);
    if (!ctx || !features(ctx.g.mode).emotes) return;
    const { g, kind, role } = ctx;
    const emote: EmoteId = parsed.data;
    const from = nameOf(socket.id);

    // Players: only their current role's three. Spectators: only crowd emotes.
    const allowed: readonly EmoteId[] = kind === 'spectator' ? CROWD_EMOTES : role === 'warden' ? WARDEN_EMOTES : PRISONER_EMOTES;
    if (!allowed.includes(emote)) {
      socket.emit('game:rejected', 'You cannot use that emote');
      return;
    }
    if (muted.has(from)) {
      socket.emit('game:rejected', 'The admin has muted you');
      return;
    }
    if (tooSoon('emote', socket.id, EMOTE_GAP_MS)) return; // the button shows its own cooldown

    let clip: string | null = null;
    if (kind === 'player' && role && features(g.mode).voice) {
      const line = EMOTE_LINES[emote as PlayerEmote];
      clip = cachedClip(line, role);
      if (!clip && canSpeak(line)) void speak(line, role); // ready for next time; plain sound this time
    }
    audience(io, g).emit('emote:show', { from, kind, role, emote, clip });
    addFeed(io, g.id, `${from}${kind === 'spectator' ? ' (watching)' : ''} sent ${emote}`);
  });

  socket.on('spectate:watch', (raw) => {
    const parsed = GameId.safeParse(raw);
    const g = parsed.success ? findGame(parsed.data) : undefined;
    if (!g || !features(g.mode).spectate) {
      socket.emit('game:rejected', 'That game is not running any more');
      return;
    }
    if (!players.has(socket.id)) {
      socket.emit('game:rejected', 'Join with a nickname first');
      return;
    }
    if (gameOfPlayer(socket.id)) {
      socket.emit('game:rejected', 'You are already in a match');
      return;
    }
    if (watching.get(socket.id) === g.id) return;
    stopWatching(io, socket.id);

    watching.set(socket.id, g.id);
    socket.join(watchRoom(g.id));
    socket.emit('social:features', featuresFor(socket.id));
    socket.emit('spectate:state', summarize(g));
    socket.emit('chat:history', history.get(g.id) ?? []);
    sendSpectatorCount(io, g.id);
    addFeed(io, g.id, `${nameOf(socket.id)} started watching`);
    broadcastSpectateList(io);
  });

  socket.on('spectate:leave', () => {
    stopWatching(io, socket.id);
    socket.emit('social:features', featuresFor(socket.id));
  });

  socket.on('disconnect', () => {
    stopWatching(io, socket.id);
    for (const kind of ['chat', 'speak', 'emote']) lastSent.delete(`${kind}:${socket.id}`);
  });
}

// ---- Admin controls (called from admin.ts) -------------------------------------

export function registerAdminSocial(io: GameServer, socket: GameSocket, log: (event: string) => void): void {
  socket.on('admin:mute', (nickname, mute) => {
    const parsed = AdminMute.safeParse({ nickname, muted: mute });
    if (!parsed.success) return;
    if (parsed.data.muted) muted.add(parsed.data.nickname);
    else muted.delete(parsed.data.nickname);
    log(`Admin ${parsed.data.muted ? 'muted' : 'unmuted'} ${parsed.data.nickname}`);
  });

  socket.on('admin:chat', (raw) => {
    const parsed = AdminChat.safeParse(raw);
    if (!parsed.success) return;
    chatEnabled = parsed.data;
    for (const id of io.of('/').sockets.keys()) io.to(id).emit('social:features', featuresFor(id));
    log(`Admin turned chat ${chatEnabled ? 'on' : 'off'}`);
  });

  // Watch a game: the admin gets its chat and emotes (the board comes with the dashboard)
  let adminWatching: string | null = null;
  socket.on('admin:watch', (raw) => {
    const parsed = AdminWatch.safeParse(raw);
    if (!parsed.success) return;
    if (adminWatching !== null) void socket.leave(watchRoom(adminWatching));
    adminWatching = parsed.data;
    const g = adminWatching === null ? undefined : findGame(adminWatching);
    if (!g) return;
    void socket.join(watchRoom(g.id));
    socket.emit('chat:history', history.get(g.id) ?? []);
  });

  // Write in a game's chat as ADMIN (works even when chat is turned off)
  socket.on('admin:say', (gameId, text) => {
    const parsed = AdminSay.safeParse({ gameId, text });
    const g = parsed.success ? findGame(parsed.data.gameId) : undefined;
    if (!parsed.success || !g) return;
    postChat(io, g, { from: 'ADMIN', kind: 'admin', role: null, text: parsed.data.text });
    addFeed(io, g.id, `ADMIN: "${parsed.data.text}"`);
  });

  // Kick a player or spectator: they see the reason and go back to the name screen.
  // Everyone else only sees that they were kicked, not why.
  socket.on('admin:kick', (nickname, reason, done) => {
    const reply = typeof done === 'function' ? done : () => {};
    const parsed = AdminKick.safeParse({ nickname, reason });
    if (!parsed.success) {
      reply(parsed.error.issues[0]?.message ?? 'Invalid kick');
      return;
    }
    const socketId = [...players].find(([, name]) => name === parsed.data.nickname)?.[0];
    const target = socketId === undefined ? undefined : io.sockets.sockets.get(socketId);
    if (!socketId || !target) {
      reply(`${parsed.data.nickname} is not connected any more`);
      return;
    }
    const name = parsed.data.nickname;
    const game = gameOfPlayer(socketId) ?? findGame(watching.get(socketId) ?? '');
    if (game) {
      postChat(io, game, { from: '', kind: 'system', role: null, text: `${name} was kicked by the admin` });
      addFeed(io, game.id, `Admin kicked ${name}: "${parsed.data.reason}"`);
    }
    kicked.add(socketId);
    setTimeout(() => kicked.delete(socketId), 5_000); // only needed while the disconnect is handled
    target.emit('player:kicked', parsed.data.reason);
    target.disconnect(true); // the usual leave clean-up runs: game ends, rival waits for a new match
    log(`Admin kicked ${name}: ${parsed.data.reason}`);
    reply(null);
  });
}
