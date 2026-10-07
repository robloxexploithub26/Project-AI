// Project AI Core — animated SVG, driven entirely by CSS (see styles.css).
// Exposes one global:  setCoreState("idle" | "listening" | "thinking" | "responding" | "error")

(function () {
  var STATES = ["idle", "listening", "thinking", "responding", "error"];
  var LABELS = {
    idle: "STANDBY",
    listening: "LISTENING",
    thinking: "PROCESSING",
    responding: "RESPONDING",
    error: "SYSTEM FAULT",
  };

  var mount = document.getElementById("core");
  if (!mount) return;

  mount.innerHTML =
    '<div class="core" data-state="idle">' +
    '<svg class="core-svg" viewBox="0 0 400 400" role="img" aria-label="Project AI core: standby">' +
    "<defs>" +
    '<radialGradient id="pai-disc" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="var(--c)" stop-opacity="0.38"/>' +
    '<stop offset="70%" stop-color="var(--c)" stop-opacity="0.1"/>' +
    '<stop offset="100%" stop-color="var(--c)" stop-opacity="0.02"/>' +
    "</radialGradient>" +
    '<radialGradient id="pai-halo" cx="50%" cy="50%" r="50%">' +
    '<stop offset="55%" stop-color="var(--c)" stop-opacity="0"/>' +
    '<stop offset="80%" stop-color="var(--c)" stop-opacity="0.18"/>' +
    '<stop offset="100%" stop-color="var(--c)" stop-opacity="0"/>' +
    "</radialGradient>" +
    "</defs>" +
    '<circle class="halo" cx="200" cy="200" r="198" fill="url(#pai-halo)"/>' +
    '<circle class="guide" cx="200" cy="200" r="192"/>' +
    '<circle class="guide faint" cx="200" cy="200" r="164"/>' +
    '<g class="spin spin-a"><circle class="ticks" cx="200" cy="200" r="184"/></g>' +
    '<g class="spin spin-b"><circle class="band" cx="200" cy="200" r="150"/></g>' +
    '<g class="spin spin-c"><circle class="arc accent" cx="200" cy="200" r="134"/></g>' +
    '<g class="spin spin-d"><circle class="ticks fine" cx="200" cy="200" r="120"/></g>' +
    '<g class="spin spin-e"><circle class="arc scanner" cx="200" cy="200" r="104"/></g>' +
    '<circle class="wave" cx="200" cy="200" r="92"/>' +
    '<circle class="disc" cx="200" cy="200" r="82" fill="url(#pai-disc)"/>' +
    '<circle class="disc-edge" cx="200" cy="200" r="82"/>' +
    '<circle class="pulse pulse-1" cx="200" cy="200" r="82"/>' +
    '<circle class="pulse pulse-2" cx="200" cy="200" r="82"/>' +
    '<g class="mark">' +
    '<text x="200" y="192" class="mark-small" text-anchor="middle">PROJECT</text>' +
    '<text x="200" y="226" class="mark-big" text-anchor="middle">AI</text>' +
    "</g>" +
    "</svg>" +
    '<div class="core-readout" aria-live="polite"><span class="core-dot"></span><span id="coreLabel">STANDBY</span></div>' +
    "</div>";

  var core = mount.querySelector(".core");
  var svg = mount.querySelector(".core-svg");
  var label = document.getElementById("coreLabel");

  window.setCoreState = function (state) {
    if (STATES.indexOf(state) === -1) state = "idle";
    core.setAttribute("data-state", state);
    label.textContent = LABELS[state];
    svg.setAttribute("aria-label", "Project AI core: " + LABELS[state].toLowerCase());
  };
})();
