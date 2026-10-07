# Escape Plan: two-computer setup (macOS, Windows, Linux)

One computer is the **server** and runs the game server on port 3000. Every
**player** laptop runs the game page itself and connects to the server's IP,
which is hard-coded in `client/src/config.ts`. Nobody types an IP or port in
the browser.

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
   git checkout feat/admin-page-and-two-computer-setup
   ```
4. **Install the packages:**
   ```
   npm install
   ```
   Run `npm install` again after any `git pull` that adds packages.
   Install on each computer itself; never copy `node_modules` between computers.

---

## Part B: before each session (on the server computer)

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

## Part C: start everything

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

**Each time the network changes:** redo Part B (new IP, update `config.ts`,
share it) and restart both sides.
