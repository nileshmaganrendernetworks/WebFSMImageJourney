/* ============================================================
   Mirror Round — predict & reveal + the Simultaneous Draw.
   Phase 1: answer about yourself (secret).
   Phase 2: guess your partner's answer (secret).
   Phase 3: simultaneous reveal — mirrors for matches, sparks for
   differences (differences = conversation prompts, never failures).
   Ending: the Simultaneous Draw writes both cards to the scrapbook.
   ============================================================ */
(() => {
  const $ = (id) => document.getElementById(id);
  const room = localStorage.getItem("dn:room") || "DEMO";
  const { chan, myName, announce, onPartner } = DN.joinRoom(room, "mirror-round");

  $("lobby-room").textContent = `ROOM ${room}`;

  /* ---------------- content (Chapter 2 · Discovery deck) ---------------- */
  const QUESTIONS = [
    {
      emoji: "🍳",
      text: "It's a slow Sunday morning with nowhere to be. What are you making?",
      options: ["Pancakes, obviously", "Just really good coffee", "A full spread — go big", "We're going out, I don't cook"]
    },
    {
      emoji: "🧳",
      text: "One free plane ticket, leaving tomorrow, no planning allowed. You pick…",
      options: ["Somewhere with mountains", "A city I've never seen", "A beach, a book, done", "Wherever you once said you loved"]
    },
    {
      emoji: "😤",
      text: "When you're stressed, what actually helps — honestly?",
      options: ["Being left alone a bit", "Talking it out immediately", "Doing something physical", "A hug, no words needed"]
    },
    {
      emoji: "🎁",
      text: "Which gift would secretly mean the most to you?",
      options: ["Something handmade", "A plan for a whole day together", "Words — a real letter", "That thing I mentioned once"]
    }
  ];

  const DRAW_SECONDS = 60;

  /* ---------------- state ---------------- */
  let partnerName = null;
  let q = 0;
  let myAnswer = null;
  let myGuess = null;
  let mirrors = 0;
  const history = [];
  let ended = false;

  function show(id) {
    ["screen-lobby", "screen-game", "screen-reveal", "screen-draw", "screen-end"]
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
  setInterval(announce, 2000);

  $("btn-start").addEventListener("click", () => {
    chan.send("begin", {});
    beginGame();
  });

  chan.on((msg) => {
    if (msg.__local) return;
    if (msg.event === "begin") beginGame();
  });

  function beginGame() {
    if ($("screen-game").classList.contains("hidden") === false) return;
    show("screen-game");
    renderQuestion();
  }

  /* ---------------- question flow ---------------- */
  function renderQuestion() {
    const def = QUESTIONS[q];
    $("hud-round").textContent = `Question ${q + 1} / ${QUESTIONS.length}`;
    $("hud-phase").textContent = "ANSWER";
    $("hud-mirrors").textContent = `🪞 ${mirrors}`;
    $("q-emoji").textContent = def.emoji;
    $("q-text").textContent = def.text;
    $("game-status").innerHTML = "Answer about <b>yourself</b> first. 🤫";
    $("game-status").classList.add("waiting");

    const grid = $("q-options");
    grid.innerHTML = "";
    def.options.forEach((opt) => {
      const b = document.createElement("button");
      b.textContent = opt;
      b.addEventListener("click", () => answerSelf(opt));
      grid.appendChild(b);
    });
  }

  async function answerSelf(opt) {
    myAnswer = opt;
    $("q-options").innerHTML = "";
    $("game-status").innerHTML = "Locked in. Waiting for your partner's secret answer…";
    const { theirs } = await DN.lockStep(chan, `a${q}`, opt);
    renderGuess(theirs);
  }

  function renderGuess(partnerAnswer) {
    const def = QUESTIONS[q];
    $("hud-phase").textContent = "GUESS";
    $("game-status").innerHTML = `Now — what did <b>${DN.esc(partnerName || "your partner")}</b> answer? 🔮`;
    $("game-status").classList.remove("waiting");

    const grid = $("q-options");
    grid.innerHTML = "";
    def.options.forEach((opt) => {
      const b = document.createElement("button");
      b.textContent = opt;
      b.addEventListener("click", () => guessPartner(opt, partnerAnswer));
      grid.appendChild(b);
    });
  }

  async function guessPartner(opt, partnerAnswer) {
    myGuess = opt;
    $("q-options").innerHTML = "";
    $("game-status").innerHTML = "Guess sealed. Waiting for their guess… then the reveal. 🎭";
    $("game-status").classList.add("waiting");
    const { theirs } = await DN.lockStep(chan, `g${q}`, opt);
    reveal(partnerAnswer, theirs);
  }

  /* ---------------- reveal ---------------- */
  function reveal(partnerAnswer, partnerGuess) {
    const matched = myGuess === partnerAnswer;
    const theyMatched = partnerGuess === myAnswer;
    if (matched) mirrors += 1;
    history.push({ q, myAnswer, myGuess, partnerAnswer, partnerGuess });

    const meter = $("mirror-meter").children;
    for (let i = 0; i < meter.length; i++) meter[i].classList.toggle("lit", i < mirrors);

    $("rv-mine-who").textContent = `${myName} (you)`;
    $("rv-mine").textContent = myAnswer;
    $("rv-theirs-who").textContent = partnerName || "Partner";
    $("rv-theirs").textContent = partnerAnswer;

    const verdict = $("rv-verdict");
    const sub = $("rv-sub");
    if (matched && theyMatched) {
      verdict.className = "verdict match";
      verdict.textContent = "🪞 Double mirror — you both read each other perfectly.";
      sub.textContent = "Take a second. That doesn't happen every day.";
    } else if (matched || theyMatched) {
      verdict.className = "verdict match";
      verdict.textContent = matched
        ? `🪞 Mirror! You knew ${partnerName || "them"} would say that.`
        : `🪞 Mirror! ${partnerName || "They"} knew exactly what you'd say.`;
      sub.textContent = matched
        ? "Tell them how you knew."
        : "Ask them how they knew.";
    } else {
      verdict.className = "verdict spark";
      verdict.textContent = "✨ A spark — neither guessed right. Perfect.";
      sub.textContent = "Tell each other why. The why is the whole point.";
    }

    $("flip-mine").classList.remove("flipped");
    $("flip-theirs").classList.remove("flipped");
    show("screen-reveal");
    setTimeout(() => $("flip-mine").classList.add("flipped"), 350);
    setTimeout(() => $("flip-theirs").classList.add("flipped"), 700);

    $("btn-next").textContent = q < QUESTIONS.length - 1 ? "Next question →" : "To the Simultaneous Draw ⚡";
  }

  $("btn-next").addEventListener("click", async () => {
    if (q < QUESTIONS.length - 1) {
      q += 1;
      show("screen-game");
      renderQuestion();
    } else {
      // Lock-step so both arrive at the draw together
      $("btn-next").disabled = true;
      $("btn-next").textContent = "Waiting for partner…";
      await DN.lockStep(chan, "draw-ready", true);
      startDraw();
    }
  });

  /* ---------------- simultaneous draw ---------------- */
  let drawTimer = null;
  let myNote = null;

  function startDraw() {
    show("screen-draw");
    let t = DRAW_SECONDS;
    $("draw-timer").textContent = DN.fmtTime(t);
    drawTimer = setInterval(() => {
      t -= 1;
      $("draw-timer").textContent = DN.fmtTime(Math.max(0, t));
      if (t <= 0) sealDraw();
    }, 1000);
  }

  async function sealDraw() {
    if (myNote !== null) return;
    clearInterval(drawTimer);
    myNote = ($("draw-input").value || "").trim() || "…(the card stayed blank — some things need more than 60 seconds)";
    $("btn-draw-lock").disabled = true;
    $("draw-status").innerHTML = "Sealed. 💌 Waiting for their card…";
    const { theirs } = await DN.lockStep(chan, "draw", myNote);
    showDrawReveal(theirs);
  }

  $("btn-draw-lock").addEventListener("click", sealDraw);

  function showDrawReveal(theirNote) {
    if (ended) return;
    ended = true;
    show("screen-end");
    $("dc-mine-who").textContent = `${myName} wrote`;
    $("dc-mine").textContent = `“${myNote}”`;
    $("dc-theirs-who").textContent = `${partnerName || "Your partner"} wrote`;
    $("dc-theirs").textContent = `“${theirNote}”`;
    $("end-mirrors").textContent = "🪞".repeat(Math.max(1, mirrors)) + ` · ${mirrors}/${QUESTIONS.length} mirrors`;
    $("end-verdict").textContent =
      mirrors >= 3 ? "You two are practically one mirror tonight." :
      mirrors >= 1 ? "Some mirrors, some sparks — exactly what a good date is made of." :
      "All sparks. You have wonderful things left to learn about each other — lucky you.";
    DN.addArtifact({ icon: "💌", label: `${myName}: ${myNote.slice(0, 42)}`, game: "mirror-round" });
    DN.addArtifact({ icon: "💌", label: `${partnerName || "Partner"}: ${theirNote.slice(0, 42)}`, game: "mirror-round" });
    if (mirrors > 0) DN.addArtifact({ icon: "🪞", label: `${mirrors}/${QUESTIONS.length} mirrors`, game: "mirror-round" });
  }
})();
