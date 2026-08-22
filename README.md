# WebFSMImageJourney

> **Latest: 💕 [Date Night Arcade — Plan & Playable Prototypes](PLAN.md)** — a two-player,
> browser-based date-night co-op game collection. Three playable prototypes
> (🔐 Signal Decoder, 💓 Heart Sync, 🪞 Mirror Round), full game roster with visuals,
> and the MVP roadmap. Serve this folder (`python3 -m http.server`) and open
> `index.html` in two tabs to play.

![Date Night Arcade](screenshots/01-arcade-home.png)

---

SOP: FSM-Guided UI Screenshot Tool

1. Project Context

Project: UI Migration / Redesign
Current State:
	•	Legacy application with multiple micro-frontends, mostly written in Angular.
	•	Target application is being rewritten in React.
	•	Application includes complex flows: forms, modals, dynamic UI components, and conditional rendering based on user actions.
	•	Team maintains an FSM (finite state machine) that describes the main UI flows for the page.

Objective:
	•	Capture screenshots of all relevant UI states in the legacy app, aligned with the existing FSM, to guide UI migration and redesign.
	•	Ensure repeatable, deterministic documentation for all UI states.
	•	Make the solution framework-agnostic and extensible for other pages or applications in the future.

⸻

2. Scope
	•	Automates navigation across known UI states defined in the FSM.
	•	Executes UI transitions (clicks, typing, etc.) as defined in a binding configuration.
	•	Captures screenshots for each FSM state.
	•	Produces a mapping of FSM states → screenshots for design reference.

Exclusions:
	•	This tool does not automatically discover unknown UI states.
	•	It does not handle backend data variations unless the FSM and bindings explicitly include them.

⸻

3. FSM Input Structure

File: fsm.json

{
  "initial": "EMPTY",
  "states": {
    "EMPTY": {
      "on": { "OPEN_FORM": "FORM_OPEN" }
    },
    "FORM_OPEN": {
      "on": { "SUBMIT": "CONFIRMATION" }
    },
    "CONFIRMATION": {}
  }
}

	•	initial: starting UI state.
	•	states: each state maps transition names → next state.
	•	The FSM is purely conceptual, not tied to DOM selectors.

⸻

4. Transition Bindings Structure

File: bindings.json

{
  "OPEN_FORM": {
    "type": "click",
    "selector": "[data-testid='add-item']"
  },
  "SUBMIT": {
    "type": "click",
    "selector": "button[type='submit']"
  }
}

	•	Maps FSM transitions to browser actions.
	•	Supported action types (initially): click.
	•	Can be extended: type, hover, select, check, etc.
	•	This decouples the FSM from UI implementation and makes the tool reusable.

⸻

5. Architecture Overview

┌────────────┐
│   FSM      │  Defines the known UI states
│ Definition │
└─────┬──────┘
      │
      ▼
┌──────────────┐
│ Transition   │  Maps FSM transitions → UI actions
│ Bindings     │
└─────┬────────┘
      │
      ▼
┌──────────────┐
│ UI Executor  │  Browser automation (Playwright)
└─────┬────────┘
      │
      ▼
┌──────────────┐
│ State        │  Verifier (optional)
│ Validation   │  Ensures intended state reached
└─────┬────────┘
      │
      ▼
┌──────────────┐
│ Screenshot   │  Capture image of the current state
│ Capture      │
└─────┬────────┘
      │
      ▼
┌──────────────┐
│ Artifact     │  Mapping FSM states → screenshot files
│ Output       │
└──────────────┘

Responsibilities:
	1.	FSM Definition: Defines all known UI states.
	2.	Transition Bindings: Maps abstract transitions to UI actions.
	3.	UI Executor: Loads page, performs actions, waits for UI to settle.
	4.	State Validation: Optional verification that the intended state is reached.
	5.	Screenshot Capture: Saves visual evidence of each FSM state.
	6.	Artifact Output: Produces a structured mapping of state → screenshot.

⸻

6. Tool Implementation

Dependencies:

npm init -y
npm install playwright fs-extra

Folder Structure:

fsm-ui-screenshot/
├─ fsm.json
├─ bindings.json
├─ screenshots/
├─ index.js
├─ package.json

Main Runner (index.js):

const fs = require('fs-extra');
const path = require('path');
const { chromium } = require('playwright');

const FSM_PATH = './fsm.json';
const BINDINGS_PATH = './bindings.json';
const SCREENSHOT_DIR = './screenshots';
const APP_URL = 'http://localhost:3000';

const fsm = fs.readJsonSync(FSM_PATH);
const bindings = fs.readJsonSync(BINDINGS_PATH);

fs.ensureDirSync(SCREENSHOT_DIR);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(APP_URL);

  const visited = new Set();

  async function traverse(state) {
    if (visited.has(state)) return;
    visited.add(state);

    console.log(`Capturing state: ${state}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${state}.png`) });

    const transitions = fsm.states[state]?.on || {};
    for (const [transition, nextState] of Object.entries(transitions)) {
      const action = bindings[transition];
      if (!action) {
        console.warn(`No binding for transition ${transition}`);
        continue;
      }

      if (action.type === 'click') {
        await page.click(action.selector);
      } else {
        console.warn(`Action type ${action.type} not implemented`);
      }

      await page.waitForTimeout(500);

      await traverse(nextState);

      await page.goto(APP_URL);
      await page.waitForTimeout(500);
    }
  }

  await traverse(fsm.initial);

  await browser.close();
  console.log('Done! Screenshots saved to', SCREENSHOT_DIR);
})();


⸻

7. Running the Tool

node index.js

	•	Outputs screenshots into screenshots/
	•	Each screenshot filename corresponds to the FSM state.
	•	Can be repeated for other pages by swapping FSM + bindings.

⸻

8. Extension / Future Improvements
	1.	CLI / npm package
	•	Accept URL, FSM path, bindings path
	•	Output screenshots + JSON report
	2.	Support additional actions: type, hover, select, check
	3.	State verification:
	•	CSS selectors
	•	Text content
	•	URL patterns
	4.	Visual diff & regression tracking (for migration)
	5.	Auto-binding hints using heuristics or AI

⸻

9. Benefits
	•	Deterministic: Same FSM + bindings → same screenshots
	•	Framework-agnostic: Works with Angular, React, Vue
	•	Reusable & Extensible: Supports multiple apps / pages
	•	Migration-friendly: Screenshots map directly to FSM states
