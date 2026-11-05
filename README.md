# Escape Plan

A two-player online jailbreak game, built for the Netcentric course
(Information and Communication Engineering, Year 3, Chulalongkorn University).

One player is the **warden**, the other is the **prisoner**, and there is one
**tunnel**. The prisoner wins by reaching the tunnel; the warden wins by
catching the prisoner. Players take turns on a small grid, each move is checked
by the server, and both screens update at the same time.

![Classic mode on two computers](docs/images/classic.png)

## Contents

- [How to play](#how-to-play)
- [Features](#features)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing](#testing)
- [More documentation](#more-documentation)
- [Contributors](#contributors)
- [License](#license)

## How to play

1. Enter a nickname and pick a mode. The server pairs you with another player
   who picked the same mode.
2. Both players press **Ready**. Roles are random in the first match.
3. The warden moves first, then turns alternate. Move one tile up, down, left
   or right with the **arrow keys**, **WASD** or the on-screen buttons.
   Highlighted tiles show where you can go.
4. Walls block both players. Only the prisoner can enter the tunnel.
5. Each turn has a timer (10 seconds in Classic). Press **X** to **Stay** and
   skip a move, at most twice in a row (moving gives the stays back). If the
   timer runs out, the server uses a stay for you, or makes a random legal
   move when you have none left.
6. The prisoner scores a point by reaching the tunnel, the warden by catching
   the prisoner. If the same position comes up three times, the match is a draw.
7. A rematch starts when both players vote for it. The winner becomes the
   warden, and every match gets a new random map.

## Features

### Classic mode (the course requirements)

- Server on port 3000 and clients on other computers in the same network.
- Nicknames checked by the server, and a live **Online now** list of players.
- 5×5 board with 19 free tiles, 5 walls and 1 tunnel. Every map is checked
  before use: the prisoner can reach the tunnel by two separate routes, nobody
  starts next to it, and the warden starts close enough to give chase.
- 10-second turns timed by the server, so both screens show the same countdown.
- Scores, win/lose screens on both computers at once, and rematch voting.
- An admin page on the server showing connected clients, with a **Reset**
  button that ends the game and sets every score to 0.

### Extra features

| Feature | What it does |
| --- | --- |
| **Vs AI** | Play against a bot that runs on the server. It uses breadth-first search to chase you as the warden, or to head for the tunnel and keep away from you as the prisoner. |
| **AI voices** | Emotes and chat messages can be spoken aloud in each role's voice using ElevenLabs. Each line is generated once and saved. Without an API key, sound effects play instead. |
| **Chat and emotes** | Messages of up to 80 characters and three emotes per role (keys **1 2 3**). |
| **Chaos mode** | A 7×7 board with 20-second turns. Each side picks one of six classes with its own ability, such as shadow clones or Gojo's Domain Expansion timing challenge. See [docs/CHAOS_MODE.md](docs/CHAOS_MODE.md). |
| **Admin tools** | Password-protected admin page with a live activity feed, mute, chat on/off, live watching of any game, kick with a reason, and a safe server shutdown. |
| **Fog of War** | You only see the 3×3 square around you. The server removes hidden tiles before sending the map, so nobody can cheat by reading network messages. |
| **Custom maps** | The host picks the board size (5 to 20 tiles per side) and wall density (5% to 30%). Custom maps pass the same checks as Classic maps. |
| **Spectating** | While waiting for an opponent, watch live games, chat and send crowd emotes. |
| **Ready, pause and Stay** | Matches start when both players are ready, pausing needs both players to agree, and Stay lets you skip a move. |

| Chaos mode | Fog of War |
| --- | --- |
| ![Chaos mode](docs/images/chaos.png) | ![Fog of War](docs/images/fog-of-war.png) |
| **Domain Expansion** | **Admin page** |
| ![Domain Expansion challenge](docs/images/domain-expansion.png) | ![Admin dashboard](docs/images/admin.png) |

## Getting started

Follow these steps in order to run Escape Plan on your own computer(s). It works
on macOS, Windows and Linux. The AI voices are optional: without an ElevenLabs
key, everything else works and emotes play sound effects instead.

### What you need

- **Node.js** `^22.12.0`, `^24.0.0` or `>=26.0.0` (the 24 LTS release is fine).
  Download it from <https://nodejs.org>; it includes `npm`.
- **Git**, from <https://git-scm.com> (macOS may offer to install it the first
  time you run `git`).
- **A modern browser** such as Chrome, Edge, Firefox or Safari.
- **Optional:** a free [ElevenLabs](https://elevenlabs.io) account for the AI voices.
- **For more than one computer:** all computers on the same network. A phone
  hotspot is the most reliable choice.

Check that Node.js and npm are installed. Open a terminal (macOS: Terminal,
Windows: PowerShell) and run:

```sh
node -v    # should print v22.12 or newer
npm -v
```

### Step 1: Download the code and install packages

```sh
git clone https://github.com/BaroqueViola/escape-plan.git
cd escape-plan
npm install
```

No Git? On the GitHub page click **Code → Download ZIP**, unzip it, open a
terminal in the unzipped folder and run `npm install`.

Do this on **every** computer you will use. Run `npm install` on each computer
itself; never copy the `node_modules` folder between computers.

### Step 2: Create your `.env` file (server computer only)

Settings and secrets live in a file called `.env` in the `escape-plan` folder.
Only the computer that runs the server needs it. Copy the example file:

```sh
cp .env.example .env          # macOS / Linux
copy .env.example .env        # Windows (Command Prompt)
```

Open `.env` in any text editor (on a Mac: `open -e .env`) and change
`ADMIN_PASSWORD` to your own password for the admin page. The default is
`admin123`.

> On a Mac, Finder hides files that start with a dot. Press **Cmd + Shift + .**
> in Finder to see `.env`. The file is in `.gitignore`, so it is never committed.

### Step 3: Get an ElevenLabs API key (optional, for AI voices)

The free plan gives 10,000 credits a month. The game saves every voice line it
makes and caps its own use (300 credits a day by default), so normal play uses
very little. ElevenLabs sometimes renames its menus; if a label looks different,
pick the closest match.

1. Sign up for a free account at <https://elevenlabs.io> and open the app.
2. Go to **Developers → API Keys** (in the left sidebar or your profile menu).
3. Click **Create API Key**, name it `escape-plan`, and give it **Text to
   Speech** access. Nothing else is needed.
4. Copy the key straight away; it is shown only once.
5. Paste it into `.env` after the `=`, with no spaces or quotes:

   ```
   ELEVENLABS_API_KEY=sk_your_key_here
   ```

**Pick two voices.** Free accounts often can't use the default voices through the
API (you would see an error **402**), so choose your own:

1. In ElevenLabs, open **Voices → My Voices** and pick two voices from the
   default list. Avoid the Voice Library / Explore tab on the free plan.
2. On each voice, open the **⋯** menu and choose **Copy voice ID**.
3. Add them to `.env`:

   ```
   ELEVENLABS_VOICE_WARDEN=first_voice_id
   ELEVENLABS_VOICE_PRISONER=second_voice_id
   ```

Never put the key in the code, a chat or a commit. If it leaks, delete it on the
API Keys page and make a new one. After changing `.env`, restart the server.

### Step 4: Play on one computer (quick test)

Leave `client/src/config.ts` as it is (`export const SERVER_URL = '';`) and open
two terminals in the `escape-plan` folder.

```sh
npm start              # terminal 1: game server on port 3000
npm run dev:client     # terminal 2: game page
```

1. Wait for `Server running at http://localhost:3000`. The admin page opens at
   <http://localhost:3000/admin.html>; log in with your `ADMIN_PASSWORD`.
   (Set `NO_OPEN=1` in `.env` to stop it opening automatically.)
2. Open the address terminal 2 prints, normally <http://localhost:5173>, in two
   browser windows. Make one of them a private window.
3. Enter a different nickname in each window, choose the same mode, and press
   **Ready** in both. The match starts.
4. Click once on each page: browsers block sound until you do.

To stop, press **Ctrl + C** in each terminal.

### Step 5: Play on several computers

One computer runs the **server** (and can also be a player). The other
computers are **players** and only run the game page.

1. **Connect every computer to the same network.** Use a phone hotspot if you
   can: university and public Wi-Fi often stop laptops from reaching each other.
2. **Find the server computer's IP address:**

   | System | Command | What to look for |
   | --- | --- | --- |
   | macOS | `ipconfig getifaddr en0` | e.g. `192.168.1.23` (try `en1` if it prints nothing) |
   | Windows | `ipconfig` | **IPv4 Address** under *Wireless LAN adapter Wi-Fi* |
   | Linux | `hostname -I` | The first address |

   Ignore `127.0.0.1`; that only means "this computer".
3. **Put that address in `client/src/config.ts` on every computer**, keeping
   `http://` and `:3000`:

   ```ts
   export const SERVER_URL = 'http://192.168.1.23:3000';
   ```

   Players never type an address in the game; it comes from this file.
4. **Start the server** on the server computer with `npm start`. The first time,
   allow it through the firewall:
   - **macOS:** click **Allow** on "Allow incoming network connections?" (or
     System Settings → Network → Firewall → Options, and allow `node`).
   - **Windows:** in the Windows Defender Firewall pop-up for Node.js, tick
     **Private networks** and click **Allow access**, and set the Wi-Fi network
     to *Private*.
   - **Linux:** if `ufw` is on, run `sudo ufw allow 3000/tcp`.
5. **Start the game page on each player computer** with `npm run dev:client`,
   open the address it prints, enter a nickname and pick a mode. To also play
   on the server computer, run `npm run dev:client` there in a second terminal.

If the network changes, the server's IP usually changes too: repeat steps 2–3
and restart everything.

More detail, including a checklist for trying every feature, is in
[docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md).

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Player computers can't connect | Check that all computers are on the same network, `config.ts` has the server's **current** IP with `:3000`, and the firewall allows `node`. Try a phone hotspot. |
| `EADDRINUSE` / port already in use | Another server is still running. Press Ctrl + C in the other terminal. |
| Admin page says **NO API KEY** | `ELEVENLABS_API_KEY` is empty in `.env`, or the server wasn't restarted after editing it. |
| Voice error **401** | The key is wrong or was deleted. Make a new one (Step 3). |
| Voice error **402** | Your plan can't use that voice, or credits ran out. Pick your own voices (Step 3) and restart. |
| Voice stopped after an error | The server pauses voice for 5 minutes after an ElevenLabs error. Restart `npm start` to retry now. |
| No sound at all | Click the page once, and check the **SOUND ON** button in the top bar. |

## Configuration

All settings go in `.env` on the server computer (see Step 2).

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | `admin123` | Password for the admin page. Change it before a real session. |
| `PORT` | `3000` | Server port. If you change it, also update `SERVER_URL` and the Vite proxy. |
| `NO_OPEN` | not set | Set to `1` to stop the admin page opening automatically. |
| `ELEVENLABS_API_KEY` | empty | Turns on AI voices. Without it the game uses sound effects. |
| `ELEVENLABS_VOICE_WARDEN`, `ELEVENLABS_VOICE_PRISONER` | George, Rachel | Voice IDs for each role. Free plans may need voices from your own library. |
| `VOICE_DAILY_CREDITS`, `VOICE_MONTHLY_CREDITS` | `300`, `9000` | Caps on ElevenLabs credits. |

`SERVER_URL` in `client/src/config.ts` is empty by default. The browser then
connects to its own computer, and Vite forwards Socket.IO and voice requests
to `localhost:3000`. That only works when the server runs on the same computer.

## Project structure

```text
escape-plan/
├── packages/game-core/   Game rules (TypeScript), shared by server and client
├── server/               Node.js + Express + Socket.IO server
│   ├── server.ts         Entry point: HTTP server, admin page, sockets
│   ├── lobby.ts          Nicknames, matchmaking, online list
│   ├── game.ts           Turns, timers, results, rematches
│   ├── view.ts           What each player is allowed to see (Fog, Chaos)
│   ├── ai.ts             Vs AI bot
│   ├── social.ts         Chat, emotes, spectating
│   ├── voice.ts          ElevenLabs voices and caching
│   ├── admin.ts          Admin login and moderation
│   └── schema.ts         Zod checks for every client message
├── client/               React + Vite game page, and admin.html
├── docs/                 Setup guide and feature notes
└── project_requirements/ Course requirements and project plan
```

The server is in charge: clients only send inputs such as "move up", and the
server checks every action against the rules in `game-core` before sending
each player their view of the game.

## Testing

```sh
npm test            # Vitest unit tests (game-core and server views)
npm run typecheck   # TypeScript checks for every package
npm run build       # Build game-core and the client
```

## More documentation

- [docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md): full setup guide
- [docs/SOCIAL_FEATURES.md](docs/SOCIAL_FEATURES.md): chat, emotes, voice, spectating and admin moderation
- [docs/CHAOS_MODE.md](docs/CHAOS_MODE.md): Chaos classes, abilities and Domain Expansion
- [docs/GAME_CORE_API.md](docs/GAME_CORE_API.md): `game-core` functions and rules for developers
- [project_requirements/](project_requirements/): course requirements and plan

## Contributors

| GitHub | What they built |
| --- | --- |
| [@BaroqueViola](https://github.com/BaroqueViola) | Project plan and requirements; core game logic in `game-core` (board, moves, turns, scoring, rematches) and its tests |
| [@zonarr](https://github.com/zonarr) | Express and Socket.IO server setup; lobby join with Zod nickname checks; server file structure |
| [@Natthapat0](https://github.com/Natthapat0) | Server game loop: turn timer and broadcasting game state (`game.ts`); per-player views (`view.ts`) |
| Naiyarat Hanmatheekuna | Classic React client and the pixel-art assets |
| [@Wittapatch](https://github.com/Wittapatch) | Admin page (dashboard, login, reset, activity log, watch, kick); Ready check and pause; Stay; chat, emotes, ElevenLabs voices and spectating; Chaos mode with six classes and Domain Expansion; Online now list; setup guide |
| [@ssk153](https://github.com/ssk153) | Custom maps; fair map checks (two escape routes, start distances); README updates |
| [@zwehein](https://github.com/zwehein) | Vs AI bot; Fog of War; server shutdown button |

## License

[MIT](LICENSE)
