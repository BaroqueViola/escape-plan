// Chat, emotes and spectating state for the game page.
// Listens to the server's social events on the shared socket.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ChatMessage, ClientToServerEvents, EmoteEvent, EmoteId, GameSummary, LiveGame, PlayerEmote,
  ServerToClientEvents, SocialFeatures, SpectatorInfo,
} from '../../../server/events';
import { playClip, playEffect } from './sound';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Bubble extends EmoteEvent { key: number }

const BUBBLE_MS = 2_600; // how long an emote stays on screen
export const EMOTE_COOLDOWN_MS = 3_000; // same as the server

export function useSocial(socket: MutableRefObject<GameSocket | null>) {
  const [features, setFeatures] = useState<SocialFeatures>({ chat: false, emotes: false, spectate: false, voice: false });
  const [spectators, setSpectators] = useState<SpectatorInfo>({ count: 0, names: [] });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [spoken, setSpoken] = useState<Set<number>>(new Set());
  const [chatOpen, setChatOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [watching, setWatching] = useState<GameSummary | null>(null);
  const [watchingAt, setWatchingAt] = useState(0);
  const [emoteReadyAt, setEmoteReadyAt] = useState(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const opponent = useRef<string | null>(null);
  const nextBubble = useRef(1);

  useEffect(() => {
    const client = socket.current;
    if (!client) return;
    const clearChat = () => { setMessages([]); setSpoken(new Set()); setUnread(0); setBubbles([]); };

    // Every listener is kept so cleanup removes exactly these (App has its own on the same socket)
    const handlers: { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] } = {
      'social:features': setFeatures,
      'social:spectators': setSpectators,
      'chat:message': (message) => {
        setMessages((list) => [...list.slice(-49), message]);
        if (!chatOpenRef.current) setUnread((n) => n + 1);
      },
      'chat:history': (list) => { setMessages(list); setSpoken(new Set()); setUnread(0); },
      'chat:spoken': (id, clip) => {
        setSpoken((set) => new Set(set).add(id));
        playClip(clip);
      },
      'emote:show': (event) => {
        const key = nextBubble.current++;
        // A player's new emote replaces their previous bubble
        setBubbles((list) => [...list.filter((b) => !(event.kind === 'player' && b.kind === 'player' && b.role === event.role)), { ...event, key }]);
        window.setTimeout(() => setBubbles((list) => list.filter((b) => b.key !== key)), BUBBLE_MS);
        if (event.kind === 'player') playClip(event.clip, () => playEffect(event.emote as PlayerEmote)); // spectator emotes are silent
      },
      'spectate:list': setLiveGames,
      'spectate:state': (game) => {
        setWatching((old) => { if (!old || old.id !== game.id) clearChat(); return game; });
        setWatchingAt(performance.now());
      },
      'spectate:ended': () => { setWatching(null); setSpectators({ count: 0, names: [] }); clearChat(); },
      'game:started': (info) => {
        if (info.opponent.nickname !== opponent.current) clearChat(); // new rival: fresh chat (a rematch keeps it)
        opponent.current = info.opponent.nickname;
        setChatOpen(true);
      },
      'game:opponentLeft': () => { opponent.current = null; clearChat(); setSpectators({ count: 0, names: [] }); },
      'server:reset': () => setBubbles([]),
    };
    const onDisconnect = () => { setWatching(null); clearChat(); };
    for (const [event, handler] of Object.entries(handlers)) client.on(event as keyof ServerToClientEvents, handler as never);
    client.on('disconnect', onDisconnect);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) client.off(event as keyof ServerToClientEvents, handler as never);
      client.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return {
    features, spectators, messages, spoken, bubbles, liveGames, watching, watchingAt, emoteReadyAt,
    chatOpen, unread,
    setChatOpen(open: boolean) { setChatOpen(open); if (open) setUnread(0); },
    sendChat(text: string, speak: boolean) { socket.current?.emit('chat:send', { text, speak }); },
    sendEmote(emote: EmoteId) {
      if (performance.now() < emoteReadyAt) return;
      setEmoteReadyAt(performance.now() + EMOTE_COOLDOWN_MS);
      socket.current?.emit('emote:send', emote);
    },
    watch(gameId: string) { socket.current?.emit('spectate:watch', gameId); },
    leave() { socket.current?.emit('spectate:leave'); setWatching(null); setMessages([]); setSpectators({ count: 0, names: [] }); },
  };
}

export type Social = ReturnType<typeof useSocial>;
