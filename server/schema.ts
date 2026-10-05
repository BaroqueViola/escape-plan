// Zod schemas for validating data sent by clients.
// Clients can send anything, so check every payload here before using it.

import { z } from 'zod';

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
 
// Answer to the rematch button: true = accept, false = decline
export const RematchVote = z.boolean({ error: 'Vote must be true or false' });
 
export type RematchVote = z.infer<typeof RematchVote>;

// Answer to a pause request: true = accept, false = decline
export const PauseAnswer = z.boolean({ error: 'Answer must be true or false' });

export type PauseAnswer = z.infer<typeof PauseAnswer>;
