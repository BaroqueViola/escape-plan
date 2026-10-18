# Chat, emotes, voice and spectating

Extra features built on top of Classic Mode. Every feature can be switched on or off per game mode in `server/modes.ts`, so a new mode can choose its own set.

## What players see

- **Emotes** (Clash Royale style): the three buttons under the board are your current role's emotes (prisoner: Hehehe / Nooo / Catch me; warden: Grrr / What?! / Nice). Press them or keys **1 2 3**. The emote pops up in a bubble over your character and plays a short ElevenLabs voice line, or a plain sound effect if voice is unavailable.
- **Chat**: bottom-right panel. Messages are up to 80 characters. Turn on **Speak** to have your message read aloud in your role's voice (one spoken message every 20 seconds).
- **Close chat**: the × button or **Esc** switches the panel to **Controls** (move pad and keyboard keys). **Enter** opens chat again; the Chat tab shows how many messages you missed.
- **Spectating**: while you wait for an opponent, the lobby lists live games. **Watch** shows the board live; you can chat and send silent crowd emotes (fire, wow, love, popcorn). You keep your place in the queue and join a match as soon as an opponent arrives.
- **Watching count**: players see "N WATCHING" in the top bar (hover for names).
- **Sound on/off** button in the top bar.

## Admin page

- Each game card shows its spectators.
- **Voice & chat** panel: ElevenLabs credits used today and this month, whether voice is working, and a **Turn chat off / on** button for everyone.
- **Mute** button next to each player (no chat, no emotes until unmuted).
- **Live feed** of chat messages, emotes and spectators joining or leaving.
- **Watch** a game to see everything its players see: the board with emote bubbles, the spectators, and the chat with emotes. The admin can write in that chat as ADMIN.
- **Kick** a player or spectator (in the Players list or the Watch view). A reason is required; the kicked person sees it and goes back to the name screen, and can join again straight away.

## Setup (ElevenLabs)

1. Copy `.env.example` to `.env` in the project folder.
2. Paste your key after `ELEVENLABS_API_KEY=`. Optionally set voice IDs for the warden and prisoner.
3. `npm start`. Without a key the game still works: emotes play sound effects and chat is text only.

`.env` and the voice cache are in `.gitignore`, so the key is never committed.

## How it saves credits (free plan: 10,000 credits a month)

- Every voice clip is saved in `server/.voice-cache/`, keyed by voice and text. A line is paid for once, ever. The six emote lines are made once when the server first starts (about 30 credits in total).
- The Flash model costs about half a credit per character.
- Chat messages are capped at 80 characters, and each player can speak one message every 20 seconds.
- Daily cap (`VOICE_DAILY_CREDITS`, default 300) and monthly cap (`VOICE_MONTHLY_CREDITS`, default 9,000). When a cap is reached, voice stops until the next day or month and the game uses sound effects and text.
- If ElevenLabs fails (bad key, out of credits, offline), voice pauses for 5 minutes instead of retrying on every message.

## How it works (networking)

| Event | Direction | What it does |
|---|---|---|
| `chat:send` `{ text, speak }` | client → server | Validated with Zod (1–80 chars). Server sends `chat:message` to the game room and the spectators' room. |
| `chat:spoken` `(messageId, clipId)` | server → clients | The voice clip is ready; browsers fetch `GET /voice/<clipId>`. |
| `emote:send` `emoteId` | client → server | Server checks the emote belongs to your role (or the crowd set for spectators), then sends `emote:show`. |
| `spectate:watch` `gameId` / `spectate:leave` | client → server | Joins or leaves the Socket.IO room `watch:<id>`. |
| `spectate:state` | server → spectators | The watched game's board after every move. |
| `social:spectators` | server → players and spectators | Count and names for the "WATCHING" badge. |
| `spectate:list` | server → everyone | Live games for the lobby's Spectate list. |
| `admin:mute`, `admin:chat` | admin → server | Mute a player, turn chat off or on. |
| `admin:watch` `gameId \| null` | admin → server | The admin's socket joins `watch:<id>` in the `/admin` namespace, so it gets the game's `chat:message`, `chat:spoken` and `emote:show` too (the board comes with `admin:dashboard`). |
| `admin:say` `(gameId, text)` | admin → server | A chat message from ADMIN in that game (1–80 chars). |
| `admin:kick` `(nickname, reason, done)` | admin → server | Reason is required (1–120 chars). The server sends `player:kicked` with the reason to that player, then disconnects them; the usual leave clean-up ends their game. Everyone else only sees "… was kicked by the admin". |

- **The API key never reaches the browser.** The server calls ElevenLabs (`server/voice.ts`) and serves the audio itself at `/voice/<id>`; the browser only ever gets a clip id.
- **Rooms:** players are in `game:<id>`; spectators are in a separate room `watch:<id>`, so player-only events (Ready, Pause, your role) never go to spectators, while chat and emotes go to both.
- **The server is authoritative:** it checks who may chat, which emotes you may use, mutes and spam limits; the browser only displays.
