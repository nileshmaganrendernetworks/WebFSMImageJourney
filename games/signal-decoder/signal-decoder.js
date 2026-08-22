/* ============================================================
   Signal Decoder — asymmetric info puzzle for two.
   Console Operator sees modules; Manual Keeper holds the rules.
   Neither screen shows both. Voice is the network.
   ============================================================ */
(() => {
  const $ = (id) => document.getElementById(id);
  const room = localStorage.getItem("dn:room") || "DEMO";
  const { chan, myName, announce, onPartner } = DN.joinRoom(room, "signal-decoder");

  $("lobby-room").textContent = `ROOM ${room}`;

  /* ---------------- module / manual content ---------------- */
  const EMOJI = ["🌙", "⭐", "🔥", "🌊", "🍀", "🎵"];
  const WORDS = ["MOON", "WAVE", "SPARK", "BLOOM", "EMBER", "TIDE"];

  // Each round: what the console renders, and the manual rule to solve it.
  const ROUNDS = [
    {
      key: "lights",
      label: "The Four Lights",
      hint: "Four dead lights. The manual knows their waking order.",
      build(seed) {
        const order = DN.shuffle([0, 1, 2, 3]);
        return { lit: [false, false, false, false], order, progress: 0 };
      },
      manual(state) {
        const seq = state.order.map((i) => EMOJI[i]).join(" → ");
        return `
          <div class="manual-section"><h4>MODULE: THE FOUR LIGHTS</h4>
          <p>The console shows four dark lamps, each carved with a sign.</p>
          <div class="manual-figure">${seq}</div>
          <p>They wake only in <b>this exact order</b>. A wrong touch resets them all.
          Read the sequence aloud, sign by sign, and let the Operator tap along.</p></div>`;
      }
    },
    {
      key: "dial",
      label: "The Brass Dial",
      hint: "A stubborn dial. Too far and it jams.",
      build(seed) {
        const target = 3 + (seed % 5); // 3..7
        return { value: 0, target, done: false };
      },
      manual(state) {
        return `
          <div class="manual-section"><h4>MODULE: THE BRASS DIAL</h4>
          <p>The dial is calibrated for tonight's frequency.</p>
          <div class="manual-figure">⟶ ${state.target} ⟶</div>
          <p>Tell the Operator the <b>exact number</b> to stop on.
          Every notch past it jams the gears (-5 pts).</p></div>`;
      }
    },
    {
      key: "cipher",
      label: "The Whispered Word",
      hint: "Six letters decide whether the signal opens.",
      build(seed) {
        const word = WORDS[seed % WORDS.length];
        return { word, typed: "", done: false };
      },
      manual(state) {
        const w = state.word;
        return `
          <div class="manual-section"><h4>MODULE: THE WHISPERED WORD</h4>
          <p>The cipher drum accepts one word. Never read it all at once — the static learns.</p>
          <div class="manual-figure">${w.split("").join(" ")}</div>
          <p>Spell it to the Operator <b>one letter at a time</b>, slowly.
          Confirm each letter before the next.</p></div>`;
      }
    }
  ];

  const ROUND_TIME = 60;
  const PTS_SOLVE = 100;
  const PTS_ERROR = -5;

  /* ---------------- state ---------------- */
  let role = null;            // "console" | "manual"
  let partnerName = null;
  let roundIdx = 0;
  let roundState = null;
  let roundSeed = 0;
  let score = 0;
  let timerId = null;
  let timeLeft = ROUND_TIME;
  let ended = false;

  /* ---------------- screens ---------------- */
  function show(id) {
    ["screen-lobby", "screen-role", "screen-game", "screen-gate", "screen-end"]
      .forEach((s) => $(s).classList.toggle("hidden", s !== id));
  }

  /* ---------------- lobby ---------------- */
  onPartner((name) => {
    partnerName = name;
    $("lobby-status").classList.remove("waiting");
    $("lobby-status").textContent = `${name} is here 💞`;
    $("btn-start").disabled = false;
  });
  announce();
  setInterval(announce, 2000); // keep announcing until partner arrives

  $("btn-start").addEventListener("click", () => {
    // Whoever presses start deals the roles (deterministic by name so both agree).
    const names = [myName, partnerName].sort();
    const iAmConsole = names[0] === myName;
    chan.send("deal", { consolePlayer: names[0] });
    startGame(iAmConsole ? "console" : "manual");
  });

  chan.on((msg) => {
    if (msg.__local) return;
    if (msg.event === "deal") {
      const iAmConsole = msg.payload.consolePlayer === myName;
      if (role === null) startGame(iAmConsole ? "console" : "manual");
    }
    if (msg.event === "partnerReady") {
      $("role-status").classList.remove("waiting");
      $("role-status").textContent = `${partnerName || "Partner"} is ready — round 1 incoming…`;
      setTimeout(() => { show("screen-game"); beginRound(); }, 1400);
    }
    if (msg.event === "solved") onSolved(msg.payload.round, false);
    if (msg.event === "wrong") flashScore(msg.payload.delta);
    if (msg.event === "gateChoice") onGateChoice(msg.payload.choice, false);
  });

  /* ---------------- roles ---------------- */
  function startGame(myRole) {
    role = myRole;
    show("screen-role");
    if (role === "console") {
      $("role-emoji").textContent = "🎛️";
      $("role-title").textContent = "You are the Console Operator";
      $("role-desc").innerHTML = `Your screen shows the signal console — lights, dials, cipher drums.<br/>
        You can <b>touch</b> everything and <b>understand</b> nothing.<br/>
        ${DN.esc(partnerName || "Your partner")} holds the manual. Trust their voice.`;
    } else {
      $("role-emoji").textContent = "📖";
      $("role-title").textContent = "You are the Manual Keeper";
      $("role-desc").innerHTML = `Your screen holds the field manual — every rule, every answer.<br/>
        You <b>understand</b> everything and can <b>touch</b> nothing.<br/>
        Describe, don't show. ${DN.esc(partnerName || "Your partner")}'s hands are the only way in.`;
    }
    $("game-role-banner").textContent = role === "console" ? "🎛️ CONSOLE OPERATOR" : "📖 MANUAL KEEPER";
    $("game-role-banner").className = "role-banner " + (role === "console" ? "role-console" : "role-manual");
    $("view-console").classList.toggle("hidden", role !== "console");
    $("view-manual").classList.toggle("hidden", role !== "manual");
    chan.send("partnerReady", {});
  }

  /* ---------------- rounds ---------------- */
  function beginRound() {
    const def = ROUNDS[roundIdx];
    // Deterministic seed shared by both: room + round
    roundSeed = [...(room + roundIdx)].reduce((a, c) => a + c.charCodeAt(0), 0);
    roundState = def.build(roundSeed);
    timeLeft = ROUND_TIME;
    $("hud-round").textContent = `Round ${roundIdx + 1} / ${ROUNDS.length}`;
    $("hud-timer").textContent = DN.fmtTime(timeLeft);
    $("hud-score").textContent = `${score} pts`;
    setSeals(false);

    if (role === "console") {
      $("module-label").textContent = def.label;
      $("module-hint").textContent = def.hint;
      renderModule(def);
    } else {
      $("manual-round").textContent = String(roundIdx + 1);
      $("manual-body").innerHTML = def.manual(roundState);
    }

    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function tick() {
    timeLeft -= 1;
    $("hud-timer").textContent = DN.fmtTime(timeLeft);
    if (timeLeft <= 10) $("hud-timer").classList.add("hot");
    if (timeLeft <= 0) {
      clearInterval(timerId);
      if (role === "console") chan.send("solved", { round: roundIdx, timeout: true });
      onSolved(roundIdx, true);
    }
  }

  function addScore(delta) {
    score = Math.max(0, score + delta);
    $("hud-score").textContent = `${score} pts`;
    if (role === "console") chan.send("wrong", { delta: 0 }); // keep HUD in sync
  }

  function flashScore() {
    $("hud-score").textContent = `${score} pts`;
  }

  function setSeals(lit) {
    ["seal-0", "seal-1", "m-seal-0", "m-seal-1"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("lit", lit);
      el.textContent = lit ? "💗" : "🔒";
    });
  }

  /* ---------------- console modules ---------------- */
  function renderModule(def) {
    const body = $("module-body");
    body.innerHTML = "";

    if (def.key === "lights") {
      const strip = document.createElement("div");
      strip.className = "signal-strip";
      const strip2 = document.createElement("div");
      strip2.className = "signal-strip";
      const grid = document.createElement("div");
      grid.className = "console-grid";
      [0, 1, 2, 3].forEach((i) => {
        const light = document.createElement("span");
        light.className = "signal-light";
        light.id = `light-${i}`;
        light.textContent = "💡";
        strip.appendChild(light);

        const label = document.createElement("span");
        label.className = "signal-light active";
        label.style.fontSize = "1.6rem";
        label.textContent = EMOJI[i];
        strip2.appendChild(label);

        const btn = document.createElement("button");
        btn.className = "console-btn";
        btn.textContent = EMOJI[i];
        btn.addEventListener("click", () => tapLight(i, btn));
        grid.appendChild(btn);
      });
      body.appendChild(strip);
      body.appendChild(strip2);
      body.appendChild(grid);
    }

    if (def.key === "dial") {
      const row = document.createElement("div");
      row.className = "dial-row";
      const minus = document.createElement("button");
      minus.textContent = "−";
      const plus = document.createElement("button");
      plus.textContent = "+";
      const val = document.createElement("div");
      val.className = "dial-value";
      val.id = "dial-value";
      val.textContent = "0";
      const confirm = document.createElement("button");
      confirm.textContent = "✔ set";
      confirm.style.marginLeft = "8px";
      minus.addEventListener("click", () => nudgeDial(-1));
      plus.addEventListener("click", () => nudgeDial(1));
      confirm.addEventListener("click", confirmDial);
      row.append(minus, val, plus, confirm);
      body.appendChild(row);
    }

    if (def.key === "cipher") {
      const slots = document.createElement("div");
      slots.className = "word-slots";
      for (let i = 0; i < roundState.word.length; i++) {
        const s = document.createElement("span");
        s.id = `slot-${i}`;
        slots.appendChild(s);
      }
      const kb = document.createElement("div");
      kb.className = "keyboard";
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((ch) => {
        const b = document.createElement("button");
        b.textContent = ch;
        b.addEventListener("click", () => typeLetter(ch));
        kb.appendChild(b);
      });
      body.appendChild(slots);
      body.appendChild(kb);
    }
  }

  function tapLight(i, btn) {
    const st = roundState;
    if (st.progress >= 4) return;
    if (st.order[st.progress] === i) {
      st.lit[i] = true;
      st.progress += 1;
      $(`light-${i}`).classList.add("active");
      btn.classList.add("correct");
      setTimeout(() => btn.classList.remove("correct"), 500);
      if (st.progress === 4) solveRound();
    } else {
      st.lit = [false, false, false, false];
      st.progress = 0;
      [0, 1, 2, 3].forEach((j) => $(`light-${j}`).classList.remove("active"));
      btn.classList.add("wrong");
      setTimeout(() => btn.classList.remove("wrong"), 450);
      addScore(PTS_ERROR);
    }
  }

  function nudgeDial(d) {
    roundState.value = Math.max(0, Math.min(9, roundState.value + d));
    $("dial-value").textContent = String(roundState.value);
  }

  function confirmDial() {
    if (roundState.value === roundState.target) {
      roundState.done = true;
      solveRound();
    } else {
      $("dial-value").parentElement.classList.add("shake");
      setTimeout(() => $("dial-value").parentElement.classList.remove("shake"), 450);
      addScore(PTS_ERROR);
    }
  }

  function typeLetter(ch) {
    const st = roundState;
    const idx = st.typed.length;
    if (idx >= st.word.length) return;
    if (st.word[idx] === ch) {
      st.typed += ch;
      $(`slot-${idx}`).textContent = ch;
      if (st.typed === st.word) { st.done = true; solveRound(); }
    } else {
      addScore(PTS_ERROR);
      const slot = $(`slot-${idx}`);
      slot.classList.add("shake");
      setTimeout(() => slot.classList.remove("shake"), 450);
    }
  }

  function solveRound() {
    addScore(PTS_SOLVE);
    chan.send("solved", { round: roundIdx, timeout: false });
    onSolved(roundIdx, false);
  }

  function onSolved(round, timedOut) {
    if (round !== roundIdx || ended) return;
    clearInterval(timerId);
    setSeals(true);
    if (role === "manual") flashScore();
    if (timedOut && role === "console") {
      $("module-hint").textContent = "The static swallowed this one… moving on.";
    }
    setTimeout(() => {
      roundIdx += 1;
      if (roundIdx < ROUNDS.length - 1) beginRound();
      else if (roundIdx === ROUNDS.length - 1) showGate();
      else showEnd(true);
    }, 1600);
  }

  /* ---------------- consent gate ---------------- */
  let myGateChoice = null;
  let partnerGateChoice = null;
  let gateTimer = null;

  function showGate() {
    show("screen-gate");
    myGateChoice = null;
    partnerGateChoice = null;
    let n = 5;
    $("gate-status").textContent = `Choosing… ${n}`;
    gateTimer = setInterval(() => {
      n -= 1;
      $("gate-status").textContent = n > 0 ? `Choosing… ${n}` : "";
      if (n <= 0) {
        clearInterval(gateTimer);
        if (!myGateChoice) chooseGate("stay"); // default: stay
      }
    }, 1000);
  }

  function chooseGate(choice) {
    if (myGateChoice) return;
    myGateChoice = choice;
    clearInterval(gateTimer);
    chan.send("gateChoice", { choice });
    onGateChoice(choice, true);
  }

  function onGateChoice(choice, mine) {
    if (mine) myGateChoice = choice; else partnerGateChoice = choice;
    if (!myGateChoice || !partnerGateChoice) {
      $("gate-status").textContent = "One heart has chosen…";
      return;
    }
    if (myGateChoice === "deeper" && partnerGateChoice === "deeper") {
      $("gate-status").textContent = "Both said deeper. 🌊";
      setTimeout(() => { show("screen-game"); beginRound(); }, 1200);
    } else if (myGateChoice !== partnerGateChoice) {
      $("gate-status").innerHTML = "One said deeper, one said not yet.<br/>Take 30 seconds — ask each other where you are tonight. 💬";
      setTimeout(() => { show("screen-game"); beginRound(); }, 8000);
    } else {
      $("gate-status").textContent = "Staying in the shallows — still beautiful. 🌙";
      setTimeout(() => { show("screen-game"); beginRound(); }, 1200);
    }
  }

  $("gate-deeper").addEventListener("click", () => chooseGate("deeper"));
  $("gate-stay").addEventListener("click", () => chooseGate("stay"));

  /* ---------------- ending ---------------- */
  function showEnd(deep) {
    ended = true;
    show("screen-end");
    $("end-score").textContent = `${score} pts`;
    const verdict =
      score >= 280 ? "You two move like one operator. The signal never stood a chance." :
      score >= 180 ? "Static fought. You fought back — together. That's the whole game." :
      "The signal was noisy tonight. So is every good conversation at first.";
    $("end-verdict").textContent = verdict;
    $("coda-text").textContent = deep
      ? "“Somewhere in the static was a frequency only the two of you could find — not because either of you was enough, but because you were listening for each other.”"
      : "“The clearest signal isn't the loudest one. It's the one you keep choosing to tune into, night after night.”";
    $("coda-prompt").textContent = "💬 Say out loud one moment tonight where your partner's words saved you.";
    DN.addArtifact({ icon: "📮", label: `Signal decoded · ${score} pts`, game: "signal-decoder" });
  }
})();
