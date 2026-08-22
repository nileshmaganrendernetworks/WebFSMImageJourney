/* ============================================================
   Heart Sync — two-lane co-op rhythm prototype.
   Each player taps the cues in their own lane as they cross the
   line. Taps within SYNC_WINDOW ms of each other = "sync" surges
   that charge one shared heart. Simple WebAudio metronome, no assets.
   ============================================================ */
(() => {
  const $ = (id) => document.getElementById(id);
  const room = localStorage.getItem("dn:room") || "DEMO";
  const { chan, myName, announce, onPartner } = DN.joinRoom(room, "heart-sync");

  $("lobby-room").textContent = `ROOM ${room}`;

  /* ---------------- constants ---------------- */
  const BPM = 96;
  const BEAT_MS = 60000 / BPM;             // 625ms
  const SONG_BEATS = 56;                   // ~35 seconds
  const HIT_LINE_Y = 480;
  const SPAWN_LEAD_MS = 2200;              // cue falls for 2.2s
  const PERFECT_MS = 90;
  const GOOD_MS = 170;
  const SYNC_WINDOW = 280;                 // research: 200–300ms tolerance
  const CHARGE_SYNC = 4, CHARGE_PERFECT = 2, CHARGE_GOOD = 1, CHARGE_MISS = -2;

  /* ---------------- audio (tiny synth, no assets) ---------------- */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function blip(freq, dur = 0.08, gain = 0.12, type = "sine") {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  const tickSound = () => blip(660, 0.05, 0.07, "triangle");
  const hitSound = () => blip(880, 0.09, 0.14);
  const syncSound = () => { blip(1046, 0.12, 0.14); setTimeout(() => blip(1318, 0.14, 0.12), 70); };
  const missSound = () => blip(180, 0.15, 0.10, "sawtooth");

  /* ---------------- chart ----------------
     Deterministic from room code so both players get the same song.
     Lanes alternate with occasional simultaneous "heartbeat" hits.   */
  function buildChart() {
    let seed = [...room].reduce((a, c) => a + c.charCodeAt(0), 7);
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cues = [];
    for (let b = 2; b < SONG_BEATS; b++) {
      const r = rand();
      if (r < 0.22) { cues.push({ beat: b, lane: 0 }); cues.push({ beat: b, lane: 1 }); } // heartbeat
      else if (r < 0.66) cues.push({ beat: b, lane: b % 2 });
      // else: rest beat
    }
    return cues;
  }

  /* ---------------- state ---------------- */
  let partnerName = null;
  let songStart = 0;              // performance.now() timestamp both agree on
  let chart = [];
  let myHits = [];                // {beat, delta}
  let partnerHits = [];           // {beat, at}
  let charge = 0, streak = 0, bestStreak = 0, syncCount = 0;
  let scoredBeats = new Set();
  let rafId = null, ended = false;

  const cv = $("cv");
  const ctx = cv.getContext("2d");

  /* ---------------- screens ---------------- */
  function show(id) {
    ["screen-lobby", "screen-game", "screen-end"]
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
    ensureAudio();
    const startAt = performance.now() + 3000; // 3-2-1 countdown
    chan.send("startSong", { startAt });
    beginSong(startAt);
  });

  chan.on((msg) => {
    if (msg.__local) return;
    if (msg.event === "startSong") { ensureAudio(); beginSong(msg.payload.startAt); }
    if (msg.event === "hit") onPartnerHit(msg.payload);
    if (msg.event === "done") maybeEnd();
  });

  /* ---------------- song flow ---------------- */
  let myLane = 0;

  function beginSong(startAt) {
    if (songStart) return; // already started
    songStart = startAt;
    chart = buildChart();
    // Lanes: alphabetical first name gets lane 0 (rose), other lane 1 (violet)
    const names = [myName, partnerName || "zzz"].sort();
    myLane = names[0] === myName ? 0 : 1;
    show("screen-game");
    $("game-note").textContent = myLane === 0
      ? "Your lane is 🌹 rose. Tap cues on the line!"
      : "Your lane is 💜 violet. Tap cues on the line!";
    requestAnimationFrame(frame);
  }

  function songNow() { return performance.now() - songStart; }

  function frame() {
    if (ended) return;
    const now = songNow();
    draw(now);
    // Countdown ticks & misses
    if (now < 0) {
      const prev = Math.ceil(-(now - 16) / 1000), cur = Math.ceil(-now / 1000);
      if (cur !== prev && cur > 0 && cur <= 3) { feedback(String(cur), "#fdf3f6", true); tickSound(); }
      if (cur <= 0 && prev > 0) feedback("GO 💓", "#ffd166", true);
    } else {
      // miss detection for my cues
      chart.forEach((c) => {
        const key = `m:${c.beat}:${c.lane}`;
        if (c.lane === myLane && !scoredBeats.has(key) && now > c.beat * BEAT_MS + GOOD_MS + 60) {
          scoredBeats.add(key);
          streak = 0;
          charge = Math.max(0, charge + CHARGE_MISS);
          $("hud-streak").textContent = "🔥 0";
          updateMeter();
          feedback("miss", "#8a6b7d", false);
          missSound();
        }
      });
      const beat = Math.floor(now / BEAT_MS);
      $("hud-beat").textContent = `Beat ${Math.min(beat, SONG_BEATS)} / ${SONG_BEATS}`;
      if (beat >= SONG_BEATS + 3) {
        chan.send("done", {});
        maybeEnd();
        return;
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ---------------- input ---------------- */
  cv.addEventListener("pointerdown", () => {
    if (!songStart || ended) return;
    ensureAudio();
    const now = songNow();
    if (now < 0) return;
    // Find nearest unhit cue in my lane
    let best = null, bestAbs = Infinity;
    chart.forEach((c) => {
      if (c.lane !== myLane) return;
      const key = `m:${c.beat}:${c.lane}`;
      if (scoredBeats.has(key)) return;
      const d = now - c.beat * BEAT_MS;
      if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = c; }
    });
    if (!best || bestAbs > 300) return;

    const key = `m:${best.beat}:${best.lane}`;
    scoredBeats.add(key);
    const delta = now - best.beat * BEAT_MS;
    myHits.push({ beat: best.beat, delta });
    chan.send("hit", { beat: best.beat, at: now, lane: myLane });

    if (bestAbs <= PERFECT_MS) {
      streak += 1; charge += CHARGE_PERFECT;
      feedback("PERFECT ✨", "#ffd166", false);
      hitSound();
    } else if (bestAbs <= GOOD_MS) {
      streak += 1; charge += CHARGE_GOOD;
      feedback(delta < 0 ? "early 🌱" : "late 🍂", "#7bf1c3", false);
      hitSound();
    } else {
      streak = 0; charge = Math.max(0, charge + CHARGE_MISS);
      feedback("off-beat", "#8a6b7d", false);
      missSound();
    }
    bestStreak = Math.max(bestStreak, streak);
    charge = Math.min(100, charge);
    $("hud-streak").textContent = `🔥 ${streak}`;
    updateMeter();
    checkSync(best.beat, now);
  });

  function onPartnerHit(p) {
    partnerHits.push(p);
    checkSync(p.beat, p.at, true);
  }

  function checkSync(beat, at, fromPartner = false) {
    const key = `s:${beat}`;
    if (scoredBeats.has(key)) return;
    const mine = myHits.find((h) => h.beat === beat);
    const theirs = partnerHits.find((h) => h.beat === beat);
    if (!mine || !theirs) return;
    const gap = Math.abs(mine.delta - theirs.delta);
    if (gap <= SYNC_WINDOW) {
      scoredBeats.add(key);
      syncCount += 1;
      charge = Math.min(100, charge + CHARGE_SYNC);
      $("hud-syncs").textContent = `💞 ${syncCount} syncs`;
      feedback("SYNC! 💞", "#ff9ebb", false);
      syncSound();
      updateMeter();
      burst();
    }
  }

  let partnerDone = false, iDone = false;
  function maybeEnd() {
    if (ended) return;
    iDone = true;
    if (iDone) {
      // Wait a beat for partner "done"; end regardless after short grace
      setTimeout(showEnd, 1200);
      ended = true;
      cancelAnimationFrame(rafId);
    }
  }

  /* ---------------- rendering ---------------- */
  const particles = [];
  function burst() {
    const x = cv.width / 2, y = 120;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
    }
  }

  function updateMeter() {
    $("meter-fill").style.width = `${Math.round(charge)}%`;
  }

  function drawHeart(x, y, s, color, glow = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-8, -4, -18, 2, 0, 16);
    ctx.bezierCurveTo(18, 2, 8, -4, 0, 4);
    ctx.fill();
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const laneW = cv.width / 2;

    // Lane split
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(laneW, 0); ctx.lineTo(laneW, cv.height); ctx.stroke();

    // Hit lines
    const pulse = now > 0 ? 1 + 0.08 * Math.max(0, Math.sin((now % BEAT_MS) / BEAT_MS * Math.PI * 2)) : 1;
    [["#ff5d8f", 0], ["#b78cff", 1]].forEach(([color, lane]) => {
      ctx.strokeStyle = lane === myLane ? color : "rgba(255,255,255,0.14)";
      ctx.lineWidth = lane === myLane ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(lane * laneW + 14, HIT_LINE_Y);
      ctx.lineTo((lane + 1) * laneW - 14, HIT_LINE_Y);
      ctx.stroke();
    });

    // Cues
    chart.forEach((c) => {
      const t = c.beat * BEAT_MS;
      const y = HIT_LINE_Y - (t - now) * (HIT_LINE_Y - 40) / SPAWN_LEAD_MS;
      if (y < -30 || y > cv.height + 30) return;
      const x = c.lane * laneW + laneW / 2;
      const key = `m:${c.beat}:${c.lane}`;
      const hit = scoredBeats.has(key) || scoredBeats.has(`s:${c.beat}`);
      const mine = c.lane === myLane;
      const color = mine ? "#ff5d8f" : "rgba(183,140,255,0.30)";
      const size = (mine ? 1.6 : 1.2) * pulse * (1 + Math.max(0, 1 - Math.abs(t - now) / 200) * 0.35);
      if (!hit || !mine) drawHeart(x, y, size, color, mine ? 18 : 0);
    });

    // Shared heart at top
    const beatPulse = now > 0 ? 1 + 0.12 * Math.max(0, Math.sin((now % BEAT_MS) / BEAT_MS * Math.PI * 2)) : 1;
    const heartScale = (1.6 + (charge / 100) * 1.6) * beatPulse;
    const heartColor = charge >= 80 ? "#ffd166" : charge >= 40 ? "#ff5d8f" : "#7a3552";
    drawHeart(cv.width / 2, 60, heartScale, heartColor, 24);
    ctx.fillStyle = "rgba(253,243,246,0.85)";
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SHARED HEART", cv.width / 2, 130);

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      drawHeart(p.x, p.y, 0.35, `rgba(255,158,187,${p.life})`);
    }
  }

  let fbTimeout = null;
  function feedback(text, color, big) {
    const el = $("feedback");
    el.textContent = text;
    el.style.color = color;
    el.classList.toggle("countdown", !!big);
    el.classList.add("show");
    clearTimeout(fbTimeout);
    fbTimeout = setTimeout(() => el.classList.remove("show"), big ? 800 : 500);
  }

  /* ---------------- ending ---------------- */
  function showEnd() {
    show("screen-end");
    const pct = Math.round(charge);
    $("end-score").textContent = `${pct}%`;
    $("end-emoji").textContent = pct >= 80 ? "💗" : pct >= 45 ? "💓" : "💔";
    $("end-title").textContent = pct >= 80 ? "HEARTS ALIGNED" : pct >= 45 ? "FINDING THE RHYTHM" : "DIFFERENT TEMPI";
    $("end-verdict").textContent =
      pct >= 80 ? `${syncCount} perfect syncs and a best streak of ${bestStreak}. Somewhere around beat 20 you stopped being two players.` :
      pct >= 45 ? `${syncCount} syncs. The heart flickered, then caught — like every real rhythm, it needed a few missed beats.` :
      "The heart never quite caught fire tonight. It happens. The beat will still be here tomorrow.";
    $("coda-text").textContent = "“Two hearts rarely beat as one on the first try. The trick isn't matching the rhythm — it's staying close enough to find it again.”";
    $("coda-prompt").textContent = "💬 Tell your partner about a moment when you two were perfectly in sync — on or off the screen.";
    DN.addArtifact({ icon: pct >= 45 ? "💓" : "🌙", label: `Heart sync · ${pct}%`, game: "heart-sync" });
  }
})();
