/* ============================================================
   Date Night Arcade — pairing & sync library (prototype edition)

   PROTOTYPE TRANSPORT: BroadcastChannel + localStorage.
   Both players open the same game on ONE device, each in their own
   browser tab/window, and pair with a 4-letter room code.
   (On a phone, split-screen or a second browser app works too.)

   PRODUCTION PATH (planned): swap the transport below for a
   WebSocket relay (Partykit / Socket.io) keyed by the same room
   codes, with QR-code + navigator.share() invites. The room, event
   and lock-step APIs stay identical — only `openChannel` changes.
   ============================================================ */

window.DN = (() => {
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusing chars

  function makeRoomCode() {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
  }

  /* ---------- identity ---------- */
  function getPlayerName() {
    let name = sessionStorage.getItem("dn:name") || localStorage.getItem("dn:name");
    if (!name) {
      name = (prompt("Your name, love?", "") || "").trim() || (Math.random() < 0.5 ? "Alex" : "Sam");
      sessionStorage.setItem("dn:name", name);
      localStorage.setItem("dn:name", name);
    }
    return name;
  }

  /* ---------- transport ---------- */
  function openChannel(room, game) {
    const channelName = `dn:${room}:${game}`;
    const bc = new BroadcastChannel(channelName);
    const storageKey = `${channelName}:relay`;
    const selfId = Math.random().toString(36).slice(2);
    const listeners = new Set();

    // Cross-window fallback for browsers with quirky BroadcastChannel
    window.addEventListener("storage", (e) => {
      if (e.key !== storageKey || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue);
        if (msg.__from === selfId) return;
        listeners.forEach((fn) => fn(msg));
      } catch (_) { /* ignore malformed */ }
    });

    return {
      __room: room,
      __game: game,
      on(fn) { listeners.add(fn); },
      send(event, payload = {}) {
        const msg = { __from: selfId, event, payload, t: Date.now() };
        bc.postMessage(msg);
        try { localStorage.setItem(storageKey, JSON.stringify(msg)); } catch (_) { /* quota */ }
        listeners.forEach((fn) => fn({ ...msg, __local: true }));
      },
      close() { bc.close(); }
    };
  }

  /* ---------- room presence ---------- */
  function joinRoom(room, game) {
    const chan = openChannel(room, game);
    const name = getPlayerName();
    const partnerListeners = new Set();

    chan.on((msg) => {
      if (msg.__local) return;
      if (msg.event === "hello") {
        chan.send("welcome", { name });
        partnerListeners.forEach((fn) => fn(msg.payload.name));
      }
      if (msg.event === "welcome") partnerListeners.forEach((fn) => fn(msg.payload.name));
    });

    return {
      chan,
      myName: name,
      announce() { chan.send("hello", { name }); },
      onPartner(fn) { partnerListeners.add(fn); }
    };
  }

  /* ---------- lock-step primitive ----------
     Both sides contribute a value; resolves when both arrived.
     Used for: secret answers, readiness flags, consent gates.
     Values are retained in a per-room pending store (and re-broadcast
     until acked) so neither side's contribution can be missed, no
     matter who commits first.                                     */
  function pendingKey(chanName, key) { return `${chanName}:pending:${key}`; }

  function lockStep(chan, key, myValue) {
    return new Promise((resolve) => {
      const chanName = `dn:${chan.__room}:${chan.__game}`;
      const storeKey = pendingKey(chanName, key);
      const mine = myValue;
      let theirs;
      let done = false;
      let retries = 0;

      const readStore = () => {
        try {
          const stored = JSON.parse(localStorage.getItem(storeKey)) || {};
          if (stored.theirs !== undefined && theirs === undefined) theirs = stored.theirs;
        } catch (_) { /* ignore */ }
      };

      const tryResolve = () => {
        if (done || theirs === undefined) return;
        done = true;
        clearInterval(retryTimer);
        try { localStorage.removeItem(storeKey); } catch (_) { /* ignore */ }
        chan.send(`stepAck:${key}`, {});
        resolve({ mine, theirs });
      };

      chan.on((msg) => {
        if (msg.event === `step:${key}` && !msg.__local) {
          theirs = msg.payload.value;
          try { localStorage.setItem(storeKey, JSON.stringify({ theirs })); } catch (_) { /* ignore */ }
          tryResolve();
        }
        if (msg.event === `stepAck:${key}` && !msg.__local) {
          clearInterval(retryTimer);
        }
      });

      // Check if partner already contributed before we subscribed
      readStore();
      chan.send(`step:${key}`, { value: mine });
      tryResolve();

      // Re-broadcast until partner acks or we resolve (covers races where
      // both sides sent before the other's listener was attached).
      const retryTimer = setInterval(() => {
        if (done || retries++ > 40) { clearInterval(retryTimer); return; }
        readStore();
        tryResolve();
        if (!done) chan.send(`step:${key}`, { value: mine });
      }, 250);
    });
  }

  /* ---------- shared scrapbook (persisted) ---------- */
  const SCRAPBOOK_KEY = "dn:scrapbook";
  function getScrapbook() {
    try { return JSON.parse(localStorage.getItem(SCRAPBOOK_KEY)) || []; } catch (_) { return []; }
  }
  function addArtifact(artifact) {
    const book = getScrapbook();
    book.push({ ...artifact, at: new Date().toISOString() });
    localStorage.setItem(SCRAPBOOK_KEY, JSON.stringify(book));
    return book;
  }

  /* ---------- misc ---------- */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.max(0, Math.floor(sec % 60));
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function relTime(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return new Date(iso).toLocaleDateString();
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  return { makeRoomCode, getPlayerName, joinRoom, lockStep, getScrapbook, addArtifact, shuffle, fmtTime, relTime, esc };
})();
