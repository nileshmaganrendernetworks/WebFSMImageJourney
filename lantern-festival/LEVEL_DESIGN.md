# Lantern Festival Level Design

## Activity promise

A single cooperative activity set in a bright dusk courtyard with paper wheels over a shallow stream. The visual goal is cozy and readable rather than dark or survival-themed.

Estimated first-play range: **roughly 5–7 minutes, unvalidated by human playtesting**.

## Mechanic summary

- **A** can illuminate one paper wheel at a time from specific lantern posts.
- **B** rotates paper wheels from specific control perches.
- Lit wheels are solid and traversable.
- Rotation is discrete, previewable, and uses the same state system for both demo and live play.
- A cannot transfer the light away from an occupied lit wheel.
- The final beacon creates a permanent reunion route so the finishing move does not strand B.

## Layout

### Named spaces

- `A Lantern Gate`
- `B Lantern Gate`
- `Shared Plaza`
- `West Bank Lantern`
- `Side Terrace`
- `Moonstone Terrace`
- `Crane Control Perch`
- `Far Blossom Landing`
- `Festival Beacon`
- `Lantern Reunion Court`

### Dynamic structures

#### West Paper Wheel

- Orientation 1: `West Bank Lantern ↔ Side Terrace`
- Orientation 2: `West Bank Lantern ↔ Moonstone Terrace`

#### East Crane Wheel

- Orientation 1: `Moonstone Terrace ↔ Crane Control Perch`
- Orientation 2: `Crane Control Perch ↔ Far Blossom Landing`

## Progression beats

### Beat 1 — Shared route creation

**What players know:** A can light a wheel, B can rotate it, lit wheels become solid.

**Required discovery:** The first useful route is not forward; B must take the **Side Terrace** route first.

**Expected legal solution:**
1. A reaches `West Bank Lantern` and illuminates the West Paper Wheel.
2. B crosses to `Side Terrace` while the wheel is in the side-route orientation.

**Plausible failed approach:** A tries to move first or expects the forward route immediately.

**Recovery:** No fall penalty; players can back up and retry. Checkpoint 1 records the Side Terrace once discovered.

### Beat 2 — Split roles instead of mirror movement

**What players already know:** West can reach the side terrace.

**Why earlier strategy is insufficient:** If both players keep mirroring each other, B cannot stay in position to help while A advances.

**New relationship discovered:** B's side position lets B reconfigure West so A can reach `Moonstone Terrace`.

**Expected legal solution:**
1. B stays on `Side Terrace`.
2. B rotates West to the forward route.
3. A crosses to `Moonstone Terrace`.

**Plausible failed approach:** B leaves the side terrace too early, which removes B's ability to help A.

**Recovery:** Reset to checkpoint 1 or simply walk B back while West is still lit.

### Beat 3 — Riding a live reconfiguration

**What players already know:** A and B can split roles, and A can safely transfer light only after leaving the current lit wheel.

**Why earlier strategy is insufficient:** A cannot just walk forward anymore; the East wheel must change while A is on it.

**New relationship discovered:** B operates the East wheel from the `Crane Control Perch` while A rides the `East Crane Wheel` from boarding route to ride route.

**Expected legal solution:**
1. B reaches `Crane Control Perch` from `Side Terrace`.
2. A transfers the light to East from `Moonstone Terrace`.
3. A boards East while it links `Moonstone Terrace ↔ Crane Control Perch`.
4. B rotates East to `Crane Control Perch ↔ Far Blossom Landing`.
5. A exits at `Far Blossom Landing`.

**Plausible failed approach:** A transfers the light too early while someone is still on West, or B rotates East before A boards.

**Recovery:** The occupied-wheel rule prevents invalid light transfer; checkpoint 2 preserves the split-role setup.

### Beat 4 — Finish without stranding the partner

**What players already know:** A can ride ahead while B remains behind on a safe terrace.

**Why earlier strategy is insufficient:** Reaching the far side with A alone is not the win condition.

**New relationship discovered:** A's far-side success permanently changes the map for B.

**Expected legal solution:**
1. A walks to `Festival Beacon`.
2. A ignites the beacon.
3. The moon bridge permanently opens from `Side Terrace` to `Lantern Reunion Court`.
4. A and B reunite.

**Plausible failed approach:** Players assume A reaching the beacon ends the level.

**Recovery:** Goal text explicitly says both must reunite in the final court.

## Checkpoints and resets

- Checkpoint 1: `Side Terrace` discovered
- Checkpoint 2: A at `Moonstone Terrace` while B is at `Crane Control Perch`
- Checkpoint 3: A reaches `Far Blossom Landing`

`Reset to last lantern rest` restores the latest reached checkpoint snapshot.

## Independent review notes

### Prebuild gameplay critic findings incorporated

- The game enforces a **hard anti-stranding rule**: A cannot transfer the light away from an occupied lit wheel.
- The final beacon creates a **permanent reunion route**, so A reaching the far side does not leave B stranded.
- Progression escalates by relationship changes (side-route discovery, role split, ride-on-rotation, partner reunion) rather than repeated identical rotations.
- Every mistake is reversible through walking back or checkpoint restore; there is no falling punishment.

### Remaining reviewer questions to keep honest

- The 5–7 minute first-play estimate remains **unvalidated** until real humans play it.
- The app is intentionally **same-device local co-op**, not remote multiplayer.
- Because both live views are visible in observer mode, the puzzle relies on role gating and route dependencies rather than hidden-information asymmetry.
