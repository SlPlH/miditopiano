export class Visualizer {
    constructor(canvas, pianoKeys) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pianoKeys = pianoKeys; // Kept for reference but we'll try to use a map

        this.lookahead = 2000; // ms to fall across screen
        this.currentTime = 0;
        this.notes = []; // {midi, start, duration}

        this.leftColor = "#6366f1";
        this.rightColor = "#a855f7";
        this.effectColor = "#00f2ff";
        this.effectType = "electric";
        this.effectIntensity = 0.5;
        this.noteStyle = "classic";
        this.colorMode = "fixed";
        this.particles = [];
        this.noteColorCache = new Map(); // key: "midi:start" → fixed lerp factor (0-1)
        this.recentlyReleasedNotes = new Map(); // midi → {releaseTime, x, width, color}

        this.setColors(this.leftColor, this.rightColor);
        this.setEffectColor(this.effectColor);

        // Animation state for electric effect
        this.effectPhase = 0;

        this.keyData = [];
        this.initKeyData();

        this.realTimeActiveNotes = new Set();

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    initKeyData() {
        // 88 keys: A0 (MIDI 21) to C8 (MIDI 108)
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let whiteKeyIndex = 0;
        this.keyData = [];

        for (let midi = 21; midi <= 108; midi++) {
            const noteName = notes[midi % 12];
            const isBlack = noteName.includes('#');
            this.keyData.push({
                midi,
                isBlack,
                noteName,
                whiteIndex: isBlack ? -1 : whiteKeyIndex
            });
            if (!isBlack) whiteKeyIndex++;
        }
        this.totalWhiteKeys = whiteKeyIndex;
    }

    setColors(left, right) {
        this.leftColor = left;
        this.rightColor = right;
        this.leftRGB = this.hexToRgb(left);
        this.rightRGB = this.hexToRgb(right);
    }

    setEffectColor(color) {
        this.effectColor = color;
    }

    setEffectType(type) {
        this.effectType = type;
        this.particles = [];
    }

    setEffectIntensity(intensity) {
        this.effectIntensity = parseFloat(intensity);
    }

    setNoteStyle(style) {
        this.noteStyle = style;
    }

    setColorMode(mode) {
        this.colorMode = mode;
        this.noteColorCache.clear();
    }

    hexToRgb(hex) {
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        return { r, g, b };
    }

    setCurrentTime(time) {
        this.currentTime = time * 1000; // seconds to ms
    }

    noteOn(midi) {
        this.realTimeActiveNotes.add(midi);
    }

    noteOff(midi) {
        this.realTimeActiveNotes.delete(midi);
        // Track time of release for stardust tail effect
        const x = this.getKeyX(midi);
        const w = this.getKeyWidth(midi);
        const color = this.interpolateColor(midi);
        this.recentlyReleasedNotes.set(midi, {
            releaseTime: performance.now(),
            x,
            width: w,
            color
        });
    }

    setMidiFile(binary) {
        this.parseMidi(binary);
    }

    parseMidi(binary) {
        const data = new Uint8Array(binary);
        
        let p = 0;
        if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) return;

        p = 10;
        const nTracks = (data[p] << 8) | data[p + 1];
        p = 12;
        const division = (data[p] << 8) | data[p + 1];
        p = 14;

        const allEvents = [];

        // First pass: extract all events with their absolute tick positions
        for (let t = 0; t < nTracks; t++) {
            while (p < data.length && !(data[p] === 0x4D && data[p + 1] === 0x54 && data[p + 2] === 0x72 && data[p + 3] === 0x6B)) p++;
            if (p >= data.length) break;
            p += 4;
            const trackLen = (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
            p += 4;
            const trackEnd = p + trackLen;
            
            let currentTick = 0;
            let lastStatus = 0;

            while (p < trackEnd) {
                let delta = 0;
                while (true) { 
                    const b = data[p++]; 
                    delta = (delta << 7) | (b & 0x7F); 
                    if (!(b & 0x80)) break; 
                }
                currentTick += delta;

                let status = data[p++];
                if (!(status & 0x80)) { status = lastStatus; p--; }
                lastStatus = status;
                const eventType = status & 0xF0;

                if (eventType === 0x90) {
                    const midi = data[p++]; const vel = data[p++];
                    allEvents.push({ tick: currentTick, type: vel > 0 ? 'noteOn' : 'noteOff', midi, track: t });
                } else if (eventType === 0x80) {
                    const midi = data[p++]; const vel = data[p++];
                    allEvents.push({ tick: currentTick, type: 'noteOff', midi, track: t });
                } else if (status === 0xFF) {
                    const type = data[p++];
                    let len = 0;
                    while (true) { const b = data[p++]; len = (len << 7) | (b & 0x7F); if (!(b & 0x80)) break; }
                    if (type === 0x51) {
                        const microsecondsPerBeat = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
                        allEvents.push({ tick: currentTick, type: 'tempo', microsecondsPerBeat, track: -1 });
                    }
                    p += len;
                } else if (eventType === 0xB0 || eventType === 0xA0) {
                    p += 2;
                } else if (eventType === 0xE0) {
                    p += 2; // Pitch bend
                } else if (eventType === 0xC0 || eventType === 0xD0) {
                    p += 1;
                } else if (status === 0xF0 || status === 0xF7) {
                    let len = 0;
                    while (true) { const b = data[p++]; len = (len << 7) | (b & 0x7F); if (!(b & 0x80)) break; }
                    p += len;
                }
            }
            p = trackEnd;
        }

        // Sort events chronologically by absolute tick
        allEvents.sort((a, b) => a.tick - b.tick);

        let currentMicrosecondsPerBeat = 500000; // Default 120 BPM
        let lastTick = 0;
        let currentTimeMs = 0;

        const activeNotes = new Map(); // track_midi -> startMs
        const notes = [];

        // Second pass: Calculate absolute milliseconds using global tempo map
        for (const ev of allEvents) {
            const deltaTicks = ev.tick - lastTick;
            if (deltaTicks > 0) {
                currentTimeMs += (deltaTicks / division) * (currentMicrosecondsPerBeat / 1000);
                lastTick = ev.tick;
            }

            if (ev.type === 'tempo') {
                currentMicrosecondsPerBeat = ev.microsecondsPerBeat;
            } else if (ev.type === 'noteOn') {
                const key = `${ev.track}_${ev.midi}`;
                activeNotes.set(key, currentTimeMs);
            } else if (ev.type === 'noteOff') {
                const key = `${ev.track}_${ev.midi}`;
                if (activeNotes.has(key)) {
                    const startMs = activeNotes.get(key);
                    notes.push({ midi: ev.midi, start: startMs, duration: currentTimeMs - startMs });
                    activeNotes.delete(key);
                }
            }
        }

        this.notes = notes.sort((a, b) => a.start - b.start);
    }

    resize() {
        if (this.isRecordingResolution) return;

        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    setRecordingResolution(width, height) {
        this.isRecordingResolution = true;
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    resetResolution() {
        this.isRecordingResolution = false;
        this.resize();
    }

    // factor override: explicit 0-1 value (used by dynamic mode for per-note fixed color)
    interpolateColor(midi, factorOverride) {
        if (!this.leftRGB || !this.rightRGB) return `rgb(255, 255, 255)`;
        const factor = factorOverride !== undefined
            ? factorOverride
            : Math.max(0, Math.min(1, (midi - 21) / (108 - 21)));
        const r = Math.round(this.leftRGB.r + factor * (this.rightRGB.r - this.leftRGB.r));
        const g = Math.round(this.leftRGB.g + factor * (this.rightRGB.g - this.leftRGB.g));
        const b = Math.round(this.leftRGB.b + factor * (this.rightRGB.b - this.leftRGB.b));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Returns a stable 0-1 factor for a given note.
    // In 'fixed' mode: factor derived from midi pitch (same as before).
    // In 'dynamic' mode: random factor assigned once per note and cached.
    _getNoteColorFactor(note) {
        if (this.colorMode !== 'dynamic') {
            return Math.max(0, Math.min(1, (note.midi - 21) / (108 - 21)));
        }
        const key = `${note.midi}:${note.start}`;
        if (!this.noteColorCache.has(key)) {
            this.noteColorCache.set(key, Math.random());
        }
        return this.noteColorCache.get(key);
    }

    animate() {
        if (!this.isRecordingResolution) {
            this.renderFrame(this.currentTime / 1000);
        }
        requestAnimationFrame(() => this.animate());
    }

    getKeyX(midi) {
        const whiteKeyWidth = this.canvas.width / this.totalWhiteKeys;
        const key = this.keyData.find(k => k.midi === midi);
        if (!key) return 0;

        if (!key.isBlack) {
            return key.whiteIndex * whiteKeyWidth;
        } else {
            // Find the preceding white key to center the black key
            const prevWhiteKey = this.keyData.slice(0, this.keyData.indexOf(key)).reverse().find(k => !k.isBlack);
            const prevX = prevWhiteKey ? prevWhiteKey.whiteIndex * whiteKeyWidth : -whiteKeyWidth / 2;
            const blackWidth = whiteKeyWidth * 0.57; // 1.1% vs 1.92%
            return (prevX + whiteKeyWidth) - (blackWidth / 2);
        }
    }

    getKeyWidth(midi) {
        const whiteKeyWidth = this.canvas.width / this.totalWhiteKeys;
        const key = this.keyData.find(k => k.midi === midi);
        return key && key.isBlack ? whiteKeyWidth * 0.57 : whiteKeyWidth;
    }

    renderFrame(timeInSeconds) {
        const timeMs = timeInSeconds * 1000;
        
        // Ensure solid background for video encoders
        if (this.isRecordingResolution) {
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Logic for dual-mode: Recording vs UI
        let keyboardHeight = 0;
        if (this.isRecordingResolution) {
            keyboardHeight = 130 * (this.canvas.height / 720); // Scale 130px base
        }

        const visualizerHeight = this.canvas.height - keyboardHeight;
        const pixelsPerMs = visualizerHeight / this.lookahead;

        // Draw faint C-note guide lines (C1=24 to C8=108)
        this.ctx.save();
        this.ctx.strokeStyle = this.isRecordingResolution ? 'rgba(160, 160, 160, 0.12)' : 'rgba(180, 180, 180, 0.08)';
        this.ctx.lineWidth = this.isRecordingResolution ? 1.5 : 1;
        for (let octave = 1; octave <= 8; octave++) {
            const midi = 12 + octave * 12; // C1=24, C2=36, ... C8=108
            if (midi < 21 || midi > 108) continue;
            const x = this.getKeyX(midi);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, visualizerHeight);
            this.ctx.stroke();
        }
        this.ctx.restore();

        const visibleNotes = this.notes.filter(note => {
            const end = note.start + note.duration;
            return (note.start > timeMs && note.start < timeMs + this.lookahead) ||
                (note.start <= timeMs && end > timeMs);
        });

        const activeMidis = new Set();

        if (this.isRecordingResolution) {
            // During recording: perfect sync with MIDI data
            visibleNotes.forEach(note => {
                const x = this.getKeyX(note.midi);
                const width = this.getKeyWidth(note.midi);
                const isBlack = this.keyData.find(k => k.midi === note.midi).isBlack;
                const colorFactor = this._getNoteColorFactor(note);

                if (note.start > timeMs) {
                    const timeToHit = note.start - timeMs;
                    const h = (note.duration * pixelsPerMs);
                    const yBottom = (1 - (timeToHit / this.lookahead)) * visualizerHeight;
                    const yTop = yBottom - h;
                    this.renderNote(x, yTop, width, h, note.midi, isBlack, false, colorFactor);
                } else {
                    const timeRemaining = (note.start + note.duration) - timeMs;
                    const h = (timeRemaining * pixelsPerMs);
                    this.renderNote(x, visualizerHeight - h, width, h, note.midi, isBlack, true, colorFactor);
                    activeMidis.add(note.midi);
                }
            });
        } else {
            // UI Mode: Use both MIDI data and real-time events
            visibleNotes.forEach(note => {
                const x = this.getKeyX(note.midi);
                const width = this.getKeyWidth(note.midi);
                const isBlack = this.keyData.find(k => k.midi === note.midi).isBlack;
                const colorFactor = this._getNoteColorFactor(note);

                if (note.start > timeMs) {
                    // Falling note
                    const timeToHit = note.start - timeMs;
                    const h = (note.duration * pixelsPerMs);
                    const yBottom = (1 - (timeToHit / this.lookahead)) * visualizerHeight;
                    const yTop = yBottom - h;
                    this.renderNote(x, yTop, width, h, note.midi, isBlack, false, colorFactor);
                } else {
                    // Hitting part (RESTORED logic for visual persistence)
                    const timeRemaining = (note.start + note.duration) - timeMs;
                    const h = (timeRemaining * pixelsPerMs);
                    this.renderNote(x, visualizerHeight - h, width, h, note.midi, isBlack, true, colorFactor);
                    activeMidis.add(note.midi);
                }
            });
            // Also take hitting state from real-time events for immediate feedback
            this.realTimeActiveNotes.forEach(midi => activeMidis.add(midi));
        }

        const electricActiveMidis = [];
        activeMidis.forEach(midi => {
            electricActiveMidis.push({
                x: this.getKeyX(midi),
                width: this.getKeyWidth(midi),
                midi
            });
        });

        this.drawEffects(electricActiveMidis, timeMs, visualizerHeight);

        if (this.isRecordingResolution) {
            this.drawPianoKeyboard(activeMidis, keyboardHeight);
        }
    }

    drawPianoKeyboard(activeMidis, height) {
        const y = this.canvas.height - height;
        const whiteKeyWidth = this.canvas.width / this.totalWhiteKeys;
        const blackKeyWidth = whiteKeyWidth * 0.57;
        const blackKeyHeight = height * 0.62;
        const borderRadius = 5 * (this.canvas.height / 1080);

        // 1. Draw White Keys
        this.keyData.filter(k => !k.isBlack).forEach(key => {
            const x = key.whiteIndex * whiteKeyWidth;
            const isActive = activeMidis.has(key.midi);

            const gradient = this.ctx.createLinearGradient(x, y, x, y + height);
            if (isActive) {
                const activeColor = this.interpolateColor(key.midi);
                gradient.addColorStop(0, '#333333');
                gradient.addColorStop(0.1, activeColor);
                gradient.addColorStop(0.9, activeColor);
                gradient.addColorStop(1, '#ffffff');
            } else {
                gradient.addColorStop(0, '#111111');
                gradient.addColorStop(0.05, '#ebebeb');
                gradient.addColorStop(0.95, '#f5f5f5');
                gradient.addColorStop(1, '#b0b0b0');
            }

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            if (this.ctx.roundRect) {
                this.ctx.roundRect(x, y, whiteKeyWidth - 1, height, [0, 0, borderRadius, borderRadius]);
            } else {
                this.ctx.rect(x, y, whiteKeyWidth - 1, height);
            }
            this.ctx.fill();

            this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        });

        // 2. Draw Black Keys
        this.keyData.filter(k => k.isBlack).forEach(key => {
            const x = this.getKeyX(key.midi);
            const isActive = activeMidis.has(key.midi);

            const gradient = this.ctx.createLinearGradient(x, y, x, y + blackKeyHeight);
            if (isActive) {
                const activeColor = this.interpolateColor(key.midi);
                gradient.addColorStop(0, '#000000');
                gradient.addColorStop(0.2, activeColor);
                gradient.addColorStop(0.8, activeColor);
                gradient.addColorStop(1, '#222222');
            } else {
                gradient.addColorStop(0, '#444444');
                gradient.addColorStop(1, '#000000');
            }

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            if (this.ctx.roundRect) {
                this.ctx.roundRect(x, y, blackKeyWidth, blackKeyHeight, [0, 0, borderRadius / 2, borderRadius / 2]);
            } else {
                this.ctx.rect(x, y, blackKeyWidth, blackKeyHeight);
            }
            this.ctx.fill();

            // Highlight on black keys
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.fillRect(x + blackKeyWidth * 0.1, y + 2, blackKeyWidth * 0.8, 2);

            if (!isActive) {
                this.ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        });
    }

    drawEffects(activeMidis, timeMs, visualizerHeight) {
        if (!this.effectColor) return;
        this.ctx.save();

        const y = visualizerHeight;

        // Base Line (Always visible)
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.effectColor;
        this.ctx.lineWidth = 3;
        this.ctx.globalAlpha = 1.0;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = this.effectColor;
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.canvas.width, y);
        this.ctx.stroke();

        this.ctx.restore();

        if (this.effectType === 'none') return;

        // Spawn new particles
        if ((this.effectType === 'sparkle' || this.effectType === 'trail' || this.effectType === 'stardust') && this.effectIntensity > 0) {
            activeMidis.forEach(note => {
                const centerX = note.x + note.width / 2;
                const color = this.interpolateColor(note.midi);

                if (this.effectType === 'sparkle') {
                    // Scale probability with intensity (max 0.8 at 1.0 intensity)
                    if (Math.random() < (0.8 * this.effectIntensity)) {
                        this.particles.push({
                            x: centerX + (Math.random() - 0.5) * note.width * 1.5,
                            y: visualizerHeight,
                            vx: (Math.random() - 0.5) * 2,
                            vy: -Math.random() * (6 * this.effectIntensity + 2) - 3,
                            life: 1.0,
                            decay: Math.random() * 0.015 + 0.01,
                            color: color,
                            size: Math.random() * (6 * this.effectIntensity) + 2,
                            type: 'sparkle'
                        });
                    }
                } else if (this.effectType === 'trail') {
                    // Scale particle count with intensity (up to 5 at 1.0 intensity)
                    const trailCount = Math.max(1, Math.floor(5 * this.effectIntensity));
                    for (let i = 0; i < trailCount; i++) {
                        this.particles.push({
                            x: centerX + (Math.random() - 0.5) * note.width * 1.2,
                            y: visualizerHeight,
                            vx: (Math.random() - 0.5) * 1,
                            vy: -Math.random() * (4 * this.effectIntensity + 1) - 2,
                            life: 1.0,
                            decay: Math.random() * 0.02 + (0.02 * (1 - this.effectIntensity) + 0.01),
                            color: color,
                            size: Math.random() * (15 * this.effectIntensity + 5) + 5,
                            type: 'trail'
                        });
                    }
                } else if (this.effectType === 'stardust') {
                    // Soft, numerous glowing particles
                    const stardustCount = Math.max(1, Math.floor(8 * this.effectIntensity));
                    for (let i = 0; i < stardustCount; i++) {
                        // Some particles are larger "stars", most are small "dust"
                        const isStar = Math.random() < 0.15;
                        this.particles.push({
                            x: centerX + (Math.random() - 0.5) * note.width * 2.0,
                            y: visualizerHeight,
                            vx: (Math.random() - 0.5) * 3,
                            vy: -Math.random() * (4 * this.effectIntensity + 1) - 1,
                            life: 1.0,
                            decay: Math.random() * 0.015 + (0.01 * (1 - this.effectIntensity) + 0.005),
                            color: color,
                            size: isStar ? Math.random() * (4 * this.effectIntensity + 2) + 2 : Math.random() * 2 + 0.5,
                            type: isStar ? 'star' : 'dust'
                        });
                    }
                }
            });
        }

        // Stardust comet-tail: spawn particles from recently released notes (within 500ms)
        if (this.effectType === 'stardust' && this.effectIntensity > 0) {
            const now = performance.now();
            for (const [midi, info] of this.recentlyReleasedNotes) {
                const elapsed = now - info.releaseTime;
                if (elapsed > 500) {
                    this.recentlyReleasedNotes.delete(midi);
                    continue;
                }

                // Pick ONE shared direction for this frame's batch — all particles follow together
                if (!info.tailAngle) {
                    // Angle: mostly upward (between -120° and -60° from horizontal)
                    info.tailAngle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.7;
                    info.tailSpeed = Math.random() * 2 + 2;
                }
                const sharedVx = Math.cos(info.tailAngle) * info.tailSpeed;
                const sharedVy = Math.sin(info.tailAngle) * info.tailSpeed;

                const centerX = info.x + info.width / 2;
                const batchY = visualizerHeight - elapsed * 0.012; // group rises together over time

                // Emit just 1-2 tightly grouped particles
                const count = 2;
                for (let i = 0; i < count; i++) {
                    this.particles.push({
                        x: centerX + (Math.random() - 0.5) * 3, // near-identical start X
                        y: batchY + (Math.random() - 0.5) * 3,  // near-identical start Y
                        vx: sharedVx + (Math.random() - 0.5) * 0.6, // tiny deviation
                        vy: sharedVy + (Math.random() - 0.5) * 0.6,
                        life: 0.75,
                        decay: 0.022 + Math.random() * 0.008,
                        color: info.color,
                        size: Math.random() * 1.2 + 0.6,
                        type: 'cometTail'
                    });
                }
            }
        }

        // Electric Effect
        if (this.effectType === 'electric' && this.effectIntensity > 0) {
            this.ctx.save();
            this.ctx.strokeStyle = this.effectColor;
            activeMidis.forEach(note => {
                const centerX = note.x + note.width / 2;
                // Scale spark count with intensity (max 10)
                const sparkCount = Math.max(1, Math.floor(10 * this.effectIntensity));

                this.ctx.lineWidth = 1.2 * this.effectIntensity + 0.5;
                this.ctx.globalAlpha = this.effectIntensity;
                this.ctx.beginPath();
                for (let j = 0; j < sparkCount; j++) {
                    const startX = centerX + (Math.random() - 0.5) * note.width;
                    this.ctx.moveTo(startX, y);

                    let currX = startX;
                    let currY = y;
                    // Scale segments with intensity
                    const segments = Math.max(2, Math.floor(6 * this.effectIntensity));
                    for (let s = 0; s < segments; s++) {
                        currX += (Math.random() - 0.5) * (20 * this.effectIntensity + 5);
                        currY -= Math.random() * (15 * this.effectIntensity + 5);
                        this.ctx.lineTo(currX, currY);
                    }
                }
                this.ctx.stroke();
            });
            this.ctx.restore();
        }

        // Draw and update particles
        this.ctx.save();
        this.ctx.globalCompositeOperation = "screen";
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.ax) p.vx += p.ax; // horizontal acceleration for zigzag effect
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.globalAlpha = p.life;
            if (p.type === 'sparkle') {
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();

                // Draw cross
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
                this.ctx.lineWidth = 1.5;
                this.ctx.shadowBlur = 0;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x - p.size, p.y);
                this.ctx.lineTo(p.x + p.size, p.y);
                this.ctx.moveTo(p.x, p.y - p.size);
                this.ctx.lineTo(p.x, p.y + p.size);
                this.ctx.stroke();
            } else if (p.type === 'trail') {
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'star') {
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();

                // Draw 4-point star cross
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                this.ctx.lineWidth = 1.0;
                this.ctx.shadowBlur = 5;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x - p.size * 1.5, p.y);
                this.ctx.lineTo(p.x + p.size * 1.5, p.y);
                this.ctx.moveTo(p.x, p.y - p.size * 1.5);
                this.ctx.lineTo(p.x, p.y + p.size * 1.5);
                this.ctx.stroke();
            } else if (p.type === 'dust') {
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 5;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'cometTail') {
                // Tiny, fast-fading wispy dot — no glow, very small
                this.ctx.fillStyle = p.color;
                this.ctx.shadowBlur = 4;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, Math.max(0.3, p.size * p.life), 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    renderNote(x, y, width, height, midi, isBlack, isActive, timeMs) {
        const color = this.interpolateColor(midi, timeMs);
        const radius = Math.min(width / 2, height / 2, 12 * (this.canvas.height / 1080));
        const ctx = this.ctx;
        const scale = this.canvas.height / 1080;

        if (this.noteStyle === 'glass') {
            ctx.save();
            ctx.globalAlpha = isBlack ? 0.55 : 0.75;

            // Outer neon glow
            ctx.shadowBlur = 18 * scale;
            ctx.shadowColor = color;

            // Dark inner fill (glass-like dark center)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + 1, y, width - 2, height, radius);
            else ctx.rect(x + 1, y, width - 2, height);
            ctx.fill();

            // Bright rim using stroke
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5 * scale;
            ctx.shadowBlur = 20 * scale;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + 1, y, width - 2, height, radius);
            else ctx.rect(x + 1, y, width - 2, height);
            ctx.stroke();

            // Top glare (inner white highlight)
            const glareGrad = ctx.createLinearGradient(x, y, x, y + height * 0.3);
            glareGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
            glareGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glareGrad;
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            const glareW = (width - 2) * 0.6;
            const glareX = x + 1 + (width - 2 - glareW) / 2;
            if (ctx.roundRect) ctx.roundRect(glareX, y + 2, glareW, height * 0.28, radius);
            else ctx.rect(glareX, y + 2, glareW, height * 0.28);
            ctx.fill();

            ctx.restore();

        } else if (this.noteStyle === 'neon') {
            ctx.save();
            ctx.globalAlpha = isBlack ? 0.7 : 1.0;

            // Multi-layer glow for neon ring effect
            const layers = [
                { blur: 22 * scale, lw: 4 * scale, alpha: 0.4 },
                { blur: 10 * scale, lw: 3 * scale, alpha: 0.7 },
                { blur: 3 * scale, lw: 2 * scale, alpha: 1.0 },
            ];
            for (const l of layers) {
                ctx.shadowBlur = l.blur;
                ctx.shadowColor = color;
                ctx.strokeStyle = color;
                ctx.lineWidth = l.lw;
                ctx.globalAlpha = (isBlack ? 0.7 : 1.0) * l.alpha;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x + 1, y, width - 2, height, radius);
                else ctx.rect(x + 1, y, width - 2, height);
                ctx.stroke();
            }

            // Very faint inner fill so it's slightly visible
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.07;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + 1, y, width - 2, height, radius);
            else ctx.rect(x + 1, y, width - 2, height);
            ctx.fill();

            // White core line in the center (optional, for extra glam)
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 0.75 * scale;
            ctx.shadowBlur = 5 * scale;
            ctx.shadowColor = '#fff';
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + 2, y + 1, width - 4, height - 2, radius);
            else ctx.rect(x + 2, y + 1, width - 4, height - 2);
            ctx.stroke();

            ctx.restore();

        } else {
            // Classic style (original)
            ctx.fillStyle = color;
            ctx.globalAlpha = isBlack ? 0.7 : 0.9;
            if (isActive) {
                ctx.shadowBlur = 15 * scale;
                ctx.shadowColor = color;
            }
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x + 1, y, width - 2, height, radius);
            else ctx.rect(x + 1, y, width - 2, height);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.lineWidth = 1 * scale;
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}
