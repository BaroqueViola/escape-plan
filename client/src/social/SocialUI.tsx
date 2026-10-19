// Chat panel (with a Controls tab), emote buttons, emote bubbles over the
// board, and the "Spectate a live game" list.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ChatMessage, CrowdEmote, EmoteId, GameState, LiveGame, PlayerEmote, Role } from '../../../server/events';
import { CROWD_EMOTES, PRISONER_EMOTES, WARDEN_EMOTES } from '../../../server/events';
import { EmoteArt, PLAYER_EMOTE_ART } from './sprites';
import type { Bubble } from './useSocial';

export const emotesFor = (role: Role): readonly PlayerEmote[] => role === 'warden' ? WARDEN_EMOTES : PRISONER_EMOTES;
export const crowdEmotes: readonly CrowdEmote[] = CROWD_EMOTES;
const MAX_CHARS = 80;

// ---- Chat / Controls panel ---------------------------------------------------------

interface ChatPanelProps {
  messages: ChatMessage[];
  spoken: Set<number>;
  me: string;
  chatEnabled: boolean; // chat on for this mode and not turned off by the admin
  canSpeak: boolean; // voice available (players only)
  open: boolean;
  unread: number;
  onOpen: (open: boolean) => void;
  onSend: (text: string, speak: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  controls: ReactNode; // what the Controls tab shows
}

export function ChatPanel({ messages, spoken, me, chatEnabled, canSpeak, open, unread, onOpen, onSend, inputRef, controls }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [speak, setSpeak] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const showChat = open && chatEnabled;

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, showChat]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value, speak && canSpeak);
    setText('');
  }

  return <div className="panel controls-panel chat-panel">
    <div className="cp-tabs" role="tablist">
      <button role="tab" aria-selected={showChat} className={`cp-tab${showChat ? ' on' : ''}`} disabled={!chatEnabled} onClick={() => onOpen(true)} title={chatEnabled ? 'Open chat (Enter)' : 'Chat is turned off'}>
        CHAT {!showChat && unread > 0 && <span className="cp-badge">{unread} NEW</span>}{!chatEnabled && <span className="cp-off">OFF</span>}
      </button>
      <button role="tab" aria-selected={!showChat} className={`cp-tab${!showChat ? ' on' : ''}`} onClick={() => onOpen(false)}>CONTROLS</button>
      {showChat && <button className="cp-x" aria-label="Close chat" title="Close chat (Esc)" onClick={() => onOpen(false)}>×</button>}
    </div>
    {showChat ? <div className="chat-body">
      <div className="chat-log" ref={log} aria-live="polite">
        {messages.length === 0 && <div className="cm sys">SAY HI · {MAX_CHARS} CHARACTERS MAX</div>}
        {messages.map((m) => m.kind === 'system'
          ? <div key={m.id} className="cm sys">{m.text.toUpperCase()}</div>
          : <div key={m.id} className={`cm${m.kind === 'player' && m.from === me ? ' me' : ''}${m.kind === 'spectator' ? ' spec' : ''}${m.kind === 'admin' ? ' admin' : ''}`}>
            <div className="n">{m.kind === 'admin' ? 'ADMIN' : m.from.toUpperCase()}{m.kind !== 'admin' && m.from === me ? ' (YOU)' : m.kind === 'spectator' ? ' · WATCHING' : ''}</div>
            <div className="t"><span>{m.text}</span>{spoken.has(m.id) && <span className="spk">🔊 SPOKEN</span>}</div>
          </div>)}
      </div>
      <form className="chat-in" onSubmit={submit}>
        <input ref={inputRef} value={text} maxLength={MAX_CHARS} placeholder="Type a message…" aria-label="Chat message"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.blur(); onOpen(false); } }} />
        {canSpeak && <button type="button" className={`speak${speak ? ' on' : ''}`} aria-pressed={speak} title="Read my message aloud (one every 20 s)" onClick={() => setSpeak(!speak)}>SPEAK <i className="sw" /></button>}
        <button className="send" disabled={!text.trim()}>SEND</button>
      </form>
      <div className="chat-foot"><span>Esc or × closes chat</span><span>{text.length} / {MAX_CHARS}</span></div>
    </div> : controls}
  </div>;
}

// Keyboard keys list for the Controls tab
export function KeyList({ emoteCount, chat }: { emoteCount: number; chat: boolean }) {
  return <div className="ctl-sec">
    <div className="panel-heading"><span className="eyebrow accent">KEYS</span><span>KEYBOARD</span></div>
    <div className="keys">
      <span>Move</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
      {emoteCount > 0 && <><span>Send emote</span><span>{Array.from({ length: emoteCount }, (_, i) => <kbd key={i}>{i + 1}</kbd>)}</span></>}
      {chat && <><span>Open chat</span><span><kbd>Enter</kbd></span><span>Close chat</span><span><kbd>Esc</kbd></span></>}
    </div>
  </div>;
}

// ---- Emote buttons ------------------------------------------------------------------

export function EmoteStrip({ emotes, readyAt, onSend, label = 'EMOTES' }: { emotes: readonly EmoteId[]; readyAt: number; onSend: (e: EmoteId) => void; label?: string }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (readyAt <= performance.now()) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [readyAt]);
  const wait = Math.max(0, Math.ceil((readyAt - now) / 1000));
  return <div className="emote-strip">
    <span className="lbl">{label}</span>
    {emotes.map((emote, i) => <button key={emote} className="eb" disabled={wait > 0} onClick={() => onSend(emote)}
      title={emote in PLAYER_EMOTE_ART ? PLAYER_EMOTE_ART[emote as PlayerEmote].label : emote.toUpperCase()} aria-label={`Emote ${emote}`}>
      <EmoteArt emote={emote} /><small>{i + 1}</small>{wait > 0 && <b className="cd">{wait}</b>}
    </button>)}
  </div>;
}

// ---- Bubbles over the board -----------------------------------------------------------

// Wraps the board: player emotes pop up over their character, spectator emotes float up the side
export function BoardStage({ board, state, bubbles }: { board: ReactNode; state: GameState; bubbles: Bubble[] }) {
  const { width, height } = state.board;
  return <div className="board-stage">
    {board}
    <div className="bubble-layer" aria-live="polite">
      {bubbles.filter((b) => b.kind === 'player' && b.role).map((b) => {
        const pos = state.positions[b.role!];
        const right = pos.x >= width - 1; // keep the bubble on the board at the right edge
        return <div key={b.key} className={`bub${right ? ' flip' : ''}`} title={`${b.from}: ${b.emote}`}
          style={{ left: `${((pos.x + (right ? 0.1 : 0.55)) / width) * 100}%`, top: `${(Math.max(0, pos.y - 0.15) / height) * 100}%` }}>
          <EmoteArt emote={b.emote} />{b.clip && <span className="snd">🔊</span>}
        </div>;
      })}
      <div className="crowd">
        {bubbles.filter((b) => b.kind === 'spectator').slice(-4).map((b) => <div key={b.key} className="crowd-bub">
          <EmoteArt emote={b.emote} /><span>{b.from}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

// ---- Spectating -------------------------------------------------------------------------

const STATUS: Record<LiveGame['status'], string> = { ready: 'READY CHECK', picking: 'PICKING CLASSES', playing: 'PLAYING', paused: 'PAUSED', finished: 'FINISHED' };

export function SpectateList({ games, onWatch }: { games: LiveGame[]; onWatch: (id: string) => void }) {
  return <section className="panel spectate-panel">
    <div className="panel-heading"><span className="eyebrow accent">SPECTATE A LIVE GAME</span><span>{games.length} LIVE</span></div>
    <p>You keep your place in the queue while you watch.</p>
    {games.length === 0 ? <div className="empty-slot">No games running yet.</div> : <div className="live-list">
      {games.map((g) => <div key={g.id} className="live-game">
        <strong>GAME {g.id}{g.mode === 'chaos' ? ' · CHAOS' : ''}</strong>
        <span className="live-players">{g.players.map((p) => `${p.nickname}${p.role ? ` (${p.role})` : ''}`).join(' vs ')}</span>
        <span className="live-status">{STATUS[g.status]}</span>
        <span className="eye-pill small"><span className="emo">👁</span> {g.spectators}</span>
        <button className="small-button" onClick={() => onWatch(g.id)}>WATCH ▸</button>
      </div>)}
    </div>}
  </section>;
}

export function EyePill({ count, names }: { count: number; names: string[] }) {
  return <div className="eye-pill" title={names.length ? `Watching: ${names.join(', ')}` : 'Nobody is watching'}><span className="emo">👁</span> {count} WATCHING</div>;
}
