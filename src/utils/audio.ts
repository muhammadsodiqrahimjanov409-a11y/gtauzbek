class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private cinemaBassOsc: OscillatorNode | null = null;
  private cinemaBassGain: GainNode | null = null;
  private cinemaLeadOsc: OscillatorNode | null = null;
  private cinemaLeadGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private unlocked = false;

  private masterVol = 0.7;
  private musicVol = 0.45;
  private sfxVol = 0.75;
  private lastFootstepAt = 0;
  private lastBrakeAt = 0;
  private lastTeleportBlipAt = 0;

  public unlock(): void {
    if (this.unlocked) return;
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      // Continuous vehicle engine oscillator (muted when on foot)
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();

      // Police wail siren oscillator (muted unless wanted > 0)
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 680;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();

      // Subtle city wind/hum ambience
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 0.25;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const ambFilter = this.ctx.createBiquadFilter();
      ambFilter.type = 'bandpass';
      ambFilter.frequency.value = 220;
      ambFilter.Q.value = 0.7;

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = this.masterVol * this.musicVol * 0.08;

      noiseSource.connect(ambFilter);
      ambFilter.connect(this.ambientGain);
      this.ambientGain.connect(this.ctx.destination);
      noiseSource.start();

      // Spatial Cinema Auditorium Soundtrack Oscillators (muted unless inside a cinema)
      const cinemaFilter = this.ctx.createBiquadFilter();
      cinemaFilter.type = 'lowpass';
      cinemaFilter.frequency.value = 620;

      this.cinemaBassOsc = this.ctx.createOscillator();
      this.cinemaBassOsc.type = 'triangle';
      this.cinemaBassOsc.frequency.value = 110;
      this.cinemaBassGain = this.ctx.createGain();
      this.cinemaBassGain.gain.value = 0;
      this.cinemaBassOsc.connect(cinemaFilter);
      cinemaFilter.connect(this.cinemaBassGain);
      this.cinemaBassGain.connect(this.ctx.destination);
      this.cinemaBassOsc.start();

      this.cinemaLeadOsc = this.ctx.createOscillator();
      this.cinemaLeadOsc.type = 'sine';
      this.cinemaLeadOsc.frequency.value = 330;
      this.cinemaLeadGain = this.ctx.createGain();
      this.cinemaLeadGain.gain.value = 0;
      this.cinemaLeadOsc.connect(this.cinemaLeadGain);
      this.cinemaLeadGain.connect(this.ctx.destination);
      this.cinemaLeadOsc.start();

      this.unlocked = true;
    } catch {
      // Ignore Web Audio restriction errors cleanly
    }
  }

  public setVolumes(master: number, music: number, sfx: number): void {
    this.masterVol = Math.max(0, Math.min(1, master));
    this.musicVol = Math.max(0, Math.min(1, music));
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.masterVol * this.musicVol * 0.08, this.ctx.currentTime, 0.1);
    }
  }

  public setAmbientPaused(paused: boolean): void {
    if (!this.ctx || !this.ambientGain) return;
    const target = paused ? 0 : this.masterVol * this.musicVol * 0.08;
    this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    if (paused && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    if (paused && this.sirenGain) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    if (paused && this.cinemaBassGain && this.cinemaLeadGain) {
      this.cinemaBassGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.cinemaLeadGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  public updateCinemaAudio(inCinema: boolean, movieIndex: number, elapsed: number, paused: boolean): void {
    if (!this.ctx || !this.cinemaBassOsc || !this.cinemaBassGain || !this.cinemaLeadOsc || !this.cinemaLeadGain) {
      return;
    }
    if (!inCinema || paused) {
      this.cinemaBassGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      this.cinemaLeadGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      return;
    }

    // 4 distinct cinematic motifs matching the 4 feature films
    const bassProgressions = [
      [110.0, 146.83, 130.81, 164.81], // Sci-Fi Space Odyssey (A2 - D3 - C3 - E3)
      [82.41, 98.0, 110.0, 123.47],    // Night Street Race (E2 - G2 - A2 - B2)
      [146.83, 116.54, 130.81, 110.0], // Dragon Fortress (D3 - Bb2 - C3 - A2)
      [130.81, 155.56, 174.61, 196.0], // Cyber City 2099 (C3 - Eb3 - F3 - G3)
    ];
    const leadProgressions = [
      [329.63, 440.0, 523.25, 659.25, 587.33, 440.0],
      [329.63, 392.0, 493.88, 587.33, 493.88, 392.0],
      [293.66, 349.23, 440.0, 523.25, 440.0, 349.23],
      [392.0, 466.16, 523.25, 622.25, 587.33, 466.16],
    ];

    const mIdx = ((movieIndex % 4) + 4) % 4;
    const bassSeq = bassProgressions[mIdx];
    const leadSeq = leadProgressions[mIdx];

    const bassNote = bassSeq[Math.floor(elapsed * 0.45) % bassSeq.length];
    const leadNote = leadSeq[Math.floor(elapsed * 1.35) % leadSeq.length];

    const baseVol = this.masterVol * this.musicVol;
    this.cinemaBassOsc.frequency.setTargetAtTime(bassNote, this.ctx.currentTime, 0.08);
    this.cinemaLeadOsc.frequency.setTargetAtTime(leadNote, this.ctx.currentTime, 0.06);
    this.cinemaBassGain.gain.setTargetAtTime(baseVol * 0.055, this.ctx.currentTime, 0.14);
    this.cinemaLeadGain.gain.setTargetAtTime(baseVol * 0.028, this.ctx.currentTime, 0.14);
  }

  public updateSiren(wantedLevel: number, closestPoliceDist: number, elapsed: number, paused: boolean): void {
    if (!this.ctx || !this.sirenOsc || !this.sirenGain) return;
    if (wantedLevel <= 0 || paused) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    const proximity = Math.max(0.15, 1 - Math.min(85, closestPoliceDist) / 95);
    const wailFreq = 660 + Math.sin(elapsed * 5.2) * 230;
    const vol = this.masterVol * this.sfxVol * 0.075 * proximity;
    this.sirenOsc.frequency.setTargetAtTime(wailFreq, this.ctx.currentTime, 0.04);
    this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.08);
  }

  public updateEngine(inVehicle: boolean, speed: number, maxSpeed: number, paused: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    if (!inVehicle || paused) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    const ratio = Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed));
    const freq = 48 + ratio * 135;
    const vol = this.masterVol * this.sfxVol * (0.035 + ratio * 0.055);
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.06);
    this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.08);
  }

  public playMetroChime(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainValue = this.masterVol * this.sfxVol * 0.13;
    if (gainValue <= 0.001) return;

    const notes = [783.99, 987.77, 1174.66]; // G5 -> B5 -> D6 transit chime
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.11;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.36);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainValue = this.masterVol * this.sfxVol * 0.12;
    if (gainValue <= 0.001) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  public playNotification(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainValue = this.masterVol * this.sfxVol * 0.14;
    if (gainValue <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880, now + 0.09);

    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playMissionComplete(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainValue = this.masterVol * this.sfxVol * 0.14;
    if (gainValue <= 0.001) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  }

  public playFootstep(isSprinting: boolean): void {
    if (!this.ctx) return;
    const nowMs = performance.now();
    const interval = isSprinting ? 290 : 440;
    if (nowMs - this.lastFootstepAt < interval) return;
    this.lastFootstepAt = nowMs;

    const gainValue = this.masterVol * this.sfxVol * 0.07;
    if (gainValue <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.045);

    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playBrake(speed: number): void {
    if (!this.ctx || Math.abs(speed) < 9) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBrakeAt < 350) return;
    this.lastBrakeAt = nowMs;

    const gainValue = this.masterVol * this.sfxVol * 0.06;
    if (gainValue <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.linearRampToValueAtTime(640, now + 0.14);

    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playWeaponSound(type: 'pistol' | 'ak47' | 'golf_club'): void {
    this.unlock();
    if (!this.ctx) return;
    const baseGain = this.masterVol * this.sfxVol;
    if (baseGain <= 0.001) return;

    const now = this.ctx.currentTime;

    if (type === 'golf_club') {
      // Crisp driver whoosh + metallic titanium ping
      const whooshOsc = this.ctx.createOscillator();
      const whooshGain = this.ctx.createGain();
      whooshOsc.type = 'sine';
      whooshOsc.frequency.setValueAtTime(160, now);
      whooshOsc.frequency.exponentialRampToValueAtTime(420, now + 0.09);
      whooshGain.gain.setValueAtTime(baseGain * 0.12, now);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      whooshOsc.connect(whooshGain);
      whooshGain.connect(this.ctx.destination);
      whooshOsc.start(now);
      whooshOsc.stop(now + 0.12);

      const pingOsc = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      pingOsc.type = 'triangle';
      pingOsc.frequency.setValueAtTime(1920, now + 0.06);
      pingOsc.frequency.exponentialRampToValueAtTime(1180, now + 0.24);
      pingGain.gain.setValueAtTime(baseGain * 0.15, now + 0.06);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      pingOsc.connect(pingGain);
      pingGain.connect(this.ctx.destination);
      pingOsc.start(now + 0.06);
      pingOsc.stop(now + 0.26);
      return;
    }

    // Percussive gunshot transient (noise burst + low-end punch)
    const duration = type === 'ak47' ? 0.13 : 0.16;
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const env = Math.pow(1 - i / sampleCount, 3.2);
      ch[i] = (Math.random() * 2 - 1) * env;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'ak47' ? 1850 : 2200, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + duration);

    const shotGain = this.ctx.createGain();
    shotGain.gain.setValueAtTime(baseGain * 0.18, now);
    shotGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSrc.connect(filter);
    filter.connect(shotGain);
    shotGain.connect(this.ctx.destination);
    noiseSrc.start(now);

    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punchOsc.type = 'sawtooth';
    punchOsc.frequency.setValueAtTime(type === 'ak47' ? 175 : 220, now);
    punchOsc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    punchGain.gain.setValueAtTime(baseGain * 0.14, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    punchOsc.connect(punchGain);
    punchGain.connect(this.ctx.destination);
    punchOsc.start(now);
    punchOsc.stop(now + 0.11);
  }

  public playTeleportBlip(distanceMeters: number): void {
    if (!this.ctx || distanceMeters > 38) return;
    const nowMs = performance.now();
    if (nowMs - this.lastTeleportBlipAt < 240) return;
    this.lastTeleportBlipAt = nowMs;

    const atten = Math.max(0, 1 - distanceMeters / 38);
    const gainValue = this.masterVol * this.sfxVol * 0.085 * atten;
    if (gainValue <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(1020, now + 0.11);

    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playWebThwip(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.16;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;
    // High-pitched elastic snap + resonant rush
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.16);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playLaserBeam(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.15;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.28);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playTankCannon(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.42;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;

    // Sub-bass thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.48);

    gain.gain.setValueAtTime(gainVal * 0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.68);

    // Explosive noise burst
    const sampleRate = this.ctx.sampleRate;
    const noiseSamples = Math.floor(sampleRate * 0.45);
    const buf = this.ctx.createBuffer(1, noiseSamples, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseSamples, 2.4);
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + 0.45);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(gainVal * 0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSrc.start(now);

    this.vibrate(140, true);
  }

  public playAirplaneCannon(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.28;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;

    // High-energy 30mm tracer cannon snap
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);

    oscGain.gain.setValueAtTime(gainVal * 0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);

    // Sharp noise burst
    const sampleRate = this.ctx.sampleRate;
    const noiseSamples = Math.floor(sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, noiseSamples, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseSamples, 2.0);
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(gainVal * 0.8, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noiseSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noiseSrc.start(now);

    this.vibrate(30, true);
  }

  public playBombDrop(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.25;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;

    // Falling bomb aerodynamic whistle
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 1.2);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.28);
  }

  public playBombExplosion(): void {
    this.unlock();
    if (!this.ctx) return;
    const gainVal = this.masterVol * this.sfxVol * 0.55;
    if (gainVal <= 0.001) return;

    const now = this.ctx.currentTime;

    // Seismic sub-bass shockwave
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.9);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.15);

    // Massive roaring blast noise
    const sampleRate = this.ctx.sampleRate;
    const noiseSamples = Math.floor(sampleRate * 0.85);
    const buf = this.ctx.createBuffer(1, noiseSamples, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseSamples, 1.8);
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.85);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(gainVal * 0.95, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    noiseSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noiseSrc.start(now);

    this.vibrate(220, true);
  }

  public playGunshot(weapon: 'pistol' | 'ak47' = 'ak47'): void {
    this.playWeaponSound(weapon);
  }

  public vibrate(ms = 35, enabled = true): void {
    if (!enabled) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore unsupported browsers
      }
    }
  }
}

export const audioEngine = new ProceduralAudioEngine();
export const playTankCannon = () => audioEngine.playTankCannon();
export const playAirplaneCannon = () => audioEngine.playAirplaneCannon();
export const playBombDrop = () => audioEngine.playBombDrop();
export const playBombExplosion = () => audioEngine.playBombExplosion();
export const playWebThwip = () => audioEngine.playWebThwip();
export const playLaserBeam = () => audioEngine.playLaserBeam();
export const playGunshot = (weapon: 'pistol' | 'ak47' = 'ak47') => audioEngine.playGunshot(weapon);

