# Lantern Festival: Shared Wheels

A warm dusk two-player cooperative browser activity built as an isolated app inside this repository.

## What it is

- A **same-device local co-op** experience for two players.
- **Not real remote multiplayer**. Observer mode shows both live player views side by side on one screen, and full-view modes can focus on either player.
- Built with **Vite + Three.js** using only local installed dependencies. There are **no runtime CDN downloads**.

## Supported launch method

This app should be run from a local web server.

```bash
cd lantern-festival
npm install
npm run dev
```

Then open the printed local URL from Vite.

You can also verify the production build locally:

```bash
cd lantern-festival
npm run build
npm run preview
```

## Commands used for verification

```bash
npm run test
npm run test:ui
npm run build
```

## Verified entry path

- App source entry: `lantern-festival/index.html`
- Recommended local URL after `npm run dev`: Vite's printed localhost URL

## Controls

### Touch / mouse

Each player has their own panel:
- Tap the **named movement buttons** under that player's view.
- Tap the **context action** button to illuminate a wheel, rotate a wheel, or ignite the beacon.

### Keyboard

- **Player A:** `WASD` move, `F` act
- **Player B:** arrow keys or `IJKL` move, `Enter` or `H` act

## Complete challenge progression

1. **Find the side terrace**: A lights the West Paper Wheel; B uses it to reach the side terrace.
2. **Split roles**: B rotates the West Paper Wheel from the side terrace so A can reach the Moonstone Terrace.
3. **Ride the East Crane Wheel**: B reaches the Crane Control Perch while A transfers the light to the East Crane Wheel, boards it, and rides the reconfiguration to the Far Blossom Landing.
4. **Beacon reunion**: A ignites the Festival Beacon, which unfurls the final moon bridge so B can rejoin in the Lantern Reunion Court.

## Demo and hand-off honesty

- **Watch full demo** runs through the same legal move/action system as manual play.
- **Pause demo** stops the scripted input queue without desynchronizing the state.
- **Take control** immediately returns manual control to both players.
- **Restart activity** restarts from the beginning.
- **Reset to last lantern rest** restores the latest checkpoint snapshot.

## Browser / viewport evidence

Automated browser coverage was run for:
- desktop observer mode
- mobile-landscape sized viewport (`932x430`)

The UI test checks:
- observer mode stays side by side
- demo reaches the solved state
- no external runtime requests
- no console errors during load and play

## Audit evidence

- Logic tests validate solvability, checkpoint restore, demo completion, and occupied-wheel light transfer blocking.
- Browser tests validate visible startup, observer-mode layout, demo completion, touch-friendly controls, and lack of CDN dependency.
- Independent review findings are summarized in `LEVEL_DESIGN.md`.

## Screenshots

Automation-generated screenshots captured during validation live in `docs/evidence/`.

## Remaining limitations

- This is **local same-device co-op**, not tested networked multiplayer.
- Estimated first-play duration is **unvalidated** human timing.
- No audio was added; the focus is readable cooperative play and demo honesty.
