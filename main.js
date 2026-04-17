import { WorkletSynthesizer, Sequencer } from "spessasynth_lib";
const processorURL = 'spessasynth_processor.js';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from "mp4-muxer";
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMArrayBufferTarget } from "webm-muxer";
import { Visualizer } from "./visualizer.js";
import { t, initI18n } from './i18n.js';



const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    selectBtn: document.getElementById('select-btn'),
    playerControls: document.getElementById('player-controls'),
    displayName: document.getElementById('display-name'),
    loadStatus: document.getElementById('load-status'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    stopBtn: document.getElementById('stop-btn'),
    resetBtn: document.getElementById('reset-btn'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    progressBar: document.getElementById('progress-bar'),
    currentTime: document.getElementById('current-time'),
    duration: document.getElementById('duration'),
    pianoKeyboard: document.getElementById('piano-keyboard'),
    loadingOverlay: document.getElementById('loading-overlay'),
    refreshLibraryBtn: document.getElementById('refresh-library-btn'),
    leftColorInput: document.getElementById('left-color'),
    rightColorInput: document.getElementById('right-color'),
    effectColorInput: document.getElementById('effect-color'),
    effectSelect: document.getElementById('effect-type'),
    effectIntensity: document.getElementById('effect-intensity'),
    noteStyleSelect: document.getElementById('note-style'),
    colorModeSelect: document.getElementById('color-mode'),
    downloadVideoBtn: document.getElementById('download-video-btn'),
    videoSettingsBtn: document.getElementById('video-settings-btn'),
    newFileBtn: document.getElementById('new-file-btn'),
    volumeSlider: document.getElementById('volume-slider'),
    volumeIcon: document.getElementById('volume-icon'),
    videoSettingsPanel: document.getElementById('video-settings-panel'),
    exportRes: document.getElementById('export-res'),
    exportFps: document.getElementById('export-fps'),
    recordingStatus: document.getElementById('recording-status'),
    noteCanvas: document.getElementById('note-canvas'),
    sfChangeBtn: document.getElementById('sf-change-btn'),
    sfInput: document.getElementById('sf-input'),
    sfNameEl: document.getElementById('sf-name'),
    libraryList: document.getElementById('library-list')
};

let audioContext = null;
let synthetiser = null;
let sequencer = null;
let soundFontBuffer = null;
let isPlaying = false;
let visualizer;
let pianoKeys = [];
let originalFileNames = [];
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentMidiBuffer = null;
let isRendering = false;
let isPreRolling = false;
let playStartTime = 0;
let preRollDurationMs = 4000;
function initKeyboard() {
    elements.pianoKeyboard.innerHTML = '';
    pianoKeys = [];
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 88 keys: A0 (MIDI 21) to C8 (MIDI 108)
    // We need to count white keys to position black keys relative to them
    let whiteKeyCount = 0;
    const keyData = [];

    for (let midi = 21; midi <= 108; midi++) {
        const noteName = notes[midi % 12];
        const isBlack = noteName.includes('#');
        keyData.push({ midi, isBlack, noteName });
        if (!isBlack) whiteKeyCount++;
    }

    const whiteKeyWidthPercent = 100 / whiteKeyCount;
    let currentWhiteKeyIndex = 0;

    keyData.forEach((data) => {
        const octave = Math.floor(data.midi / 12) - 1;
        const key = document.createElement('div');
        key.className = `piano-key ${data.isBlack ? 'black' : 'white'}`;
        key.dataset.note = `${data.noteName}${octave}`;
        key.dataset.midi = data.midi;

        if (data.isBlack) {
            // Position black key between two white keys
            // The black key should be centered over the gap
            // Using left percentage based on current white key count
            // 0.55 is half of black key width (1.1%)
            const leftOffset = (currentWhiteKeyIndex * whiteKeyWidthPercent) - (0.55);
            key.style.left = `${leftOffset}%`;
        } else {
            currentWhiteKeyIndex++;
        }

        elements.pianoKeyboard.appendChild(key);
        pianoKeys[data.midi] = key;
    });
}

async function initEngine() {
    if (synthetiser) return;

    elements.loadingOverlay.classList.remove('hidden');
    elements.loadStatus.textContent = t('statusLoading');
    try {
        console.log('[initEngine] Başlatılıyor...');
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Load SoundFont if not already loaded
        if (!soundFontBuffer) {
            console.log('[initEngine] Soundfont indiriliyor: Nord Romantic Grand (soundfont.sf2)');
            const sfURL = new URL('soundfont.sf2', window.location.href).href;
            const response = await fetch(sfURL);
            if (!response.ok) throw new Error(t('sfHttpError') + response.status + ')');
            soundFontBuffer = await response.arrayBuffer();
            console.log('[initEngine] Soundfont hazır:', soundFontBuffer.byteLength, 'bytes');
        }

        // FIX: Electron AppImage restricts file:// protocol for AudioWorklets.
        // We must fetch the static processor script, create a Blob, and use that URL.
        const pURL = new URL(processorURL, window.location.href).href;
        console.log('[initEngine] AudioWorklet modülü indiriliyor (URL):', pURL);

        try {
            const processorResponse = await fetch(pURL);
            if (!processorResponse.ok) throw new Error(`Audio processor fetch failed (HTTP ${processorResponse.status})`);
            const processorCode = await processorResponse.text();
            console.log('[initEngine] Processor kodu alındı, uzunluk:', processorCode.length);
            
            const processorBlob = new Blob([processorCode], { type: 'application/javascript' });
            const processorBlobURL = URL.createObjectURL(processorBlob);
            
            console.log('[initEngine] addModule çağrılıyor (Blob URL)...');
            await audioContext.audioWorklet.addModule(processorBlobURL);
            console.log('[initEngine] addModule başarılı.');

            console.log('[initEngine] WorkletSynthesizer oluşturuluyor...');
            // SpessaSynth just needs the context. It picks up the loaded processor internally.
            synthetiser = new WorkletSynthesizer(audioContext);
        } catch (e) {
            console.error('[initEngine] Synthetiser oluşturma hatası:', e);
            throw e;
        }

        // Use a GainNode as a master out for easier recording routing
        const mainGainNode = audioContext.createGain();
        mainGainNode.gain.value = 0.9;
        synthetiser.connect(mainGainNode);
        mainGainNode.connect(audioContext.destination);

        window.mainGainNode = mainGainNode;

        console.log('[initEngine] Synthetiser.isReady bekleniyor...');
        await synthetiser.isReady;
        console.log('[initEngine] Synthetiser hazır.');

        // CORRECT soundbank loading
        await synthetiser.soundBankManager.addSoundBank(soundFontBuffer.slice(0), 'piano-sf2');
        console.log('[initEngine] SoundBank yüklendi.');

        // CORRECT event management for SpessaSynth 4.x
        synthetiser.eventHandler.addEvent('noteOn', 'piano-viz-on', (data) => {
            const midi = data.midiNote;
            if (visualizer) visualizer.noteOn(midi);
            const key = pianoKeys[midi];
            if (key) {
                key.classList.add('active');
                const factor = Math.max(0, Math.min(1, (midi - 21) / (108 - 21)));
                const color = interpolateColor(
                    elements.leftColorInput.value,
                    elements.rightColorInput.value,
                    factor
                );
                key.style.setProperty('--active-color', color);
            }
        });

        synthetiser.eventHandler.addEvent('noteOff', 'piano-viz-off', (data) => {
            const midi = data.midiNote;
            if (visualizer) visualizer.noteOff(midi);
            if (pianoKeys[midi]) {
                pianoKeys[midi].classList.remove('active');
            }
        });

        elements.loadStatus.textContent = t('statusReady');
        console.log('[initEngine] Tamamlandı.');
    } catch (err) {
        console.error('[initEngine] KRİTİK HATA:', err);
        elements.loadStatus.textContent = t('statusError');
        alert(t('engineStartError') + err.message + '\n\nDetay için terminal çıktısına bakınız.');
    } finally {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function interpolateColor(color1, color2, factor) {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);
    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);
    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));
    return `rgb(${r}, ${g}, ${b})`;
}

function updateSongDisplay() {
    if (!sequencer) return;
    const index = sequencer.songIndex;
    const total = sequencer.songsAmount;
    if (total > 0 && originalFileNames[index]) {
        elements.displayName.textContent = `${originalFileNames[index]} (${index + 1}/${total})`;
    }
}

async function loadMidis(files) {
    if (files.length === 0) return;
    await initEngine();

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    elements.playerControls.classList.remove('hidden');
    elements.dropZone.classList.add('hidden');

    let buffersToLoad = [];
    originalFileNames = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let arrayBuffer;

        elements.displayName.textContent = `${file.name} - ${t('statusLoadingFile')} (${i + 1}/${files.length})...`;
        originalFileNames.push(file.name);

        elements.loadStatus.textContent = t('statusPreparing');
        arrayBuffer = await file.arrayBuffer();

        const validFileName = file.name;

        buffersToLoad.push({
            fileName: validFileName,
            binary: arrayBuffer
        });
    }

    if (buffersToLoad.length === 0) {
        elements.loadStatus.textContent = t('statusItemsFailedToLoad');
        return;
    }

    elements.loadStatus.textContent = t('statusReady');

    if (sequencer) {
        sequencer.pause();
    } else {
        sequencer = new Sequencer(synthetiser);
        // SpessaSynth 4.x'de şarkı değişimi için hook ekliyoruz
        setInterval(() => updateSongDisplay(), 1000);
    }

    // Defensive clone for sequencer
    const clonedBuffers = buffersToLoad.map(b => ({
        fileName: b.fileName,
        binary: b.binary.slice(0)
    }));
    await sequencer.loadNewSongList(clonedBuffers);
    
    // Switch to first song and wait for it to be fully parsed
    sequencer.songIndex = 0;
    try {
        await sequencer.isReady; // Wait for metadata/parsing
    } catch (e) {
        console.warn("Sequencer isReady error:", e);
    }
    
    isPlaying = false;
    isPreRolling = false;
    elements.playPauseBtn.textContent = '▶';
    updateSongDisplay();
    updateProgress();

    // Pass latest MIDI buffer to visualizer for falling notes
    if (visualizer && buffersToLoad.length > 0) {
        currentMidiBuffer = buffersToLoad[0].binary;
        console.log("Loading MIDI into visualizer...");
        visualizer.setMidiFile(currentMidiBuffer);
    }
}

function updateProgress() {
    if (!sequencer) return;

    let current = sequencer.currentTime;
    const total = sequencer.duration || 0;

    if (isPreRolling) {
        const elapsed = performance.now() - playStartTime;
        if (elapsed >= preRollDurationMs) {
            isPreRolling = false;
            sequencer.play();
            current = 0;
        } else {
            current = (elapsed - preRollDurationMs) / 1000; // negative time in seconds
        }
    }

    elements.progressBar.value = total > 0 ? (Math.max(0, current) / total) * 100 : 0;
    elements.currentTime.textContent = formatTime(Math.max(0, current));
    elements.duration.textContent = formatTime(total);

    // Sync visualizer time
    if (visualizer && sequencer) {
        visualizer.setCurrentTime(current);
    }

    if (isPlaying) {
        requestAnimationFrame(updateProgress);
    }

    if (current >= total && isPlaying) {
        stopPlayback();
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function togglePlayback() {
    if (!sequencer) return;

    if (isPlaying) {
        isPreRolling = false;
        sequencer.pause();
        elements.playPauseBtn.textContent = '▶';
    } else {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (sequencer.currentTime === 0) {
            isPreRolling = true;
            playStartTime = performance.now();
        } else {
            sequencer.play();
        }
        elements.playPauseBtn.textContent = '⏸';
        requestAnimationFrame(updateProgress);
    }
    isPlaying = !isPlaying;
}

function stopPlayback() {
    if (!sequencer) return;
    sequencer.pause();
    sequencer.currentTime = 0;
    isPreRolling = false;
    isPlaying = false;
    elements.playPauseBtn.textContent = '▶';
    updateProgress();
}

function playPrevSong() {
    if (!sequencer || sequencer.songsAmount <= 1) return;
    if (sequencer.songIndex > 0) {
        sequencer.songIndex = sequencer.songIndex - 1;
    } else {
        sequencer.songIndex = sequencer.songsAmount - 1; // loop to last
    }
    updateSongDisplay();
}

function playNextSong() {
    if (!sequencer || sequencer.songsAmount <= 1) return;
    if (sequencer.songIndex < sequencer.songsAmount - 1) {
        sequencer.songIndex = sequencer.songIndex + 1;
    } else {
        sequencer.songIndex = 0; // loop to first
    }
    updateSongDisplay();
}

// Event Listeners
elements.selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
});
elements.newFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
});

elements.refreshLibraryBtn.addEventListener('click', () => {
    elements.libraryList.innerHTML = `<p class="empty-msg">${t('libraryNotAvailable')}</p>`;
});

elements.sfChangeBtn.addEventListener('click', () => {
    elements.sfInput.click();
});

elements.sfInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        elements.sfNameEl.textContent = t('statusLoading');

        try {
            const buffer = await file.arrayBuffer();
            soundFontBuffer = buffer;

            if (synthetiser) {
                elements.loadingOverlay.classList.remove('hidden');
                elements.loadStatus.textContent = t('statusUpdatingSF');

                // Clear existing soundbanks and add the new one
                // Defensive clone
                await synthetiser.soundBankManager.addSoundBank(soundFontBuffer.slice(0), file.name);

                elements.loadingOverlay.classList.add('hidden');
                elements.sfNameEl.textContent = file.name;
                console.log('SoundFont converted/updated:', file.name);
            } else {
                elements.sfNameEl.textContent = file.name;
            }
        } catch (err) {
            console.error('SoundFont load error:', err);
            alert(t('sfLoadError') + err.message);
            elements.sfNameEl.textContent = t('statusError');
        }
    }
});

elements.dropZone.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadMidis(e.target.files);
    }
});

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('dragover');
});

elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('dragover');
});

elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        loadMidis(e.dataTransfer.files);
    }
});

elements.playPauseBtn.addEventListener('click', togglePlayback);
elements.stopBtn.addEventListener('click', stopPlayback);
elements.prevBtn.addEventListener('click', playPrevSong);
elements.nextBtn.addEventListener('click', playNextSong);

elements.resetBtn.addEventListener('click', () => {
    if (sequencer) {
        sequencer.currentTime = 0;
        updateProgress();
    }
});

elements.progressBar.addEventListener('input', (e) => {
    if (sequencer) {
        sequencer.currentTime = (e.target.value / 100) * sequencer.duration;
        updateProgress();
    }
});

let previousVolume = 0.9;

elements.volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (window.mainGainNode) {
        window.mainGainNode.gain.value = val;
    }

    if (val === 0) {
        elements.volumeIcon.textContent = '🔇';
    } else if (val < 0.5) {
        elements.volumeIcon.textContent = '🔉';
    } else {
        elements.volumeIcon.textContent = '🔊';
    }
});

elements.volumeIcon.addEventListener('click', () => {
    if (parseFloat(elements.volumeSlider.value) > 0) {
        previousVolume = elements.volumeSlider.value;
        elements.volumeSlider.value = 0;
        elements.volumeSlider.dispatchEvent(new Event('input'));
    } else {
        elements.volumeSlider.value = previousVolume > 0 ? previousVolume : 0.9;
        elements.volumeSlider.dispatchEvent(new Event('input'));
    }
});

// Init
initKeyboard();
initI18n();
visualizer = new Visualizer(elements.noteCanvas, pianoKeys);
visualizer.setColors(elements.leftColorInput.value, elements.rightColorInput.value);
visualizer.setEffectColor(elements.effectColorInput.value);
visualizer.setEffectType(elements.effectSelect.value);
visualizer.setEffectIntensity(elements.effectIntensity.value);
visualizer.setNoteStyle(elements.noteStyleSelect.value);
visualizer.setColorMode(elements.colorModeSelect.value);

// Color Inputs
elements.leftColorInput.addEventListener('input', (e) => {
    visualizer.setColors(e.target.value, elements.rightColorInput.value);
});
elements.rightColorInput.addEventListener('input', (e) => {
    visualizer.setColors(elements.leftColorInput.value, e.target.value);
});
elements.effectColorInput.addEventListener('input', (e) => {
    visualizer.setEffectColor(e.target.value);
});
elements.effectSelect.addEventListener('change', (e) => {
    visualizer.setEffectType(e.target.value);
});
elements.effectIntensity.addEventListener('input', (e) => {
    visualizer.setEffectIntensity(e.target.value);
});
elements.noteStyleSelect.addEventListener('change', (e) => {
    visualizer.setNoteStyle(e.target.value);
});
elements.colorModeSelect.addEventListener('change', (e) => {
    visualizer.setColorMode(e.target.value);
});

// --- Offline Rendering Logic ---

async function renderVideo() {
    if (!sequencer || isRendering) return;
    isRendering = true;

    const targetHeight = parseInt(elements.exportRes.value);
    const targetFps = parseInt(elements.exportFps.value);
    const targetWidth = Math.round((targetHeight / 9) * 16);
    const duration = sequencer.duration;

    // UI Feedback
    elements.renderingOverlay.classList.remove('hidden');
    const progressBar = document.getElementById('render-progress');
    const percentageText = document.getElementById('render-percentage');

    progressBar.style.width = "2%";
    percentageText.textContent = t('renderStarting');

    try {
        if (!currentMidiBuffer || currentMidiBuffer.byteLength === 0) {
            throw new Error(t('renderMissingMidi'));
        }
        
        console.log("Starting legacy rendering (MediaRecorder) for:", elements.displayName.textContent);
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        percentageText.textContent = t('renderRecordStarting');
        if (visualizer) visualizer.setRecordingResolution(targetWidth, targetHeight);

        // Reset playback
        sequencer.pause();
        sequencer.currentTime = 0;
        if (visualizer) visualizer.setCurrentTime(0);

        // Prepare Streams
        const canvasStream = elements.noteCanvas.captureStream(targetFps);
        const destination = audioContext.createMediaStreamDestination();
        if (window.mainGainNode) window.mainGainNode.connect(destination);

        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        const recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
            ? 'video/webm;codecs=vp9,opus' 
            : 'video/webm';
        
        const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: targetHeight >= 1080 ? 12000000 : 6000000
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        recorder.start();
        
        // Preroll for rendering
        const syncOffset = (parseInt(document.getElementById('export-sync').value) || 0) / 1000;
        const latencyOffset = (audioContext.baseLatency || 0) + (audioContext.outputLatency || 0) - 0.20 + syncOffset;
        const preRollFrames = Math.ceil((preRollDurationMs / 1000) * targetFps);
        for (let i = 0; i < preRollFrames; i++) {
            if (!isRendering) break;
            const frameTime = ((i / targetFps) * 1000 - preRollDurationMs) / 1000 + latencyOffset;
            if (visualizer) visualizer.renderFrame(frameTime);
            progressBar.style.width = `0%`;
            percentageText.textContent = t('renderPreparing');
            await new Promise(r => requestAnimationFrame(r));
        }

        sequencer.play();

        // Monitoring loop
        while (sequencer.currentTime < duration && isRendering) {
            let renderTime = sequencer.currentTime + latencyOffset;
            if (visualizer) visualizer.renderFrame(renderTime);
            
            const progress = Math.min(100, Math.round((sequencer.currentTime / duration) * 100));
            progressBar.style.width = `${progress}%`;
            percentageText.textContent = `Kaydediliyor: %${progress}`;
            
            if (sequencer.currentTime >= duration - 0.1) break; // Safety break
            await new Promise(r => requestAnimationFrame(r));
        }

        // Postroll for rendering
        const postRollFrames = Math.ceil(4 * targetFps);
        for (let i = 0; i < postRollFrames; i++) {
            if (!isRendering) break;
            if (visualizer) visualizer.renderFrame(duration + latencyOffset);
            progressBar.style.width = `100%`;
            percentageText.textContent = t('renderWaiting');
            await new Promise(r => requestAnimationFrame(r));
        }

        recorder.stop();
        sequencer.pause();
        sequencer.currentTime = 0;
        if (window.mainGainNode) window.mainGainNode.disconnect(destination);

        // Wait for recorder to finish gathering chunks
        await new Promise(r => recorder.onstop = r);

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        saveBlob(blob, 'webm', targetHeight);

    } catch (err) {
        console.error("Rendering failed:", err);
        alert("Video işlenirken bir hata oluştu: " + err.message);
    } finally {
        if (visualizer) visualizer.resetResolution();
        elements.renderingOverlay.classList.add('hidden');
        isRendering = false;
    }
}

/** 
 * Fallback Video Rendering using MediaRecorder 
 * (For Zen, Firefox, or when WebCodecs fails)
 */
async function renderVideoFallback(targetWidth, targetHeight, targetFps, duration) {
    try {
        percentageText.textContent = t('renderAltMode');
        if (visualizer) visualizer.setRecordingResolution(targetWidth, targetHeight);

        // Reset playback
        sequencer.pause();
        sequencer.currentTime = 0;
        if (visualizer) visualizer.setCurrentTime(0);

        // Prepare Streams
        const canvasStream = elements.noteCanvas.captureStream(targetFps);
        const destination = audioContext.createMediaStreamDestination();
        if (window.mainGainNode) window.mainGainNode.connect(destination);

        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        const recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
            ? 'video/webm;codecs=vp9,opus' 
            : 'video/webm';
        
        const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: targetHeight >= 1080 ? 12000000 : 6000000
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        recorder.start();

        // Preroll for fallback rendering
        const syncOffset = (parseInt(document.getElementById('export-sync').value) || 0) / 1000;
        const latencyOffset = (audioContext.baseLatency || 0) + (audioContext.outputLatency || 0) - 0.20 + syncOffset;
        const preRollFrames = Math.ceil((preRollDurationMs / 1000) * targetFps);
        for (let i = 0; i < preRollFrames; i++) {
            if (!sequencer.playing && sequencer.currentTime === 0) {
                // Not playing yet, doing preroll
            }
            const t = ((i / targetFps) * 1000 - preRollDurationMs) / 1000 + latencyOffset;
            if (visualizer) visualizer.renderFrame(t);
            progressBar.style.width = `0%`;
            percentageText.textContent = `Hazırlanıyor (Alternatif Mod)...`;
            await new Promise(r => requestAnimationFrame(r));
        }

        sequencer.play();

        const totalFrames = Math.ceil(duration * targetFps);
        let elapsedFrames = 0;

        // Monitoring loop
        while (sequencer.currentTime < duration && sequencer.playing) {
            let renderTime = sequencer.currentTime + latencyOffset;
            if (visualizer) visualizer.renderFrame(renderTime);
            
            elapsedFrames = Math.floor(sequencer.currentTime * targetFps);
            const progress = Math.min(100, Math.round((sequencer.currentTime / duration) * 100));
            progressBar.style.width = `${progress}%`;
            percentageText.textContent = `Kaydediliyor: %${progress}`;
            
            await new Promise(r => requestAnimationFrame(r));
        }

        // Postroll for fallback rendering
        const postRollFrames = Math.ceil(4 * targetFps);
        for (let i = 0; i < postRollFrames; i++) {
            if (visualizer) visualizer.renderFrame(duration + latencyOffset);
            progressBar.style.width = `100%`;
            percentageText.textContent = `Bitiş Bekleniyor (Alternatif Mod)...`;
            await new Promise(r => requestAnimationFrame(r));
        }

        recorder.stop();
        sequencer.pause();
        if (window.mainGainNode) window.mainGainNode.disconnect(destination);

        // Wait for recorder to finish gathering chunks
        await new Promise(r => recorder.onstop = r);

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        saveBlob(blob, 'webm', targetHeight);

    } catch (err) {
        console.error("Rendering failed:", err);
        alert("Video işlenirken bir hata oluştu: " + err.message);
    } finally {
        if (visualizer) visualizer.resetResolution();
        elements.renderingOverlay.classList.add('hidden');
        isRendering = false;
    }
}

function saveBlob(blob, extension, targetHeight) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rawName = elements.displayName.textContent.split('(')[0].trim() || 'piano';
    a.download = `${rawName}_Render_${targetHeight}p.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Ensure elements are updated
elements.renderingOverlay = document.getElementById('rendering-overlay');

// Re-attach listeners
elements.videoSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.videoSettingsPanel.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!elements.videoSettingsPanel.contains(e.target) && e.target !== elements.videoSettingsBtn) {
        elements.videoSettingsPanel.classList.add('hidden');
    }
});

elements.downloadVideoBtn.addEventListener('click', renderVideo);

// Sync Offset Display
const syncSlider = document.getElementById('export-sync');
const syncValText = document.getElementById('sync-val');
if (syncSlider && syncValText) {
    syncSlider.addEventListener('input', (e) => {
        syncValText.textContent = `${e.target.value}ms`;
    });
}

console.log('App initialized');
