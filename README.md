# Date Night Arcade 💕

**The whole arcade is one file: [`date-night-arcade.html`](date-night-arcade.html).**
Download it, double-click it, play. No server, no build, no dependencies.

## Play

1. Download **`date-night-arcade.html`** (on GitHub: open the file → ⋯ → *Download* — or just `Ctrl/Cmd+S` the raw page).
2. Open it in **two browser tabs or windows** — one for each player.
3. Both enter the **same 4-letter room code**, then open the same game.

## Tonight's games

| Game | What it is |
|---|---|
| 🔐 **Signal Decoder** | Asymmetric co-op puzzle — one flies a 3D console, the other holds the manual. Neither screen shows both. |
| 💓 **Heart Sync** | Co-op rhythm through a particle field — tap your lane on the beat, together, to charge one shared heart. |
| 🪞 **Mirror Round** | Answer secretly, guess your partner, both cards flip at the same moment. Ends with the Simultaneous Draw. |

## Under the hood

A hyper-visual night sky you fly through — a Three.js 3D starfield/nebula universe
(with a graceful 2D canvas fallback when offline), DOM confetti, WebAudio synth, and
3D card flips. Two-player sync runs over `BroadcastChannel` + `localStorage` lock-step
between tabs of this same file on one device. Artifacts you earn are pressed into a
scrapbook saved in your browser.

*Formerly: the FSM-Guided UI Screenshot SOP and the multi-file prototype — replaced by
this single downloadable build.*
