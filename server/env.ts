// Loads secrets such as ELEVENLABS_API_KEY from a .env file in the project folder.
// Imported first in server.ts so every other module sees the values.
// .env is in .gitignore: never commit it. See .env.example.

try {
  process.loadEnvFile();
} catch {
  // No .env file: that's fine, the game runs without voice
}
