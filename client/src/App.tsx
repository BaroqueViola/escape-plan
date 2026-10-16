import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameState, MatchInfo, MatchResult, PauseStatus, ReadyStatus, ServerToClientEvents } from '../../server/events';
import { SERVER_URL } from './config';
import { useSocial } from './social/useSocial';
import { BoardStage, ChatPanel, EmoteStrip, EyePill, KeyList, SpectateList, crowdEmotes, emotesFor } from './social/SocialUI';
import { isMuted, setMuted, unlockAudio } from './social/sound';
import './social/social.css';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Direction = 'up' | 'down' | 'left' | 'right';
const directions: Record<Direction, { x: number; y: number; label: string; key: string }> = {
  up: { x: 0, y: -1, label: '↑', key: 'W' },
  left: { x: -1, y: 0, label: '←', key: 'A' },
  down: { x: 0, y: 1, label: '↓', key: 'S' },
  right: { x: 1, y: 0, label: '→', key: 'D' },
};

function legalDirections(state: GameState | null, info: MatchInfo | null): Direction[] {
  if (!state || !info || state.status !== 'active' || state.turnNickname !== info.you.nickname) return [];
  const from = state.positions[info.you.role];
  return (Object.keys(directions) as Direction[]).filter((direction) => {
    const delta = directions[direction];
    const x = from.x + delta.x;
    const y = from.y + delta.y;
    if (x < 0 || y < 0 || x >= state.board.width || y >= state.board.height) return false;
    const tile = state.board.cells[y * state.board.width + x];
    return tile === 'free' || (tile === 'tunnel' && info.you.role === 'prisoner');
  });
}

function Board({ state, info, legal }: { state: GameState; info: MatchInfo; legal: Direction[] }) {
  const from = state.positions[info.you.role];
  const targets = new Set(legal.map((direction) => {
    const delta = directions[direction];
    return `${from.x + delta.x},${from.y + delta.y}`;
  }));
  return <div className="board-frame">
    <div className="board" role="img" aria-label={`${state.board.width} by ${state.board.height} map. Warden at column ${state.positions.warden.x + 1}, row ${state.positions.warden.y + 1}. Prisoner at column ${state.positions.prisoner.x + 1}, row ${state.positions.prisoner.y + 1}. Tunnel marked by a glowing portal.`} style={{ gridTemplateColumns: `repeat(${state.board.width}, 1fr)` }}>
      {state.board.cells.map((tile, index) => {
        const x = index % state.board.width;
        const y = Math.floor(index / state.board.width);
        const warden = state.positions.warden.x === x && state.positions.warden.y === y;
        const prisoner = state.positions.prisoner.x === x && state.positions.prisoner.y === y;
        const label = `${tile === 'free' ? 'Floor' : tile === 'obstacle' ? 'Wall' : 'Tunnel'}, column ${x + 1}, row ${y + 1}${warden ? ', warden' : ''}${prisoner ? ', prisoner' : ''}${targets.has(`${x},${y}`) ? ', legal destination' : ''}`;
        return <div key={index} className={`tile tile-${tile}${targets.has(`${x},${y}`) ? ' tile-legal' : ''}`} title={label}>
          <img className="terrain" src={`/assets/${tile}.svg`} alt="" />
          {warden && <img className="character warden" src="/assets/warden.svg" alt="" />}
          {prisoner && <img className="character prisoner" src="/assets/prisoner.svg" alt="" />}
          {targets.has(`${x},${y}`) && <span className="move-dot" />}
        </div>;
      })}
    </div>
  </div>;
}

// Two names with READY / WAITING, used on the Ready and Paused screens
function StatusList({ names, ready, you }: { names: string[]; ready: string[]; you: string }) {
  return <ul className="ready-list">
    {names.map((name) => {
      const isReady = ready.includes(name);
      return <li key={name} className={isReady ? 'is-ready' : ''}><span>{name}{name === you ? ' (you)' : ''}</span><strong>{isReady ? '✓ READY' : 'WAITING'}</strong></li>;
    })}
  </ul>;
}

function PlayerCard({ name, role, score, active, self, label }: { name: string; role: string; score: number; active: boolean; self: boolean; label?: string }) {
  return <div className={`player-card${active ? ' player-active' : ''}`}>
    <div className={`portrait portrait-${role}`}><img src={`/assets/${role}.svg`} alt="" /></div>
    <div className="player-copy"><span className="eyebrow">{label ?? (self ? 'YOU' : 'RIVAL')} · {role.toUpperCase()}</span><strong>{name}</strong></div>
    <div className="score"><span>PTS</span><strong>{score}</strong></div>
  </div>;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState('');
  const pendingName = useRef('');
  const socket = useRef<GameSocket | null>(null);
  const [welcome, setWelcome] = useState('');
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [votes, setVotes] = useState<Record<string, boolean>>({});
  const [readyStatus, setReadyStatus] = useState<ReadyStatus | null>(null);
  const [pauseStatus, setPauseStatus] = useState<PauseStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [kickedReason, setKickedReason] = useState<string | null>(null); // shown on the name screen after the admin kicks you
  const kickedRef = useRef(false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const client: GameSocket = io(SERVER_URL || undefined, { autoConnect: true });
    socket.current = client;
    client.on('connect', () => {
      setConnected(true);
      setNotice('');
      if (pendingName.current) client.emit('player:join', pendingName.current);
    });
    client.on('disconnect', (reason) => {
      setConnected(false); setJoined(false); setInfo(null); setState(null); setResult(null); setReadyStatus(null); setPauseStatus(null);
      if (kickedRef.current) {
        kickedRef.current = false;
        client.connect(); // kicked: reconnect straight away so the player can join again
        return;
      }
      setNotice('Connection lost. Reconnecting to the server…');
      if (reason === 'io server disconnect') client.connect(); // Socket.IO does not retry these on its own
    });
    // The admin kicked us: back to the name screen with the reason
    client.on('player:kicked', (reason) => {
      kickedRef.current = true;
      pendingName.current = ''; // don't rejoin automatically
      setNickname('');
      setNotice('');
      setKickedReason(reason);
    });
    client.on('connect_error', () => setNotice('Cannot reach the game server. Retrying…'));
    client.on('player:welcome', (message) => { setWelcome(message); setJoined(true); setNotice(''); });
    client.on('player:rejected', (message) => { pendingName.current = ''; setNotice(message); });
    client.on('game:started', (value) => { setInfo(value); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setNotice(''); });
    client.on('game:readyStatus', setReadyStatus);
    client.on('game:pauseStatus', setPauseStatus);
    client.on('game:state', (value) => { setState(value); setReceivedAt(performance.now()); setElapsed(0); });
    client.on('game:ended', setResult);
    client.on('game:rematchStatus', setVotes);
    client.on('game:rejected', setNotice);
    client.on('game:opponentLeft', (message) => { setInfo(null); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setNotice(`${message} Waiting for a new rival.`); });
    client.on('server:reset', (message) => { setInfo(null); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setNotice(message); });
    return () => { client.removeAllListeners(); client.disconnect(); socket.current = null; };
  }, []);

  // Chat, emotes and spectating (after the socket is created above)
  const social = useSocial(socket);
  const chatInput = useRef<HTMLInputElement>(null);
  const [soundOff, setSoundOff] = useState(isMuted());

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - receivedAt), 100);
    return () => window.clearInterval(id);
  }, [receivedAt]);

  const shownInfo = info;
  const shownState = state;
  const shownResult = result ?? (state?.outcome && info ? {
    result: state.outcome.winner === info.you.nickname ? 'Win' : 'Lost',
    winner: state.outcome.winner,
    reason: state.outcome.reason,
    scores: state.scores,
  } as MatchResult : null);
  const shownVotes = state?.rematchVotes ?? votes;
  const shownJoined = joined;
  // Ready check: board is shown blurred, clock and moves are paused until both press Ready
  const waitingReady = !!readyStatus?.waiting;
  const iAmReady = !!info && !!readyStatus?.ready.includes(info.you.nickname);
  // Pause: needs the rival's consent; while paused the clock is frozen and moves are blocked
  const paused = !!pauseStatus?.paused;
  const pauseRequestedBy = pauseStatus?.requestedBy ?? null;
  const iRequestedPause = !!info && pauseRequestedBy === info.you.nickname;
  const rivalRequestedPause = !!pauseRequestedBy && !iRequestedPause;
  const iResumed = !!info && !!pauseStatus?.resumeReady.includes(info.you.nickname);
  const blocked = waitingReady || paused;
  const canPause = !blocked && !!info && state?.status === 'active';
  const legal = useMemo(() => blocked ? [] : legalDirections(shownState, shownInfo), [shownState, shownInfo, blocked]);
  const myTurn = !blocked && !!shownState && !!shownInfo && shownState.status === 'active' && shownState.turnNickname === shownInfo.you.nickname;
  const remaining = paused ? pauseStatus?.remainingMs ?? 0
    : shownState?.turnDeadline == null ? 0 : Math.max(0, shownState.turnDeadline - shownState.serverTime - (waitingReady ? 0 : elapsed));
  const seconds = Math.ceil(remaining / 1000);

  function join(event: React.FormEvent) {
    event.preventDefault();
    const value = nickname.trim();
    if (!value || !socket.current?.connected) return;
    pendingName.current = value;
    setNotice('');
    setKickedReason(null);
    socket.current.emit('player:join', value);
  }
  function answerPause(accept: boolean) {
    socket.current?.emit('game:pauseAnswer', accept);
  }
  // Emotes for whoever is on screen: your role's three, or the crowd set when watching
  const watching = !info && social.watching?.state ? social.watching : null;
  const myEmotes = !social.features.emotes ? [] : info ? emotesFor(info.you.role) : watching ? crowdEmotes : [];
  const inChat = !!info || !!watching;
  function openChat() {
    social.setChatOpen(true);
    window.setTimeout(() => chatInput.current?.focus(), 0);
  }
  function move(direction: Direction) {
    if (myTurn && legal.includes(direction) && remaining > 0) {
      socket.current?.emit('game:move', direction);
    }
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const emote = myEmotes[Number(event.key) - 1];
      if (emote) { event.preventDefault(); social.sendEmote(emote); return; }
      if (event.key === 'Enter' && inChat && social.features.chat && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); openChat(); return; }
      if (event.key === 'Escape' && social.chatOpen) { social.setChatOpen(false); return; }
      const lookup: Record<string, Direction> = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };
      const direction = lookup[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (direction) { event.preventDefault(); move(direction); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Spectator view: the watched game's board, players and clock
  const watchedRemaining = watching?.state?.turnDeadline == null || !watching.state || watching.status !== 'playing' ? 0
    : Math.max(0, watching.state.turnDeadline - watching.state.serverTime - (performance.now() - social.watchingAt));
  const moveControls = <><div className="panel-heading"><span className="eyebrow accent">MOVE</span><span>WASD / ARROWS</span></div><div className="control-grid">{(['up', 'left', 'down', 'right'] as Direction[]).map((direction) => <button key={direction} className={`direction direction-${direction}`} aria-label={`Move ${direction}`} disabled={!legal.includes(direction) || remaining <= 0} onClick={() => move(direction)}><strong>{directions[direction].label}</strong><small>{directions[direction].key}</small></button>)}</div></>;
  const me = info?.you.nickname ?? (pendingName.current || nickname.trim());

  return <div className="app-shell" onPointerDown={unlockAudio}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>ESCAPE<span>PLAN</span></strong><small>CLASSIC</small></div></div>
      <div className="topbar-actions">
        {inChat && social.features.spectate && <EyePill count={social.spectators.count} names={social.spectators.names} />}
        {inChat && social.features.emotes && <button className="small-button sound-button" aria-pressed={!soundOff} onClick={() => { setMuted(!soundOff); setSoundOff(!soundOff); }}>{soundOff ? '🔇 SOUND OFF' : '🔊 SOUND ON'}</button>}
        {canPause && <button className="small-button pause-button" disabled={iRequestedPause} onClick={() => socket.current?.emit('game:pauseRequest')}>{iRequestedPause ? 'PAUSE REQUESTED…' : '❚❚ PAUSE'}</button>}
        <div className={`server-pill${connected ? ' online' : ''}`}><span className="signal" />{connected ? 'ONLINE' : 'CONNECTING'}</div>
      </div>
    </header>
    <main className="main-stage">
      {canPause && rivalRequestedPause && <div className="pause-request" role="alert"><span><strong>{pauseRequestedBy}</strong> wants to pause the game.</span><div><button className="small-button" onClick={() => answerPause(true)}>ACCEPT</button><button className="small-button ghost" onClick={() => answerPause(false)}>DECLINE</button></div></div>}
      {notice && <div className="notice" role="alert"><span>!</span>{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
      {!shownJoined && kickedReason !== null && <div className="kicked-banner" role="alert">
        <span className="kicked-icon" aria-hidden="true">⏏</span>
        <div><small>REMOVED BY THE ADMIN</small><strong>You are KICKED</strong><q>Reason: {kickedReason}</q><span>You can enter a name to join again.</span></div>
        <button aria-label="Dismiss message" onClick={() => setKickedReason(null)}>×</button>
      </div>}
      {!shownJoined ? <section className="entry-panel panel">
        <div className="entry-art"><img src="/assets/prisoner.svg" alt="Pixel art prisoner" /></div>
        <div className="entry-content"><h2>Join game</h2><p>Enter a nickname to find a match.</p>
          <form onSubmit={join}><label htmlFor="nickname">NICKNAME</label><input id="nickname" maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Your name" autoComplete="nickname" /><button className="primary-button" disabled={!connected || !nickname.trim()}>JOIN <span>↗</span></button></form>
        </div>
      </section> : (!shownState || !shownInfo) && watching?.state ? <div className="game-layout">
        <section className="game-panel panel"><div className="game-topline"><span className="eyebrow accent">WATCHING · GAME {watching.id}</span><span className="match-badge">{watching.status === 'finished' ? 'FINISHED' : watching.status === 'ready' ? 'GET READY' : watching.status === 'paused' ? 'PAUSED' : `${watching.turn ?? ''}'S TURN`}</span></div>
          <div className="board-area"><BoardStage state={watching.state} bubbles={social.bubbles} board={<Board state={watching.state} info={{ you: { nickname: '', role: 'warden' }, opponent: { nickname: '', role: 'prisoner' } }} legal={[]} />} /></div>
          <div className="board-footer"><span><i className="legend-dot wall" /> WALL</span><span><i className="legend-dot tunnel" /> TUNNEL</span></div>
          {myEmotes.length > 0 && <EmoteStrip label="CROWD" emotes={myEmotes} readyAt={social.emoteReadyAt} onSend={social.sendEmote} />}
        </section>
        <aside className="sidebar"><div className="panel match-panel"><div className="panel-heading"><span className="eyebrow accent">WATCHING</span><span>{watching.spectators.length} SPECTATOR{watching.spectators.length === 1 ? '' : 'S'}</span></div>
            {watching.players.map((p, i) => <div key={p.nickname}>{i > 0 && <div className="versus">VS</div>}<PlayerCard name={p.nickname} role={p.role ?? 'prisoner'} score={p.score} active={watching.turn === p.nickname} self={false} label={watching.turn === p.nickname ? '▶ TURN' : 'PLAYER'} /></div>)}</div>
          {watching.status === 'playing' ? <div className="panel turn-panel"><div className="turn-label"><span className="eyebrow accent">TIME LEFT</span></div><div className={`timer${watchedRemaining <= 3000 ? ' timer-low' : ''}`}><strong>{String(Math.ceil(watchedRemaining / 1000)).padStart(2, '0')}</strong><span>SEC</span></div><div className="timer-track"><span style={{ width: `${Math.min(100, watchedRemaining / 100)}%` }} /></div></div>
            : <div className="panel turn-panel"><div className="turn-label"><span className="eyebrow accent">{watching.status === 'finished' ? 'MATCH OVER' : watching.status === 'paused' ? 'PAUSED' : 'READY CHECK'}</span></div><p>{watching.status === 'finished' && watching.winner ? `${watching.winner} won. Waiting for a rematch.` : watching.status === 'paused' ? 'Both players agreed to pause.' : 'Waiting for both players to press Ready.'}</p></div>}
          <ChatPanel messages={social.messages} spoken={social.spoken} me={me} chatEnabled={social.features.chat} canSpeak={false}
            open={social.chatOpen} unread={social.unread} onOpen={social.setChatOpen} onSend={social.sendChat} inputRef={chatInput}
            controls={<><div className="panel-heading"><span className="eyebrow accent">SPECTATING</span><span>READ ONLY</span></div>
              <p className="spectator-note">You can't move pieces. Send crowd emotes with the buttons under the board. You keep your place in the queue and join a match as soon as an opponent arrives.</p>
              <button className="small-button" onClick={social.leave}>LEAVE ✕</button>
              <KeyList emoteCount={myEmotes.length} chat={social.features.chat} /></>} />
        </aside>
      </div> : !shownState || !shownInfo ? <div className="lobby-stack"><section className="lobby-panel panel">
        <div className="lobby-title"><h2>{welcome || 'Welcome.'}</h2><p>Waiting for another player.</p></div>
        <div className="lobby-list"><div className="list-heading"><span>YOUR MATCH</span><strong>1/2</strong></div><div className="lobby-player"><span className="slot">01</span><img src="/assets/prisoner.svg" alt="" /><strong>{pendingName.current || nickname.trim()} (you)</strong></div><div className="empty-slot"><span className="slot">02</span><span className="loading-block" />Waiting for another player...</div></div>
      </section>
      {social.features.spectate && <SpectateList games={social.liveGames} onWatch={social.watch} />}
      </div> : <div className="game-layout">
        <section className="game-panel panel"><div className="game-topline"><span className="eyebrow accent">CLASSIC · {shownState.board.width} × {shownState.board.height}</span><span className="match-badge">{shownState.status === 'finished' ? 'FINISHED' : waitingReady ? 'GET READY' : paused ? 'PAUSED' : myTurn ? 'YOUR TURN' : `${shownState.turnNickname}'S TURN`}</span></div><div className="board-area"><BoardStage state={shownState} bubbles={social.bubbles} board={<Board state={shownState} info={shownInfo} legal={legal} />} /></div><div className="board-footer"><span><i className="legend-dot wall" /> WALL</span><span><i className="legend-dot tunnel" /> TUNNEL</span><span><i className="legend-dot target" /> MOVE</span></div>
          {myEmotes.length > 0 && <EmoteStrip emotes={myEmotes} readyAt={social.emoteReadyAt} onSend={social.sendEmote} />}</section>
        <aside className="sidebar"><div className="panel match-panel"><div className="panel-heading"><span className="eyebrow accent">PLAYERS</span></div><PlayerCard name={shownInfo.you.nickname} role={shownInfo.you.role} score={shownState.scores[shownInfo.you.nickname] ?? 0} active={myTurn} self /><div className="versus">VS</div><PlayerCard name={shownInfo.opponent.nickname} role={shownInfo.opponent.role} score={shownState.scores[shownInfo.opponent.nickname] ?? 0} active={!myTurn && shownState.status === 'active'} self={false} /></div>
          {shownState.status === 'active' ? <div className="panel turn-panel" title="At zero, the server makes a random legal move."><div className="turn-label"><span className="eyebrow accent">TIME LEFT</span></div><div className={`timer${seconds <= 3 ? ' timer-low' : ''}`}><strong>{String(seconds).padStart(2, '0')}</strong><span>SEC</span></div><div className="timer-track"><span style={{ width: `${Math.min(100, remaining / 100)}%` }} /></div></div>
            : <div className="panel result-panel"><h2>{shownResult?.result === 'Win' ? 'You win' : shownResult?.result === 'Lost' ? 'You lose' : 'Match over'}</h2><p>{shownResult ? shownResult.reason === 'escape' ? `${shownResult.winner} escaped.` : `${shownResult.winner} caught the prisoner.` : 'Loading result…'}</p><button className="primary-button" disabled={!shownResult || !!shownVotes[shownInfo.you.nickname] } onClick={() => socket.current?.emit('game:rematchVote', true)}>{shownVotes[shownInfo.you.nickname] ? 'WAITING FOR PLAYER' : 'REMATCH'} <span>↗</span></button></div>}
          {social.features.chat || social.features.emotes
            ? <ChatPanel messages={social.messages} spoken={social.spoken} me={me} chatEnabled={social.features.chat} canSpeak={social.features.voice}
                open={social.chatOpen} unread={social.unread} onOpen={social.setChatOpen} onSend={social.sendChat} inputRef={chatInput}
                controls={<>{moveControls}<KeyList emoteCount={myEmotes.length} chat={social.features.chat} /></>} />
            : <div className="panel controls-panel">{moveControls}</div>}
        </aside>
      </div>}
    </main>
    {waitingReady && info && readyStatus && <div className="ready-overlay" role="dialog" aria-modal="true" aria-labelledby="ready-title">
      <div className="ready-card panel">
        <span className="eyebrow accent">MATCH FOUND</span>
        <h2 id="ready-title">Get ready</h2>
        <p>You are the <strong>{info.you.role.toUpperCase()}</strong> vs {info.opponent.nickname}. {info.you.role === 'warden' ? 'Catch the prisoner. You move first.' : 'Reach the tunnel before you are caught.'}</p>
        <StatusList names={[info.you.nickname, info.opponent.nickname]} ready={readyStatus.ready} you={info.you.nickname} />
        <button className="primary-button" autoFocus disabled={iAmReady} onClick={() => socket.current?.emit('game:ready')}>{iAmReady ? 'WAITING FOR RIVAL' : 'READY'} <span>↗</span></button>
      </div>
    </div>}
    {paused && info && pauseStatus && <div className="ready-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="ready-card panel">
        <span className="eyebrow accent">GAME PAUSED</span>
        <h2 id="pause-title">Paused</h2>
        <p>The clock is stopped with <strong>{Math.ceil((pauseStatus.remainingMs ?? 0) / 1000)}s</strong> left for {state?.turnNickname === info.you.nickname ? 'you' : state?.turnNickname ?? 'the current player'}. Both players press Resume to continue.</p>
        <StatusList names={[info.you.nickname, info.opponent.nickname]} ready={pauseStatus.resumeReady} you={info.you.nickname} />
        <button className="primary-button" autoFocus disabled={iResumed} onClick={() => socket.current?.emit('game:resume')}>{iResumed ? 'WAITING FOR RIVAL' : 'RESUME'} <span>↗</span></button>
      </div>
    </div>}
  </div>;
}
