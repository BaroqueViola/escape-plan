// Zod schemas for validating data sent by clients.
// Clients can send anything, so check every payload here before using it.

import { z } from 'zod';
import { CROWD_EMOTES, PRISONER_EMOTES, WARDEN_EMOTES } from './events.js';
import { CLASSES, sideOf, type ClassId } from '../packages/game-core/src/index.js';

export const Nickname = z
  .string({ error: 'Nickname must be text' })
  .trim()
  .min(1, { error: 'Nickname cannot be empty' })
  .max(20, { error: 'Nickname must be 20 characters or fewer' })
  // Letters, numbers, spaces and _ only (also blocks HTML like <script>)
  .regex(/^[a-zA-Z0-9_ ]+$/, {
    error: 'Nickname can only contain letters, numbers, spaces and _',
  });

export type Nickname = z.infer<typeof Nickname>;

// Direction for game:move
export const Direction = z.enum(['up', 'down', 'left', 'right'], {
  error: 'Direction must be up, down, left or right',
});
 
export type Direction = z.infer<typeof Direction>;
 
// Chaos ability for game:ability (the core checks whether it is allowed)
const Spot = z.object({ x: z.number().int().min(0).max(50), y: z.number().int().min(0).max(50) });
export const AbilityRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('smash'), direction: Direction }),
  z.object({ kind: z.literal('clones'), clones: z.array(Spot.extend({ direction: Direction })).min(1).max(3) }),
  Spot.extend({ kind: z.literal('swap') }),
  z.object({ kind: z.literal('dismantle'), direction: Direction }),
  z.object({ kind: z.literal('shrine') }),
  z.object({ kind: z.literal('steal') }),
  z.object({ kind: z.literal('sharingan') }),
  z.object({ kind: z.literal('void') }),
  z.object({ kind: z.literal('escape'), hits: z.array(z.boolean()).length(3) }),
], { error: 'Unknown ability' });

// Chaos side and class. The class must belong to the side.
export const ClassPick = z.object({
  side: z.enum(['prisoner', 'warden'], { error: 'Pick prisoner or warden' }),
  cls: z.enum([...CLASSES.prisoner, ...CLASSES.warden] as [ClassId, ...ClassId[]], { error: 'Unknown class' }),
}).refine((p) => sideOf(p.cls) === p.side, { error: 'That class is not on your side' });

// What a player queues for after joining: Classic, or Chaos with a side and class
export const QueueRequest = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('classic') }),
  z.object({ mode: z.literal('fog') }),
  z.object({ mode: z.literal('custom') }),
  z.object({ mode: z.literal('chaos'), side: z.enum(['prisoner', 'warden']), cls: z.string() }),
], { error: 'Pick a game mode' }).superRefine((q, ctx) => {
  if (q.mode === 'chaos' && !ClassPick.safeParse({ side: q.side, cls: q.cls }).success) {
    ctx.addIssue({ code: 'custom', message: 'Pick a class for your side' });
  }
});

export const CustomMapSettingsRequest = z.object({
  width: z.number().int().min(5).max(20),
  height: z.number().int().min(5).max(20),
  obstacleDensity: z.number().int().min(5).max(30),
});

// Answer to the rematch button: true = accept, false = decline
export const RematchVote = z.boolean({ error: 'Vote must be true or false' });
 
export type RematchVote = z.infer<typeof RematchVote>;

// Answer to a pause request: true = accept, false = decline
export const PauseAnswer = z.boolean({ error: 'Answer must be true or false' });

export type PauseAnswer = z.infer<typeof PauseAnswer>;

// Chat message: up to 80 characters (keeps voice credits low); speak = read it aloud
export const ChatSend = z.object({
  text: z.string({ error: 'Message must be text' }).trim()
    .min(1, { error: 'Message cannot be empty' })
    .max(80, { error: 'Messages can be up to 80 characters' }),
  speak: z.boolean().default(false),
});

export type ChatSend = z.infer<typeof ChatSend>;

// Emote id (which ones a sender may use is checked in social.ts)
export const Emote = z.enum([...PRISONER_EMOTES, ...WARDEN_EMOTES, ...CROWD_EMOTES], { error: 'Unknown emote' });

// Game id to spectate
export const GameId = z.string().regex(/^\d{1,6}$/, { error: 'Unknown game' });

// Admin: mute a player / turn chat on or off
export const AdminMute = z.object({ nickname: Nickname, muted: z.boolean() });
export const AdminChat = z.boolean();

// Admin: watch a game (null = stop), write in its chat, kick a player or spectator
export const AdminWatch = GameId.nullable();
export const AdminSay = z.object({
  gameId: GameId,
  text: z.string({ error: 'Message must be text' }).trim()
    .min(1, { error: 'Message cannot be empty' })
    .max(80, { error: 'Messages can be up to 80 characters' }),
});
export const AdminKick = z.object({
  nickname: Nickname,
  reason: z.string({ error: 'Reason must be text' }).trim()
    .min(1, { error: 'Write a reason for the kick' })
    .max(120, { error: 'The reason can be up to 120 characters' }),
});
