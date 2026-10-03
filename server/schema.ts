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
