(function () {
  "use strict";

  let context = null;
  let enabled = true;

  function ensureContext() {
    if (!enabled) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!context) context = new AudioContext();
    if (context.state === "suspended") context.resume().catch(function () {});
    return context;
  }

  function tone(frequency, duration, type, gain, delay, slide) {
    const ctx = ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + (delay || 0);
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
    volume.gain.setValueAtTime(.0001, now);
    volume.gain.exponentialRampToValueAtTime(gain || .04, now + .012);
    volume.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  function noise(duration, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const volume = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    volume.gain.setValueAtTime(gain || .025, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(volume);
    volume.connect(ctx.destination);
    source.start();
  }

  function play(name) {
    if (!enabled) return;
    const patterns = {
      pick: function () { tone(310, .08, "triangle", .035, 0, 420); },
      place: function () { tone(150, .12, "sine", .055, 0, 95); },
      error: function () { tone(125, .13, "sawtooth", .025, 0, 80); tone(92, .16, "sawtooth", .02, .07, 65); },
      rotate: function () { tone(440, .07, "square", .02, 0, 620); },
      button: function () { tone(270, .045, "triangle", .02); },
      depart: function () { noise(.35, .035); tone(75, .55, "sawtooth", .025, 0, 125); },
      bump: function () { noise(.12, .06); tone(90, .12, "sine", .05); },
      glass: function () { tone(1180, .18, "sine", .028); tone(1640, .24, "sine", .02, .04); noise(.2, .018); },
      clear: function () { tone(392, .16, "triangle", .04); tone(523, .18, "triangle", .04, .11); tone(659, .28, "triangle", .04, .22); }
    };
    if (patterns[name]) patterns[name]();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      ensureContext();
      play("button");
    }
  }

  function isEnabled() { return enabled; }

  window.Sfx = { play, setEnabled, isEnabled };
})();
