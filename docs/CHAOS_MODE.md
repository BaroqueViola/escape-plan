# Chaos mode

A second game mode next to Classic. Each side picks an anime-style class with its own ability, on a bigger 7×7 board. Each turn lasts 20 seconds and the server still decides everything: the client only sends requests, and the game core checks every move and ability.

## What players see

- **Mode menu**: after the nickname, players pick **Classic** or **Chaos**. Chaos then asks for a side (Prisoner or Warden) and a class on that side. Each class card has a short demo of its ability and its keys.
- **Chaos colours**: the whole game switches to purple and crimson, with its own floor, rock and tunnel tiles.
- **Stay** (both modes): press **X** to keep your spot for a turn, at most 2 turns in a row. After that the button says **MUST MOVE**. If the timer runs out, the game uses a stay for you, or a random legal move when none are left.
- **Abilities panel**: the ability buttons sit under the board with their keys (**Q**, **E**, **R**), cooldowns and a one-line hint. A line under the board says what happened last turn, and another says what the rival's power is up to.
- **Rematch**: after a Chaos match both players pick a side and class again. If both pick the same side, the first to lock in keeps it and the other is asked to pick on the other side.

## The classes

| Class | Side | Ability | How it works |
|---|---|---|---|
| All Might | Prisoner | Smash Punch | The bar fills over 2 turns. **Q** transforms, then a direction throws a punch in a straight line that stuns the warden for 2 turns and cracks the ground. |
| Naruto | Prisoner | Shadow Clone Jutsu | Banks 1 clone a turn, up to 3. **Q** places clones within 2 tiles, each walking one way. **E** secretly swaps places with a clone; the warden sees nothing change. |
| Sukuna | Prisoner | Dismantle · Shrine | **Q** breaks a rock next to him (cooldown 1). He collects 3 fingers from the map; the warden can crush one and it respawns. With 3 fingers, **E** pushes the warden 3 tiles away. |
| All For One | Warden | Steal | **Q** steals the prisoner's ability (they lose it for 1 turn, cooldown 2). **E** fires it once with no charge-up; from Sukuna he also gets the Shrine on **R**. A stolen clone walks for 3 turns and catches on contact. |
| Sasuke | Warden | Sharingan | Works when the prisoner is in his row or column with nothing in between. **Q** blinds the prisoner for 2 turns: their board goes dark and their movement keys are secretly shuffled. Cooldown 4 after the illusion ends. |
| Gojo | Warden | Infinite Void | Works when the prisoner is within 2 tiles. **Q** pulls them into the Void (cooldown 3). |

## Gojo's Domain Expansion

- Both players see a **Domain Expansion** title card for 1.5 seconds: pixel-art Gojo in front of a black hole, with "Domain Expansion · Infinite Void". The server adds this time to the prisoner's turn (11.5 s in total).
- A voice line, "Domain Expansion. Infinite Void.", is made once at server start with ElevenLabs in the warden's voice. Without a key, a deep hit and a shimmer sound play instead.
- The prisoner then plays a timing challenge: stop a moving line inside a glowing zone with **SPACE** (or a tap), 3 rounds. The zone gets smaller and moves more each round, and the line gets faster (1.1 s, 0.95 s, then 0.85 s per sweep).
- Hit all 3 and the prisoner goes back to the board for a normal turn. One miss, or no answer in time, and they are caught.

## Admin page

- A password screen comes first ("Enter the admin password"). A wrong password turns the box red; the dashboard has a **Log out** button. The password is `ADMIN_PASSWORD` in `.env` (default `admin123` for local testing).
- Every game shows a **CLASSIC** or **CHAOS** badge. Chaos games use the game's Chaos colours and show both players' classes, plus a line with cooldowns, clones, stuns and "In the Void".
- **Watching** a Chaos game shows the whole board in Chaos colours with class sprites. Clones are see-through with a blue glow, and tags such as **IN VOID** or **STUNNED** sit under a player. The admin always sees the real board, even during Sasuke's darkness.
- The **live feed** adds class picks, every ability used, and Void results, in pink.

## How it works

- **Game core** (`packages/game-core`): `chaos.ts` holds every ability's rules and the ability state (cooldowns, clones, fingers, stuns, the Void). `engine.ts` runs turns, Stay and timeouts, and gives the Void turn its extra time. All rules are covered by `test/chaos.test.ts`.
- **Server**: `player:queue` takes the mode, side and class; `game:ability` and `game:pick` (rematch) are new events, checked with Zod in `schema.ts`. `view.ts` builds what each player is allowed to see: Naruto's clones look identical to the warden, and a blinded prisoner gets an empty board. Mode settings and board sizes are in `modes.ts`.
- **Client**: everything Chaos lives in `client/src/chaos/` (menus, class info and sprites, abilities panel, the Void challenge and the Domain Expansion card). Class sprites are pixel art drawn in code (`pixelSprites.ts`); the admin page uses PNG copies in `client/public/assets/`.

## Testing

- `npx vitest run`: 90 tests (game core rules for every class, plus what each viewer can see).
- `npm run typecheck` and `npm run build` pass.
- Checked in two browsers: every class's ability, the Sharingan blind view, a Void escape and a Void capture, and the admin page with a Classic and a Chaos game running.
