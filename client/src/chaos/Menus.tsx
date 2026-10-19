// Menus after the nickname: Classic or Chaos, then (Chaos) the sub-mode, a side
// and a class. The class picker also explains the class and its keys, and the
// same cards are used again when a Chaos rematch asks both players to re-pick.

import { useState } from 'react';
import type { ClassId, Role } from '../../../server/events';
import { CLASS_INFO, SIDE_CLASSES } from './classInfo';
import { spriteUrl, type SpriteName } from './pixelSprites';
import { ClassDemo, useDemoFrame } from './ClassDemo';

export function PixelSprite({ name, size, className }: { name: SpriteName; size: number; className?: string }) {
  return <img className={`pixel-sprite${className ? ` ${className}` : ''}`} src={spriteUrl(name)} width={size} height={size} alt="" />;
}

// One key drawn as a keycap; Q / E / X / R get their own colours
export function KeyCap({ k, pressed }: { k: string; pressed?: boolean }) {
  const tone = k === 'Q' ? ' q' : k === 'E' ? ' e' : k === 'X' ? ' x' : k === 'Enter' || k === 'SPACE' ? ' m' : '';
  return <span className={`keycap${tone}${pressed ? ' pressed' : ''}`}>{k}</span>;
}

export function ControlsBar({ cls }: { cls: ClassId }) {
  return <div className="controls-bar"><b>CONTROLS</b>{CLASS_INFO[cls].controls.map((c) =>
    <span key={c.text} className="ctrl">{c.keys.map((k) => <KeyCap key={k} k={k} />)}<i>{c.text}</i></span>)}</div>;
}

function Heading({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) {
  return <div className="menu-heading">
    <div><span className="eyebrow accent">{eyebrow}</span><h2>{title}</h2></div>
    {onBack && <button className="small-button ghost" onClick={onBack}>◂ BACK</button>}
  </div>;
}

export function ModePicker({ onPick }: { onPick: (mode: 'classic' | 'chaos') => void }) {
  return <section className="menu panel">
    <Heading eyebrow="MODE" title="How do you want to play?" />
    <div className="menu-cards two">
      <button className="menu-card mode-classic" onClick={() => onPick('classic')}>
        <span className="eyebrow">CLASSIC</span><strong>Classic</strong>
        <span className="menu-art"><img src="/assets/prisoner.svg" alt="" /><img src="/assets/warden.svg" alt="" /></span>
        <small>5 × 5 board. Move, reach the tunnel or catch the prisoner.</small>
      </button>
      <button className="menu-card mode-chaos" onClick={() => onPick('chaos')}>
        <span className="eyebrow">CHAOS</span><strong>Chaos</strong>
        <span className="menu-art"><PixelSprite name="naruto" size={72} /><PixelSprite name="gojo" size={72} /></span>
        <small>7 × 7 board. Pick a class with its own abilities.</small>
      </button>
    </div>
  </section>;
}

export function ChaosModePicker({ onPick, onBack }: { onPick: () => void; onBack: () => void }) {
  return <section className="menu panel">
    <Heading eyebrow="CHAOS" title="Pick a Chaos mode" onBack={onBack} />
    <div className="menu-cards one">
      <button className="menu-card" onClick={onPick}>
        <span className="eyebrow">AVAILABLE</span><strong>Abilities</strong>
        <span className="menu-art">{(['allmight', 'naruto', 'sukuna', 'afo', 'sasuke', 'gojo'] as const).map((n) => <PixelSprite key={n} name={n} size={56} />)}</span>
        <small>3 prisoner and 3 warden classes, each with its own powers.</small>
      </button>
      <div className="menu-card soon"><span className="eyebrow">LATER</span><small>More Chaos modes are coming.</small></div>
    </div>
  </section>;
}

export function SidePicker({ onPick, onBack, taken }: { onPick: (side: Role) => void; onBack?: () => void; taken?: Partial<Record<Role, string>> }) {
  const card = (side: Role, sprite: SpriteName, title: string, text: string) => {
    const by = taken?.[side];
    return <button className="menu-card" disabled={!!by} onClick={() => onPick(side)}>
      <span className="eyebrow">{side.toUpperCase()}</span><strong>{title}</strong>
      <span className="menu-art"><PixelSprite name={sprite} size={88} /></span>
      <small>{by ? `${by} already took this side.` : text}</small>
    </button>;
  };
  return <section className="menu panel">
    <Heading eyebrow="CHAOS · ABILITIES" title="Pick a side" onBack={onBack} />
    <div className="menu-cards two">
      {card('prisoner', 'naruto', 'Prisoner', 'Reach the tunnel before you are caught.')}
      {card('warden', 'gojo', 'Warden', 'Catch the prisoner. You move first.')}
    </div>
    <p className="menu-note">If both players pick the same side, the first to pick keeps it.</p>
  </section>;
}

// Three class cards on the left; clicking one shows how it works on the right.
// Nothing is picked until Lock in. No time limit.
export function ClassPicker({ side, onLock, onBack, initial }: { side: Role; onLock: (cls: ClassId) => void; onBack?: () => void; initial?: ClassId | null }) {
  const options = SIDE_CLASSES[side];
  const [selected, setSelected] = useState<ClassId>(initial && options.includes(initial) ? initial : options[0]!);
  const info = CLASS_INFO[selected];
  return <section className="menu panel class-picker">
    <Heading eyebrow={`CHAOS · YOU'RE THE ${side.toUpperCase()}`} title="Pick your class" onBack={onBack} />
    <div className="class-layout">
      <div className="class-list">
        {options.map((cls) => {
          const c = CLASS_INFO[cls];
          return <button key={cls} className={`class-card${cls === selected ? ' on' : ''}`} onClick={() => setSelected(cls)} aria-pressed={cls === selected}>
            {cls === selected && <span className="viewing">▶ SHOWING</span>}
            <PixelSprite name={c.sprite} size={64} />
            <span className="class-copy"><strong>{c.name}</strong><em>{c.ability}</em><small>{c.blurb}</small></span>
            <span className="chev">›</span>
          </button>;
        })}
        <button className="primary-button lock-in" onClick={() => onLock(selected)}>LOCK IN {info.name.toUpperCase()} <span>↗</span></button>
        <p className="menu-note">Click a card to see how it works. Nothing is picked until you lock in.</p>
      </div>
      <ClassDetails cls={selected} demo />
    </div>
  </section>;
}

// How a class works: its steps with keys, and the controls bar.
// demo: also play the looping demo board and light up the step it shows.
export function ClassDetails({ cls, demo = false }: { cls: ClassId; demo?: boolean }) {
  const info = CLASS_INFO[cls];
  const { frame, index } = useDemoFrame(cls);
  const playing = demo && frame ? frame.step : -1;
  return <div className={`class-details${demo && frame ? ' with-demo' : ''}`}>
    {demo && frame && <ClassDemo cls={cls} frame={frame} index={index} />}
    <div className="class-how">
    <div className="class-title"><PixelSprite name={info.sprite} size={72} /><div><strong>{info.name}</strong><span className="eyebrow accent">{info.ability}</span></div></div>
    <ol className="class-steps">
      {info.steps.map((step, i) => <li key={step.title} className={i === playing ? 'on' : ''}>
        <span className="step-n">{i + 1}</span>
        <div><strong>{step.title}</strong><p>{step.text}</p>{step.keys.length > 0 && <div className="step-keys">{step.keys.map((k) => <KeyCap key={k} k={k} />)}</div>}</div>
      </li>)}
    </ol>
    </div>
    <ControlsBar cls={cls} />
  </div>;
}

// Chaos rematch: both players pick a side and class again
export function RematchPicker({ picked, taken, me, side, onSide, onLock, onBack }: {
  picked: string[]; taken: Partial<Record<Role, string>>; me: string; side: Role | null;
  onSide: (side: Role) => void; onLock: (cls: ClassId) => void; onBack: () => void;
}) {
  if (picked.includes(me)) {
    return <section className="menu panel"><Heading eyebrow="REMATCH" title="Waiting for your rival" />
      <p className="menu-note">You locked in. The next match starts as soon as your rival picks too.</p></section>;
  }
  return side === null
    ? <SidePicker onPick={onSide} taken={Object.fromEntries(Object.entries(taken).filter(([, name]) => name !== me))} />
    : <ClassPicker side={side} onLock={onLock} onBack={onBack} />;
}
