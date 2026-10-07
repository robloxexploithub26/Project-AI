// Project AI frontend. Talks ONLY to /api/chat (never to any AI provider directly).
// Needs core.js loaded first (it provides setCoreState).

(function () {
  var ERROR_MESSAGES = {
    400: "I couldn't process that request. Please check your message and try again.",
    401: "Project AI isn't configured correctly right now.",
    403: "That request wasn't allowed.",
    429: "I'm receiving a lot of requests. Give me a moment, then try again.",
    500: "Something went wrong on my side. Please try again shortly.",
    503: "Project AI is temporarily unavailable. Please try again in a moment.",
  };
  var NETWORK_ERROR = "I couldn't reach Project AI. Check your connection and try again.";
  var FALLBACK_ERROR = "Something unexpected happened. Please try again.";
  var SUGGESTIONS = ["Who are you?", "What can you help me with?", "Plan my day"];

  var listEl = document.getElementById("messages");
  var formEl = document.getElementById("composer");
  var inputEl = document.getElementById("input");
  var sendBtn = document.getElementById("sendBtn");
  var newBtn = document.getElementById("newBtn");

  var history = []; // completed turns: { role, content }
  var busy = false;
  var errorTimer = null;
  var typeTimer = null;
  var noticeEl = null;

  function setState(s) {
    if (typeof window.setCoreState === "function") window.setCoreState(s);
  }

  function scrollDown() {
    listEl.scrollTop = listEl.scrollHeight;
  }

  function sync() {
    inputEl.disabled = busy;
    sendBtn.disabled = busy || !inputEl.value.trim();
    newBtn.disabled = history.length === 0 && !inputEl.value && !noticeEl;
  }

  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  }

  function hideNotice() {
    if (noticeEl) {
      noticeEl.remove();
      noticeEl = null;
    }
  }

  function showNotice(text) {
    hideNotice();
    noticeEl = document.createElement("div");
    noticeEl.className = "notice";
    noticeEl.setAttribute("role", "alert");
    noticeEl.textContent = text;
    listEl.appendChild(noticeEl);
    scrollDown();
  }

  function makeMessage(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "msg msg-" + role;
    var who = document.createElement("span");
    who.className = "msg-who";
    who.textContent = role === "user" ? "YOU" : "PROJECT AI";
    var body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = text; // textContent: user/AI text is never parsed as HTML
    wrap.appendChild(who);
    wrap.appendChild(body);
    listEl.appendChild(wrap);
    scrollDown();
    return { wrap: wrap, body: body };
  }

  function makeDots() {
    var wrap = document.createElement("div");
    wrap.className = "msg msg-assistant";
    wrap.innerHTML =
      '<span class="msg-who">PROJECT AI</span>' +
      '<div class="msg-body thinking-dots" aria-label="Project AI is thinking"><i></i><i></i><i></i></div>';
    listEl.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function showWelcome() {
    var w = document.createElement("div");
    w.className = "welcome";
    w.id = "welcome";
    var p = document.createElement("p");
    p.textContent = "Project AI online. How can I help?";
    var chips = document.createElement("div");
    chips.className = "chips";
    SUGGESTIONS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = s;
      b.addEventListener("click", function () {
        send(s);
      });
      chips.appendChild(b);
    });
    w.appendChild(p);
    w.appendChild(chips);
    listEl.appendChild(w);
  }

  function removeWelcome() {
    var w = document.getElementById("welcome");
    if (w) w.remove();
  }

  // Reveal the reply gradually; the core stays in "responding" meanwhile.
  function typeOut(body, text, done) {
    var reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      body.textContent = text;
      done();
      return;
    }
    var shown = 0;
    var step = Math.max(1, Math.ceil(text.length / 180)); // about 3 seconds at most
    typeTimer = setInterval(function () {
      shown = Math.min(text.length, shown + step);
      body.textContent = text.slice(0, shown);
      scrollDown();
      if (shown >= text.length) {
        clearInterval(typeTimer);
        typeTimer = null;
        done();
      }
    }, 16);
  }

  async function send(override) {
    var text = (typeof override === "string" ? override : inputEl.value).trim();
    if (!text || busy) return;

    clearTimeout(errorTimer);
    hideNotice();
    removeWelcome();

    var userMsg = makeMessage("user", text);
    inputEl.value = "";
    autoGrow();
    busy = true;
    sync();
    setState("thinking");
    var dots = makeDots();

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, messages: history.slice(-20) }),
      });

      var data = null;
      try {
        data = await res.json();
      } catch (e) {
        /* not JSON */
      }

      if (!res.ok || !data || typeof data.reply !== "string") {
        var err = new Error("request failed");
        err.status = res.status;
        throw err;
      }

      dots.remove();
      var botMsg = makeMessage("assistant", "");
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: data.reply });
      setState("responding");
      typeOut(botMsg.body, data.reply, function () {
        busy = false;
        sync();
        setState("idle");
        inputEl.focus();
      });
    } catch (err) {
      dots.remove();
      userMsg.wrap.remove();
      inputEl.value = text; // restore so it can be retried
      autoGrow();
      busy = false;
      showNotice(
        err && err.status ? ERROR_MESSAGES[err.status] || FALLBACK_ERROR : NETWORK_ERROR
      );
      sync();
      setState("error");
      errorTimer = setTimeout(function () {
        setState("idle");
      }, 3500);
    }
  }

  function newConversation() {
    clearTimeout(errorTimer);
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    history = [];
    busy = false;
    listEl.innerHTML = "";
    noticeEl = null;
    inputEl.value = "";
    autoGrow();
    showWelcome();
    sync();
    setState("idle");
  }

  inputEl.addEventListener("input", function () {
    autoGrow();
    hideNotice();
    sync();
    setState(inputEl.value.trim() ? "listening" : "idle");
  });

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  inputEl.addEventListener("blur", function () {
    if (!busy && !inputEl.value.trim()) setState("idle");
  });

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    send();
  });

  newBtn.addEventListener("click", newConversation);

  showWelcome();
  sync();
})();
