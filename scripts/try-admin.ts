// Check the admin password: wrong is refused, right gets the dashboard.
// Start the server first (npm run dev), then run: npx tsx scripts/try-admin.ts

import { io } from 'socket.io-client';

const URL = 'http://localhost:3000/admin';

const intruder = io(URL, { auth: { password: 'wrong' } });
intruder.on('connect', () => console.log('PROBLEM: wrong password was accepted!'));
intruder.on('connect_error', (err) => {
  console.log('OK: wrong password refused →', err.message);
  intruder.disconnect();
});

const admin = io(URL, { auth: { password: 'admin123' } });
admin.on('admin:dashboard', (state) => {
  console.log('OK: admin received dashboard →', state);
  admin.disconnect();
});