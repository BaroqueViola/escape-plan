# Escape Plan: setup guide (macOS, Windows, Linux)

Everything you need to run Escape Plan yourself: installing it, turning on the
ElevenLabs AI voices, and playing on one computer or several. What each feature
does is in [SOCIAL_FEATURES.md](SOCIAL_FEATURES.md) and [CHAOS_MODE.md](CHAOS_MODE.md).

Follow these steps in order to run Escape Plan on your own computer(s). It works
on macOS, Windows and Linux. The AI voices are optional: without an ElevenLabs
key, everything else works and emotes play sound effects instead.

## What you need

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

## Step 1: Download the code and install packages

```sh
git clone https://github.com/BaroqueViola/escape-plan.git
cd escape-plan
npm install
```

No Git? On the GitHub page click **Code → Download ZIP**, unzip it, open a
terminal in the unzipped folder and run `npm install`.

Do this on **every** computer you will use. Run `npm install` on each computer
itself; never copy the `node_modules` folder between computers.

## Step 2: Create your `.env` file (server computer only)

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

## Step 3: Get an ElevenLabs API key (optional, for AI voices)

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

## Step 4: Play on one computer (quick test)

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

## Step 5: Play on several computers

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

## Step 6: Try everything

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

## Troubleshooting

| Problem | Fix |
|---|---|
| Player laptops can't connect | Check that everyone is on the same network, the IP in `config.ts` is the server's current IP, and the firewall allows `node` (Step 5). Try a phone hotspot. |
| Admin page says **NO API KEY** | `ELEVENLABS_API_KEY` is empty in `.env`, or the server was not restarted after editing it. |
| **PAUSED · ElevenLabs answered 401** | The key is wrong or was deleted. Make a new one. |
| **PAUSED · ElevenLabs answered 402** | Your plan can't use that voice (or credits ran out). Pick your own voices (Step 3) and restart. |
| Voice stopped after an error | The server pauses voice for 5 minutes after an ElevenLabs error. Restart `npm start` to retry straight away. |
| Daily cap reached | Voice turns off until tomorrow (`VOICE_DAILY_CREDITS`, default 300). |
| No sound at all | Click the page once, and check the **🔊 SOUND ON** button in the top bar. |
| `EADDRINUSE` / port already in use | Another server is still running. Close the other terminal or press Ctrl + C there. |
