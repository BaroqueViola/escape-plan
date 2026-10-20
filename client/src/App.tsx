import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClassId, ClientToServerEvents, CustomMapStatus, GameState, MatchInfo, MatchResult, PauseStatus, PickingStatus, QueueStatus, ReadyStatus, Role, ServerToClientEvents } from '../../server/events';
import { SERVER_URL } from './config';
import { useSocial } from './social/useSocial';
import { BoardStage, ChatPanel, EmoteStrip, EyePill, KeyList, SpectateList, crowdEmotes, emotesFor } from './social/SocialUI';
import { isMuted, setMuted, unlockAudio } from './social/sound';
import './social/social.css';
import { ChaosModePicker, ClassDetails, ClassPicker, ControlsBar, CustomMapPicker, ModePicker, PixelSprite, RematchPicker, SidePicker } from './chaos/Menus';
import { CLASS_INFO } from './chaos/classInfo';
import { spriteUrl } from './chaos/pixelSprites';
import { ARROW, describeEvents, KEY_DIRECTION, rivalStatus, useChaosControls, type AbilityRequest, type BoardChaos } from './chaos/Abilities';
import { introLeft, VoidWatch } from './chaos/DomainExpansion';
import './chaos/abilities.css';
import './chaos/menus.css';
import './chaos/chaos-colours.css';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Direction = 'up' | 'down' | 'left' | 'right';
type MenuStep = 'mode' | 'custom' | 'chaos' | 'side' | 'class';
const MENU_STEPS: readonly MenuStep[] = ['mode', 'custom', 'chaos', 'side', 'class'];
function savedMenu(): MenuStep {
  const value = window.sessionStorage.getItem('escape-plan-menu');
  return MENU_STEPS.includes(value as MenuStep) ? value as MenuStep : 'mode';
}
const MAX_STAYS = 2; // same as the game core

// Picture of a character: the Chaos class sprite, or the Classic prisoner / warden
const characterSrc = (role: Role, cls: ClassId | null | undefined): string =>
  cls ? spriteUrl(CLASS_INFO[cls].sprite) : `/assets/${role}.svg`;
const directions: Record<Direction, { x: number; y: number; label: string; key: string }> = {
  up: { x: 0, y: -1, label: '↑', key: 'W' },
  left: { x: -1, y: 0, label: '←', key: 'A' },
  down: { x: 0, y: 1, label: '↓', key: 'S' },
  right: { x: 1, y: 0, label: '→', key: 'D' },
};

function legalDirections(state: GameState | null, info: MatchInfo | null): Direction[] {
  if (!state || !info || state.status !== 'active' || state.turnNickname !== info.you.nickname) return [];
  if (state.chaos?.inVoid) return []; // the Void challenge instead of a move
  if (state.chaos?.blind) return ['up', 'left', 'down', 'right']; // in the dark any key can be tried
  const from = state.positions[info.you.role];
  return (Object.keys(directions) as Direction[]).filter((direction) => {
    const delta = directions[direction];
    const x = from.x + delta.x;
    const y = from.y + delta.y;
    if (x < 0 || y < 0 || x >= state.board.width || y >= state.board.height) return false;
    const tile = state.board.cells[y * state.board.width + x];
    if (info.you.role === 'prisoner' && state.chaos?.clones.some((c) => c.x === x && c.y === y)) return false; // clones block Naruto
    return tile === 'free' || (tile === 'tunnel' && info.you.role === 'prisoner');
  });
}

function Board({ state, info, legal, chaos }: { state: GameState; info: MatchInfo; legal: Direction[]; chaos?: BoardChaos }) {
  const from = state.positions[info.you.role];
  const terrain = state.mode === 'chaos' ? '-chaos' : '';
  const targets = new Set(state.chaos?.blind ? [] : legal.map((direction) => {
    const delta = directions[direction];
    return `${from.x + delta.x},${from.y + delta.y}`;
  }));
  const c = state.chaos;
  const at = <T extends { x: number; y: number }>(list: readonly T[] | undefined, x: number, y: number): T | undefined => list?.find((p) => p.x === x && p.y === y);
  const smash = c?.events.find((e) => e.kind === 'smash');
  // Tiles the last punch flew over, for the shockwave flash
  const shock = new Set<string>();
  if (smash?.kind === 'smash') {
    const d = directions[smash.direction];
    for (let x = smash.from.x + d.x, y = smash.from.y + d.y; x >= 0 && y >= 0 && x < state.board.width && y < state.board.height; x += d.x, y += d.y) shock.add(`${x},${y}`);
  }
  const fx = new Map<string, string>(); // tile -> one-off effect
  c?.events.forEach((e) => {
    if (e.kind === 'poof') fx.set(`${e.at.x},${e.at.y}`, 'poof');
    if (e.kind === 'crush') fx.set(`${e.at.x},${e.at.y}`, 'crush');
    if (e.kind === 'dismantle') fx.set(`${e.at.x},${e.at.y}`, 'boom');
    if (e.kind === 'shrine') fx.set(`${e.to.x},${e.to.y}`, 'wind');
    if (e.kind === 'collect') fx.set(`${e.at.x},${e.at.y}`, 'sparkle');
    if (e.kind === 'smash' && e.hit) { const target = state.positions[e.by === 'prisoner' ? 'warden' : 'prisoner']; fx.set(`${target.x},${target.y}`, 'boom'); }
  });
  const prisonerSrc = chaos?.prisonerSprite ? spriteUrl(chaos.prisonerSprite) : characterSrc('prisoner', state.classes?.prisoner);
  const hidden = !!c?.hidden;
  const blind = !!c?.blind;
  // A badge over the prisoner (over every figure when Naruto is hidden, so it gives nothing away)
  const prisonerBadge = !c ? null : c.stunned.prisoner > 0 ? `STUNNED · ${c.stunned.prisoner}`
    : c.illusion > 0 ? `ILLUSION · ${c.illusion}` : c.locked > 0 ? 'POWER STOLEN' : null;
  const wardenClass = state.classes?.warden ? CLASS_INFO[state.classes.warden].name : 'The warden';
  return <div className={`board-frame${blind ? ' blind' : ''}${c?.inVoid ? ' in-void' : ''}`}>
    <div className="board" role="img" aria-label={`${state.board.width} by ${state.board.height} map. Warden at column ${state.positions.warden.x + 1}, row ${state.positions.warden.y + 1}. ${hidden ? `${(c?.clones.length ?? 0) + 1} Narutos on the map, one of them real.` : `Prisoner at column ${state.positions.prisoner.x + 1}, row ${state.positions.prisoner.y + 1}.`} Tunnel marked by a glowing portal.`} style={{ gridTemplateColumns: `repeat(${state.board.width}, 1fr)` }}>
      {state.board.cells.map((tile, index) => {
        const x = index % state.board.width;
        const y = Math.floor(index / state.board.width);
        const id = `${x},${y}`;
        const warden = state.positions.warden.x === x && state.positions.warden.y === y;
        const prisoner = state.positions.prisoner.x === x && state.positions.prisoner.y === y;
        const clone = at(c?.clones, x, y);
        const wardenClone = at(c?.wardenClones, x, y);
        const pending = chaos?.pending.find((p) => p.x === x && p.y === y);
        const mark = chaos?.marks.get(id);
        const label = `${tile === 'free' ? 'Floor' : tile === 'obstacle' ? 'Wall' : 'Tunnel'}, column ${x + 1}, row ${y + 1}${warden ? ', warden' : ''}${prisoner ? hidden ? ', Naruto' : ', prisoner' : ''}${clone ? ', Naruto' + (hidden ? '' : ' clone') : ''}${at(c?.fingers, x, y) ? ', finger' : ''}${targets.has(id) ? ', legal destination' : ''}`;
        return <div key={index} className={`tile tile-${tile}${targets.has(id) ? ' tile-legal' : ''}${mark ? ` ${mark}` : ''}${at(c?.cracks, x, y) ? ' cracked' : ''}`} title={label}
          onClick={mark && chaos?.onTile ? () => chaos.onTile?.(x, y) : undefined}>
          <img className="terrain" src={`/assets/${tile}${terrain}.svg`} alt="" />
          {at(c?.fingers, x, y) && <span className="finger" />}
          {clone && <><img className={`character prisoner${hidden ? '' : ' clone'}`} src={characterSrc('prisoner', state.classes?.prisoner)} alt="" />{clone.direction && <span className={`clone-arrow ${clone.direction}`}>{ARROW[clone.direction]}</span>}</>}
          {pending && <><img className="character prisoner clone pending" src={characterSrc('prisoner', state.classes?.prisoner)} alt="" /><span className={`clone-arrow ${pending.direction ?? 'none'}`}>{pending.direction ? ARROW[pending.direction] : '?'}</span></>}
          {wardenClone && <><img className="character warden clone" src={characterSrc('warden', state.classes?.warden)} alt="" /><span className={`clone-arrow ${wardenClone.direction}`}>{ARROW[wardenClone.direction]}</span><span className="stun-badge clone-life">CLONE · {wardenClone.life}</span></>}
          {warden && !blind && <img className={`character warden${c && c.stunned.warden > 0 ? ' stunned' : ''}`} src={characterSrc('warden', state.classes?.warden)} alt="" />}
          {prisoner && !blind && <img className={`character prisoner${chaos?.prisonerSprite ? ' buff' : ''}${c?.inVoid ? ' voided' : ''}`} src={prisonerSrc} alt="" />}
          {warden && !blind && c && c.stunned.warden > 0 && <span className="stun-badge">STUNNED · {c.stunned.warden}</span>}
          {!blind && prisonerBadge && (prisoner || (hidden && clone)) && <span className="stun-badge">{prisonerBadge}</span>}
          {shock.has(id) && <span key={`s${state.serverTime}`} className="fx shock" />}
          {fx.has(id) && <span key={`f${state.serverTime}`} className={`fx ${fx.get(id)}`}>{fx.get(id) === 'crush' ? '✕' : ''}</span>}
          {targets.has(id) && !blind && <span className="move-dot" />}
        </div>;
      })}
    </div>
    {blind && c && <div className="board-veil sharingan"><b>SHARINGAN</b><p>You can't see a thing. Your keys are shuffled for {c.illusion} more turn{c.illusion === 1 ? '' : 's'}.</p></div>}
    {chaos?.overlay ?? (c?.inVoid && <VoidWatch key={state.turnDeadline} ms={introLeft(state)} wardenClass={wardenClass} />)}
  </div>;
}

// Chaos: what happened last turn, and what the rival's power is up to
function ChaosLog({ state, you, rival }: { state: GameState; you: Role | null; rival: ClassId | null }) {
  const last = describeEvents(state, you);
  const status = rivalStatus(state, rival);
  if (!last && !status) return null;
  return <div className="chaos-log">{last && <p className="last">{last}</p>}{status && <p className="rival">{status}</p>}</div>;
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

function PlayerCard({ name, role, cls, score, active, self, label }: { name: string; role: Role; cls?: ClassId | null; score: number; active: boolean; self: boolean; label?: string }) {
  return <div className={`player-card${active ? ' player-active' : ''}`}>
    <div className={`portrait portrait-${role}`}><img src={characterSrc(role, cls)} alt="" /></div>
    <div className="player-copy"><span className="eyebrow">{label ?? (self ? 'YOU' : 'RIVAL')} · {cls ? CLASS_INFO[cls].name.toUpperCase() : role.toUpperCase()}</span><strong>{name}</strong></div>
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
  // After joining: which menu is open, the side being picked, and the queue the server confirmed
  const [menu, setMenu] = useState<MenuStep>(savedMenu);
  const [pickSide, setPickSide] = useState<Role | null>(null);
  const [queued, setQueued] = useState<QueueStatus | null>(null);
  const [customSettings, setCustomSettings] = useState<CustomMapStatus | null>(null);
  const [picking, setPicking] = useState<PickingStatus | null>(null); // Chaos rematch: re-pick side and class
  const [showHelp, setShowHelp] = useState(false); // the "?" keybind card
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [leavingMatch, setLeavingMatch] = useState(false);
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
      setConnected(false); setJoined(false); setInfo(null); setState(null); setResult(null); setReadyStatus(null); setPauseStatus(null); setLeavingMatch(false); setConfirmQuit(false);
      setQueued(null); setCustomSettings(null); setPicking(null); setPickSide(null);
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
    client.on('lobby:customSettings', setCustomSettings);
    client.on('player:rejected', (message) => { pendingName.current = ''; setNotice(message); });
    client.on('game:started', (value) => { setInfo(value); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setPicking(null); setPickSide(null); setNotice(''); });
    client.on('player:queued', (status) => { setQueued(status); if (!status) setMenu((current) => current === 'custom' || current === 'class' ? current : 'mode'); });
    // Chaos: the side we picked was taken first, so pick a class on the other side
    client.on('player:sideTaken', (message, side) => { setPickSide(side); setMenu('class'); setNotice(message); });
    client.on('game:picking', (status) => { setPicking(status.picking ? status : null); if (!status.picking) setPickSide(null); });
    client.on('game:readyStatus', setReadyStatus);
    client.on('game:pauseStatus', setPauseStatus);
    client.on('game:state', (value) => { setState(value); setReceivedAt(performance.now()); setElapsed(0); });
    client.on('game:ended', setResult);
    client.on('game:rematchStatus', setVotes);
    client.on('game:rejected', setNotice);
    client.on('game:opponentLeft', (message) => { setInfo(null); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setPicking(null); setPickSide(null); setQueued(null); setMenu('mode'); setNotice(message); });
    client.on('server:reset', (message) => { setInfo(null); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null); setNotice(message); });
    return () => { client.removeAllListeners(); client.disconnect(); socket.current = null; };
  }, []);

  useEffect(() => {
    if (joined && menu === 'custom') socket.current?.emit('player:customSettings:get');
  }, [joined, menu]);

  useEffect(() => { window.sessionStorage.setItem('escape-plan-menu', menu); }, [menu]);

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
    result: state.outcome.winner === null ? 'Draw' : state.outcome.winner === info.you.nickname ? 'Win' : 'Lost',
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
  const myStays = shownInfo && shownState?.staysLeft ? shownState.staysLeft[shownInfo.you.role] : 0;
  const canStay = myTurn && myStays > 0 && remaining > 0 && !shownState?.chaos?.inVoid;
  const blind = !!shownState?.chaos?.blind;
  // Chaos: Q / E abilities and aiming on the board
  const chaosControls = useChaosControls({ state: shownState, info: shownInfo, myTurn: myTurn && remaining > 0,
    send: (ability: AbilityRequest) => socket.current?.emit('game:ability', ability) });

  function join(event: React.FormEvent) {
    event.preventDefault();
    const value = nickname.trim();
    if (!value || !socket.current?.connected) return;
    pendingName.current = value;
    setNotice('');
    setKickedReason(null);
    socket.current.emit('player:join', value);
  }
  // Classic, or Chaos with a side and class: join the queue for that mode
  function queueFor(mode: 'classic' | 'chaos', side?: Role, cls?: ClassId) {
    setNotice('');
    socket.current?.emit('player:queue', mode === 'classic' ? { mode } : { mode, side, cls });
  }
  function queueCustom(width: number, height: number, obstacleDensity: number) {
    setNotice('');
    if (!customSettings?.isHost) {
      socket.current?.emit('player:queue', { mode: 'custom' });
      return;
    }
    socket.current?.emit('player:customSettings:set', { width, height, obstacleDensity }, (saved) => {
      if (!saved.ok) { setNotice(saved.reason ?? 'Could not save map settings.'); return; }
      socket.current?.emit('player:queue', { mode: 'custom' });
    });
  }
  function saveCustomSettings(width: number, height: number, obstacleDensity: number) {
    socket.current?.emit('player:customSettings:set', { width, height, obstacleDensity }, (saved) => {
      if (!saved.ok) setNotice(saved.reason ?? 'Could not save map settings.');
      else setNotice('Map settings saved for everyone in custom mode.');
    });
  }
  function leaveQueue() {
    socket.current?.emit('player:leaveQueue');
    setMenu(queued?.mode === 'custom' ? 'custom' : queued?.mode === 'chaos' ? 'class' : 'mode');
    if (queued?.side) setPickSide(queued.side);
  }
  function returnToMenu() {
    if (leavingMatch) return;
    setLeavingMatch(true);
    socket.current?.emit('game:leave');
    // Leave the result screen immediately so REMATCH cannot still be clicked
    // while the server is processing the leave event.
    setConfirmQuit(false);
    setInfo(null); setState(null); setResult(null); setVotes({}); setReadyStatus(null); setPauseStatus(null);
    setPicking(null); setPickSide(null); setQueued(null); setMenu('mode'); setNotice('');
    setLeavingMatch(false);
  }
  function stayPut() {
    if (canStay) socket.current?.emit('game:stay');
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
      if (!showHelp && chaosControls.onKey(event)) { event.preventDefault(); return; }
      const emote = myEmotes[Number(event.key) - 1];
      if (emote) { event.preventDefault(); social.sendEmote(emote); return; }
      if (event.key === 'Enter' && inChat && social.features.chat && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); openChat(); return; }
      if (event.key === 'Escape' && showHelp) { setShowHelp(false); return; }
      if (event.key === 'Escape' && social.chatOpen) { social.setChatOpen(false); return; }
      if (event.key === '?' && info?.you.cls) { event.preventDefault(); setShowHelp((open) => !open); return; }
      if ((event.key === 'x' || event.key === 'X') && info) { event.preventDefault(); stayPut(); return; }
      const direction = KEY_DIRECTION[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (direction) { event.preventDefault(); move(direction); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Spectator view: the watched game's board, players and clock
  const watchedRemaining = watching?.state?.turnDeadline == null || !watching.state || watching.status !== 'playing' ? 0
    : Math.max(0, watching.state.turnDeadline - watching.state.serverTime - (performance.now() - social.watchingAt));
  const moveControls = <><div className="panel-heading"><span className="eyebrow accent">MOVE</span><span>WASD / ARROWS · X STAY</span></div><div className="control-grid">{(['up', 'left', 'down', 'right'] as Direction[]).map((direction) => <button key={direction} className={`direction direction-${direction}`} aria-label={`Move ${direction}`} disabled={!legal.includes(direction) || remaining <= 0} onClick={() => move(direction)}><strong>{blind ? '?' : directions[direction].label}</strong><small>{directions[direction].key}</small></button>)}</div>
    {shownState?.status === 'active' && chaosControls.panel}
    {shownState?.status === 'active' && <div className="stay-row">
      <button className={`stay-button${myTurn && myStays === 0 && !shownState.chaos?.inVoid ? '' : ' idle'}`} disabled={!canStay} onClick={stayPut} title="Keep your spot this turn. At most 2 in a row.">{myTurn && myStays === 0 && !shownState.chaos?.inVoid ? 'MUST MOVE' : 'X STAY'}</button>
      {info?.you.cls && <button className="small-button help-button" onClick={() => setShowHelp(true)} title="How your class works (?)">?</button>}
      <span className="stays-left">STAYS LEFT {Array.from({ length: MAX_STAYS }, (_, i) => <s key={i} className={i < myStays ? '' : 'used'} />)}</span>
    </div>}
    {info?.you.cls && <ControlsBar cls={info.you.cls} />}</>;
  const me = info?.you.nickname ?? (pendingName.current || nickname.trim());
  // Chaos turns the whole page purple: from picking Chaos in the menu, through the queue and the game
  const chaosTheme = info ? info.mode === 'chaos' : watching ? watching.mode === 'chaos'
    : queued ? queued.mode === 'chaos' : menu === 'chaos' || menu === 'side' || menu === 'class';
  const modeLabel = chaosTheme ? 'CHAOS · ABILITIES' : queued?.board ? 'CUSTOM MAP' : 'CLASSIC';
  const menus = menu === 'mode' ? <ModePicker onPick={(mode) => mode === 'classic' ? queueFor('classic') : setMenu('chaos')} onCustom={() => setMenu('custom')} />
    : menu === 'custom' ? <CustomMapPicker onStart={queueCustom} onSave={saveCustomSettings} onBack={() => setMenu('mode')} isHost={customSettings?.isHost ?? false} ready={customSettings !== null} host={customSettings?.host ?? null} board={customSettings?.board ?? { width: 5, height: 5, obstacleDensity: 20 }} />
    : menu === 'chaos' ? <ChaosModePicker onPick={() => setMenu('side')} onBack={() => setMenu('mode')} />
    : menu === 'side' || pickSide === null ? <SidePicker onPick={(side) => { setPickSide(side); setMenu('class'); }} onBack={() => setMenu('chaos')} />
    : <ClassPicker key={pickSide} side={pickSide} initial={queued?.cls} onLock={(cls) => queueFor('chaos', pickSide, cls)} onBack={() => setMenu('side')} />;

  return <div className={`app-shell${chaosTheme ? ' theme-chaos' : ''}`} onPointerDown={unlockAudio}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>ESCAPE<span>PLAN</span></strong><small>{modeLabel}</small></div></div>
      <div className="topbar-actions">
        {inChat && social.features.spectate && <EyePill count={social.spectators.count} names={social.spectators.names} />}
        {info && <button className="small-button ghost" disabled={leavingMatch} onClick={() => shownState?.status === 'finished' ? returnToMenu() : setConfirmQuit(true)}>{leavingMatch ? 'LEAVING…' : '⌂ MAIN MENU'}</button>}
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
        <section className="game-panel panel"><div className="game-topline"><span className="eyebrow accent">WATCHING · GAME {watching.id}</span><span className="match-badge">{watching.status === 'finished' ? 'FINISHED' : watching.status === 'ready' ? 'GET READY' : watching.status === 'paused' ? 'PAUSED' : watching.status === 'picking' ? 'PICKING CLASSES' : `${watching.turn ?? ''}'S TURN`}</span></div>
          <div className="board-area"><BoardStage state={watching.state} bubbles={social.bubbles} board={<Board state={watching.state} info={{ mode: watching.mode, you: { nickname: '', role: 'warden', cls: null }, opponent: { nickname: '', role: 'prisoner', cls: null } }} legal={[]} />} /></div>
          {watching.state.chaos && <ChaosLog state={watching.state} you={null} rival={null} />}
          <div className="board-footer"><span><i className="legend-dot wall" /> WALL</span><span><i className="legend-dot tunnel" /> TUNNEL</span></div>
          {myEmotes.length > 0 && <EmoteStrip label="CROWD" emotes={myEmotes} readyAt={social.emoteReadyAt} onSend={social.sendEmote} />}
        </section>
        <aside className="sidebar"><div className="panel match-panel"><div className="panel-heading"><span className="eyebrow accent">WATCHING</span><span>{watching.spectators.length} SPECTATOR{watching.spectators.length === 1 ? '' : 'S'}</span></div>
            {watching.players.map((p, i) => <div key={p.nickname}>{i > 0 && <div className="versus">VS</div>}<PlayerCard name={p.nickname} role={p.role ?? 'prisoner'} cls={p.cls} score={p.score} active={watching.turn === p.nickname} self={false} label={watching.turn === p.nickname ? '▶ TURN' : 'PLAYER'} /></div>)}</div>
          {watching.status === 'playing' ? <div className="panel turn-panel"><div className="turn-label"><span className="eyebrow accent">TIME LEFT</span></div><div className={`timer${watchedRemaining <= 3000 ? ' timer-low' : ''}`}><strong>{String(Math.ceil(watchedRemaining / 1000)).padStart(2, '0')}</strong><span>SEC</span></div><div className="timer-track"><span style={{ width: `${Math.min(100, watchedRemaining / 100)}%` }} /></div></div>
            : <div className="panel turn-panel"><div className="turn-label"><span className="eyebrow accent">{watching.status === 'finished' ? 'MATCH OVER' : watching.status === 'paused' ? 'PAUSED' : 'READY CHECK'}</span></div><p>{watching.status === 'finished' && watching.winner ? `${watching.winner} won. Waiting for a rematch.` : watching.status === 'paused' ? 'Both players agreed to pause.' : 'Waiting for both players to press Ready.'}</p></div>}
          <ChatPanel messages={social.messages} spoken={social.spoken} me={me} chatEnabled={social.features.chat} canSpeak={false}
            open={social.chatOpen} unread={social.unread} onOpen={social.setChatOpen} onSend={social.sendChat} inputRef={chatInput}
            controls={<><div className="panel-heading"><span className="eyebrow accent">SPECTATING</span><span>READ ONLY</span></div>
              <p className="spectator-note">You can't move pieces. Send crowd emotes with the buttons under the board. You keep your place in the queue and join a match as soon as an opponent arrives.</p>
              <button className="small-button" onClick={social.leave}>LEAVE ✕</button>
              <KeyList emoteCount={myEmotes.length} chat={social.features.chat} /></>} />
        </aside>
      </div> : (!shownState || !shownInfo) && !queued ? menus
      : !shownState || !shownInfo ? <div className="lobby-stack"><section className="lobby-panel panel">
        <div className="lobby-title"><span className="eyebrow accent">{queued?.mode === 'chaos' ? 'CHAOS · ABILITIES' : queued?.board ? `CUSTOM · ${queued.board.width} × ${queued.board.height} · ${queued.board.obstacleDensity}% WALLS` : 'CLASSIC'} · LOBBY</span><h2>{welcome || 'Welcome.'}</h2><p>{queued?.mode === 'chaos' ? `Waiting for a ${queued.side === 'warden' ? 'prisoner' : 'warden'} to join.` : queued?.mode === 'custom' ? 'Waiting for another custom mode player. Custom mode uses Classic rules.' : 'Waiting for another player.'}</p><button className="small-button ghost" onClick={leaveQueue}>◂ {queued?.mode === 'custom' ? 'CHANGE SETTINGS' : queued?.mode === 'chaos' ? 'CHANGE CLASS' : 'CHANGE MODE'}</button></div>
        <div className="lobby-list"><div className="list-heading"><span>YOUR MATCH</span><strong>1/2</strong></div><div className="lobby-player"><span className="slot">01</span>{queued?.cls ? <PixelSprite name={CLASS_INFO[queued.cls].sprite} size={36} /> : <img src="/assets/prisoner.svg" alt="" />}<strong>{pendingName.current || nickname.trim()} (you){queued?.cls ? ` · ${CLASS_INFO[queued.cls].name}` : ''}</strong></div><div className="empty-slot"><span className="slot">02</span><span className="loading-block" />Waiting for another player...</div></div>
      </section>
      {social.features.spectate && <SpectateList games={social.liveGames} onWatch={social.watch} />}
      </div> : <div className="game-layout">
        <section className="game-panel panel"><div className="game-topline"><span className="eyebrow accent">{modeLabel} · {shownState.board.width} × {shownState.board.height}</span><span className="match-badge">{shownState.status === 'finished' ? 'FINISHED' : waitingReady ? 'GET READY' : paused ? 'PAUSED' : myTurn ? 'YOUR TURN' : `${shownState.turnNickname}'S TURN`}</span></div><div className="board-area"><BoardStage state={shownState} bubbles={social.bubbles} board={<Board state={shownState} info={shownInfo} legal={chaosControls.targeting ? [] : legal} chaos={chaosControls.board} />} /></div><div className="board-footer"><span><i className="legend-dot wall" /> WALL</span><span><i className="legend-dot tunnel" /> TUNNEL</span><span><i className="legend-dot target" /> MOVE</span></div>
          {shownState.chaos && <ChaosLog state={shownState} you={shownInfo.you.role} rival={shownInfo.opponent.cls} />}
          {myEmotes.length > 0 && <EmoteStrip emotes={myEmotes} readyAt={social.emoteReadyAt} onSend={social.sendEmote} />}</section>
        <aside className="sidebar"><div className="panel match-panel"><div className="panel-heading"><span className="eyebrow accent">PLAYERS</span></div><PlayerCard name={shownInfo.you.nickname} role={shownInfo.you.role} cls={shownInfo.you.cls} score={shownState.scores[shownInfo.you.nickname] ?? 0} active={myTurn} self /><div className="versus">VS</div><PlayerCard name={shownInfo.opponent.nickname} role={shownInfo.opponent.role} cls={shownInfo.opponent.cls} score={shownState.scores[shownInfo.opponent.nickname] ?? 0} active={!myTurn && shownState.status === 'active'} self={false} /></div>
          {shownState.status === 'active' ? <div className="panel turn-panel" title="At zero, the server makes a random legal move."><div className="turn-label"><span className="eyebrow accent">TIME LEFT</span></div><div className={`timer${seconds <= 3 ? ' timer-low' : ''}`}><strong>{String(seconds).padStart(2, '0')}</strong><span>SEC</span></div><div className="timer-track"><span style={{ width: `${Math.min(100, remaining / 100)}%` }} /></div></div>
            : <div className="panel result-panel"><h2>{shownResult?.result === 'Win' ? 'You win' : shownResult?.result === 'Lost' ? 'You lose' : shownResult?.result === 'Draw' ? 'Draw' : 'Match over'}</h2><p>{shownResult ? shownResult.reason === 'stalemate' ? 'The same position occurred three times. The match is a draw.' : shownResult.reason === 'escape' ? `${shownResult.winner} escaped.` : `${shownResult.winner} caught the prisoner.` : 'Loading result…'}</p><div className="result-actions"><button className="primary-button" disabled={!shownResult || !!shownVotes[shownInfo.you.nickname] } onClick={() => socket.current?.emit('game:rematchVote', true)}>{shownVotes[shownInfo.you.nickname] ? 'WAITING FOR PLAYER' : 'REMATCH'} <span>↗</span></button><button className="small-button ghost" onClick={returnToMenu}>QUIT TO MODE SELECTION</button></div></div>}
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
        <p>You are the <strong>{info.you.cls ? `${CLASS_INFO[info.you.cls].name.toUpperCase()} (${info.you.role.toUpperCase()})` : info.you.role.toUpperCase()}</strong> vs {info.opponent.nickname}{info.opponent.cls ? ` as ${CLASS_INFO[info.opponent.cls].name}` : ''}. {info.you.role === 'warden' ? 'Catch the prisoner. You move first.' : 'Reach the tunnel before you are caught.'}</p>
        <StatusList names={[info.you.nickname, info.opponent.nickname]} ready={readyStatus.ready} you={info.you.nickname} />
        <button className="primary-button" autoFocus disabled={iAmReady} onClick={() => socket.current?.emit('game:ready')}>{iAmReady ? 'WAITING FOR RIVAL' : 'READY'} <span>↗</span></button>
      </div>
    </div>}
    {picking && info && <div className="ready-overlay" role="dialog" aria-modal="true" aria-label="Pick your side and class">
      <RematchPicker picked={picking.picked} taken={picking.taken} me={info.you.nickname} side={pickSide} wardenRequired={picking.wardenRequired}
        onSide={setPickSide} onBack={() => setPickSide(null)}
        onLock={(side, cls) => socket.current?.emit('game:pick', { side, cls })} />
    </div>}
    {confirmQuit && info && shownState?.status !== 'finished' && <div className="ready-overlay" role="dialog" aria-modal="true" aria-labelledby="quit-title">
      <div className="ready-card panel">
        <span className="eyebrow accent">LEAVE MATCH</span>
        <h2 id="quit-title">Quit to menu?</h2>
        <p>Leaving now will end this match for both players and return you to mode selection.</p>
        <div className="result-actions"><button className="primary-button" disabled={leavingMatch} onClick={returnToMenu}>{leavingMatch ? 'LEAVING…' : 'QUIT MATCH'}</button><button className="small-button ghost" disabled={leavingMatch} onClick={() => setConfirmQuit(false)}>KEEP PLAYING</button></div>
      </div>
    </div>}
    {showHelp && info?.you.cls && <div className="ready-overlay" role="dialog" aria-modal="true" aria-label="How your class works" onClick={() => setShowHelp(false)}>
      <div className="keybind-card panel" onClick={(event) => event.stopPropagation()}>
        <div className="menu-heading"><div><span className="eyebrow accent">YOUR CLASS · ? TO CLOSE</span><h2>How it works</h2></div><button className="small-button ghost" onClick={() => setShowHelp(false)}>CLOSE ✕</button></div>
        <ClassDetails cls={info.you.cls} />
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
