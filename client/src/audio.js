/** Procedural gunshots, footsteps, bomb beeps, and voice lines. No sample files. */

export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  let lastStep = 0;

  function resume() {
    if (ctx.state === "suspended") ctx.resume();
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  const crack = noiseBuffer(0.18);
  const thud = noiseBuffer(0.12);

  function envGain(duration, peak = 0.8) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    g.connect(master);
    return g;
  }

  function shot(weapon, local = true) {
    resume();
    const peak = local ? 0.55 : 0.28;
    const g = envGain(weapon === "awp" ? 0.45 : 0.16, peak);
    const src = ctx.createBufferSource();
    src.buffer = crack;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = weapon === "awp" ? 380 : weapon === "knife" ? 900 : 1400;
    filter.Q.value = 0.7;
    src.connect(filter);
    filter.connect(g);
    src.start();
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(weapon === "awp" ? 90 : 180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(peak * 0.4, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(og);
    og.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  function step(speed) {
    const now = performance.now();
    const gap = speed > 4 ? 280 : 420;
    if (now - lastStep < gap) return;
    lastStep = now;
    resume();
    const src = ctx.createBufferSource();
    src.buffer = thud;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function beep(urgent) {
    resume();
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = urgent ? 880 : 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(urgent ? 0.12 : 0.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  function boom() {
    resume();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.1);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function voice(kind) {
    resume();
    const notes = {
      plant: [523, 659, 784],
      defuse: [392, 494, 587],
      win: [523, 659, 784, 1046],
      lose: [392, 349, 294],
    }[kind] || [440];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  }

  function hit() {
    resume();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  return { resume, shot, step, beep, boom, voice, hit, ctx };
}
