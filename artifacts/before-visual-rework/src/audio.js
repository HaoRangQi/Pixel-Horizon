export class DriveAudio {
  constructor() { this.muted = false; this.context = null; this.nextBird = 0; }

  async start() {
    if (this.context) { await this.context.resume(); return; }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.2;
    this.master.connect(context.destination);
    this.engine = context.createOscillator();
    this.engine.type = 'sawtooth';
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 220;
    this.engineGain = context.createGain(); this.engineGain.gain.value = 0.03;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master); this.engine.start();
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.03) / 1.03; data[i] = previous * 5; }
    this.wind = context.createBufferSource(); this.wind.buffer = buffer; this.wind.loop = true;
    this.windFilter = context.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 850;
    this.windGain = context.createGain(); this.windGain.gain.value = 0.03;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master); this.wind.start();
    this.water = context.createOscillator(); this.water.frequency.value = 0.14;
    this.waveGain = context.createGain(); this.waveGain.gain.value = 0.02;
    this.water.connect(this.waveGain).connect(this.windGain.gain); this.water.start();
    await context.resume();
  }

  update(state, regionIndex, paused) {
    if (!this.context) return;
    const time = this.context.currentTime;
    const speed = Math.abs(state.speed);
    const rpm = 32 + (speed % 13) * 4 + state.throttle * 15;
    this.engine.frequency.setTargetAtTime(rpm, time, 0.15);
    this.engineFilter.frequency.setTargetAtTime(180 + speed * 8 + state.throttle * 280, time, 0.2);
    this.engineGain.gain.setTargetAtTime(paused ? 0 : 0.04 + state.throttle * 0.11, time, 0.3);
    this.windGain.gain.setTargetAtTime(paused ? 0.015 : 0.025 + speed * 0.0025 + ([0, 1, 4].includes(regionIndex) ? 0.035 : 0), time, 0.4);
    this.waveGain.gain.setTargetAtTime([0, 1].includes(regionIndex) ? 0.025 : 0.004, time, 0.5);
    if (!paused && [2, 3, 4].includes(regionIndex) && time > this.nextBird) {
      this.nextBird = time + 6 + Math.random() * 5;
      for (let i = 0; i < 3; i++) {
        const bird = this.context.createOscillator();
        const gain = this.context.createGain();
        const start = time + i * 0.21;
        bird.type = 'sine'; bird.frequency.setValueAtTime(2100 + i * 180, start);
        bird.frequency.exponentialRampToValueAtTime(3150 + i * 160, start + 0.06);
        bird.frequency.exponentialRampToValueAtTime(1800 + i * 120, start + 0.14);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.045, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        bird.connect(gain).connect(this.master); bird.start(start); bird.stop(start + 0.18);
        bird.onended = () => { bird.disconnect(); gain.disconnect(); };
      }
    }
  }

  setMuted(value) {
    this.muted = value;
    if (this.context) this.master.gain.setTargetAtTime(value ? 0 : 0.2, this.context.currentTime, 0.15);
  }
}
