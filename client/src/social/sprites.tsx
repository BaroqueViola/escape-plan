// Emote pixel art as React components (the pixel data is in emoteArt.ts)

import type { CrowdEmote, PlayerEmote } from '../../../server/events';
import { CROWD_EMOTE_ART as CROWD, PALETTE, PLAYER_EMOTE_ART as PLAYER, type EmoteSprite } from './emoteArt';

export const PLAYER_EMOTE_ART: Record<PlayerEmote, EmoteSprite> = PLAYER;
export const CROWD_EMOTE_ART: Record<CrowdEmote, EmoteSprite> = CROWD;

// Draws a grid as crisp pixels
export function Sprite({ grid, className }: { grid: string[]; className?: string }) {
  const width = grid[0]?.length ?? 0;
  return <svg className={className} viewBox={`0 0 ${width} ${grid.length}`} shapeRendering="crispEdges" aria-hidden="true">
    {grid.flatMap((row, y) => [...row].map((c, x) => c === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={PALETTE[c]} />))}
  </svg>;
}

export function EmoteArt({ emote, className }: { emote: PlayerEmote | CrowdEmote; className?: string }) {
  const art = emote in PLAYER_EMOTE_ART ? PLAYER_EMOTE_ART[emote as PlayerEmote] : CROWD_EMOTE_ART[emote as CrowdEmote];
  return <Sprite grid={art.grid} className={className} />;
}
