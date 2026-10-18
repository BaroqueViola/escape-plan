# Escape Plan: setup guide (macOS, Windows, Linux)

How to install Escape Plan, turn on the ElevenLabs voices, and run it either on
one computer (for testing) or on several computers over the same network (for
the real demo). What each feature does is in
[SOCIAL_FEATURES.md](SOCIAL_FEATURES.md).

In the two-computer setup, one computer is the **server** and runs the game
server on port 3000. Every **player** laptop runs the game page itself and
connects to the server's IP, which is hard-coded in `client/src/config.ts`.
Nobody types an IP or port in the browser.

Any computer can be the server or a player, on any operating system. Commands
that differ between systems are listed separately for each one.

---

## Part A: one-time setup (every computer)

1. **Install Node.js** version 22.12 or newer (24 LTS is fine) from
   https://nodejs.org. This also installs `npm`.
   Check it in a terminal (macOS: Terminal, Windows: PowerShell, Linux: any terminal):
   ```
   node -v
   npm -v
   ```
2. **Install Git** from https://git-scm.com. macOS may offer to install it when
   you first run `git`.
3. **Download the project:**
   ```
   git clone https://github.com/BaroqueViola/escape-plan.git
   cd escape-plan
   ```
   Until the work is merged into `main`, switch to the branch that has it:
   ```
   git checkout feat/chat-emotes-voice-admin
   ```
4. **Install the packages:**
   ```
   npm install
   ```
   Run `npm install` again after any `git pull` that adds packages.
   Install on each computer itself; never copy `node_modules` between computers.

---

## Part B: the `.env` file and ElevenLabs voices (server computer only)

Settings and secrets live in a file called `.env`. Only the computer that runs
`npm start` needs it; player laptops don't. It is in `.gitignore`, so it never
goes to GitHub.

### 1. Create `.env`

```
cp .env.example .env
```

On Windows (Command Prompt) use `copy .env.example .env`.

Open it to edit (on a Mac: `open -e .env`). The game works without changing
anything: emotes play plain sound effects and chat is text only. Fill in the
ElevenLabs key (next step) to hear voices.

`ADMIN_PASSWORD` in `.env` is the admin page password (default `admin123`).

> On a Mac, Finder hides files that start with a dot. Press **Cmd + Shift + .**
> in Finder to see `.env`.

### 2. Get an ElevenLabs API key (optional)

The free plan gives 10,000 credits a month. The game uses about half a credit
per character and saves every clip, so normal testing uses very little.
Menu names on the ElevenLabs site change from time to time; if a label below
looks different, look for the closest match.

1. Sign up for a free account at <https://elevenlabs.io> and open the app.
2. Open **Developers → API Keys** (in the left sidebar, or from your profile menu).
3. Click **Create API Key**, name it `escape-plan`, and give it **Text to Speech**
   access (no other access is needed).
4. Copy the key right away; it is only shown once.
5. Paste it into `.env` after the `=`, with no spaces or quotes:

   ```
   ELEVENLABS_API_KEY=sk_your_key_here
   ```

### 3. Pick voices your plan can use

The default voices may not be available to free accounts through the API
(ElevenLabs then answers **402**, see Troubleshooting). To choose your own:

1. In ElevenLabs open **Voices → My Voices** and pick two voices from the
   default list (avoid the Voice Library / Explore tab on the free plan).
2. On each voice, open the **⋯** menu and choose **Copy voice ID**.
3. Add them to `.env`:

   ```
   ELEVENLABS_VOICE_WARDEN=first_voice_id
   ELEVENLABS_VOICE_PRISONER=second_voice_id
   ```

Never paste the key into the code, chat, Discord or a commit. If it leaks,
delete it on the API Keys page and make a new one.

After changing `.env`, stop the server with **Ctrl + C** and run `npm start` again.

---

## Part C: quick test on one computer

Handy for trying things out before the demo. Leave `client/src/config.ts` as
`export const SERVER_URL = '';` and use two terminals in the `escape-plan` folder.

**Terminal 1: the server**
```
npm start
```
The admin page opens at <http://localhost:3000/admin.html>. Log in with
`ADMIN_PASSWORD`.

**Terminal 2: the game page**
```
npm run dev:client
```
Open the address it prints (usually <http://localhost:5173>) in three browser
windows (make one a private window), then follow Part F.

---

## Part D: before each session on several computers (on the server computer)

### 1. Connect every computer to the same network
Use the same Wi-Fi, or better, a **phone hotspot**. University Wi-Fi often
blocks laptops from reaching each other.

### 2. Find the server computer's IP address

| System  | Command | What to look for |
|---------|---------|------------------|
| macOS   | `ipconfig getifaddr en0` | Prints e.g. `192.168.1.23`. If it prints nothing, try `en1`. |
| Windows | `ipconfig` | The **IPv4 Address** under the *Wireless LAN adapter Wi-Fi* section. |
| Linux   | `hostname -I` | Use the first address, e.g. `192.168.1.23`. |

The IP usually starts with `192.168.`, `10.` or `172.`. Ignore `127.0.0.1`,
because that is only the computer itself.

### 3. Put the IP in the code
Edit `client/src/config.ts`:
```ts
export const SERVER_URL = 'http://192.168.1.23:3000';
```
Keep the `http://` and the `:3000`.

### 4. Get the same file onto every player computer
Either:
- **push and pull:**
  - server computer: `git add client/src/config.ts`, then `git commit -m "Set demo server IP"`, then `git push`
  - each player computer: `git pull`
- **or by hand:** type the same line into `client/src/config.ts` on each player computer.

---

## Part E: start everything on several computers

### Server computer
```
npm start
```
Wait for `Server running at http://localhost:3000`. The **admin page opens
automatically** in your browser (`http://localhost:3000/admin.html`). The server
computer is for the admin page only, not for playing.

**Allow it through the firewall** the first time:
- **macOS:** click **Allow** on "Allow incoming network connections?".
  If you missed it: System Settings, then Network, then Firewall, then Options, and allow `node`.
- **Windows:** in the Windows Defender Firewall pop-up for Node.js, tick
  **Private networks** and click **Allow access**. Also make sure the Wi-Fi is
  set to a *Private* network (Settings, then Network & internet, then Wi-Fi, then your network, then *Private network*).
- **Linux:** most desktops have no firewall on by default. If `ufw` is on:
  `sudo ufw allow 3000/tcp`.

If the admin page doesn't open by itself, open `http://localhost:3000/admin.html`.

### Each player computer
```
npm run dev:client
```
Then open the address it prints, normally **http://localhost:5173**, and enter
a nickname. When two players have joined, the match starts.

**Each time the network changes:** redo Part D (new IP, update `config.ts`,
share it) and restart both sides.

---

## Part F: try everything

Use two player windows and a third window (or laptop) as a spectator.
Click once anywhere on each page first: browsers block sound until you do.

| Try this | What should happen |
|---|---|
| Players 1 and 2: enter names and join | They are matched and press Ready |
| Third window: join, then **Watch** a game under "Spectate a live game" | The players see **👁 1 WATCHING** |
| Keys **1–3** (players) | Your role's emote pops up over your character, with a voice line or a sound effect |
| **Enter**, type, **Send** (turn on **Speak** first) | The message appears for everyone and is read aloud |
| **Esc** or **×** | Chat closes and the **Controls** tab shows the keys |
| Admin page: **Watch** a game | Board, emotes, spectators and chat; you can write as ADMIN |
| Admin page: **Mute**, **Turn chat off** | That player can't chat or emote / nobody can chat |
| Admin page: **Kick** (write a reason) | They see "You are KICKED" and the reason, and go back to the name screen |

The admin page's **Voice & chat** panel shows **CONNECTED** and the credits used
when voice is working.

Automated checks:
```
npm test
npm run typecheck
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Player laptops can't connect | Check that everyone is on the same network, the IP in `config.ts` is the server's current IP, and the firewall allows `node` (Part E). Try a phone hotspot. |
| Admin page says **NO API KEY** | `ELEVENLABS_API_KEY` is empty in `.env`, or the server was not restarted after editing it. |
| **PAUSED · ElevenLabs answered 401** | The key is wrong or was deleted. Make a new one. |
| **PAUSED · ElevenLabs answered 402** | Your plan can't use that voice (or credits ran out). Pick your own voices (Part B, step 3) and restart. |
| Voice stopped after an error | The server pauses voice for 5 minutes after an ElevenLabs error. Restart `npm start` to retry straight away. |
| Daily cap reached | Voice turns off until tomorrow (`VOICE_DAILY_CREDITS`, default 300). |
| No sound at all | Click the page once, and check the **🔊 SOUND ON** button in the top bar. |
| `EADDRINUSE` / port already in use | Another server is still running. Close the other terminal or press Ctrl + C there. |
