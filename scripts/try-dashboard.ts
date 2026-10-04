// Fake two players so we can watch the server dashboard update.
// Start the server first (npm run dev), then run: npx tsx scripts/try-dashboard.ts

import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';

const alice = io(URL);
const bob = io(URL);

alice.on('connect', () => alice.emit('player:join', 'Alice'));
// Bob waits half a second so the joins happen in a clear order
bob.on('connect', () => setTimeout(() => bob.emit('player:join', 'Bob'), 500));

setTimeout(() => bob.disconnect(), 1500);   // Bob leaves
setTimeout(() => alice.disconnect(), 2500); // Alice leaves