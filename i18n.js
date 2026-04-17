// i18n.js — MidiToPiano internationalization module

const translations = {
    tr: {
        pageTitle: 'MidiToPiano | MIDI Görselleştirici',
        subtitle: 'MIDI dosyalarınızı profesyonel piyano sesiyle görselleştirin',
        sfChangeBtn: '🎹 SoundFont Değiştir',
        leftHandLabel: 'Sol El (Bas):',
        rightHandLabel: 'Sağ El (Tiz):',
        effectColorLabel: 'Efekt Rengi:',
        effectLabel: 'Efekt:',
        effectNone: 'Kapalı',
        effectElectric: 'Elektrik',
        effectSparkle: 'Parıltı',
        effectTrail: 'Renk İzi',
        effectStardust: 'Yıldız Tozu',
        noteStyleLabel: 'Nota Stili:',
        noteStyleClassic: 'Klasik',
        noteStyleGlass: 'Cam',
        noteStyleNeon: 'Neon Halka',
        colorModeLabel: 'Renk Modu:',
        colorModeFixed: 'Sabit El',
        colorModeDynamic: 'Dinamik',
        intensityLabel: 'Yoğunluk:',
        dropZoneTitle: 'MIDI (.mid) Dosyasını Buraya Sürükleyin',
        dropZoneSubtitle: 'veya dosyayı seçmek için tıklayın',
        selectBtnText: 'Dosya Seç',
        playlistHint: 'Toplu seçim yaparak playlist oluşturabilirsiniz.',
        recordingBadge: '● KAYDEDİLİYOR',
        downloadVideoBtn: '🎥 Video İndir',
        newFileBtn: '📁 Yeni Seç',
        resolutionLabel: 'Çözünürlük:',
        fpsLabel: 'FPS:',
        syncOffsetLabel: 'Senkron Kayması (ms):',
        libraryTitle: "🎹 Notalarım (Kayıtlı MIDI'ler)",
        refreshLibraryBtn: 'Yenile',
        emptyLibraryMsg: 'Henüz kayıtlı nota yok.',
        libraryNotAvailable: 'Kütüphane özelliği bu sürümde mevcut değil.',
        footerText: '© 2026 MidiToPiano - Profesyonel MIDI Görselleştirici',
        loadingSoundFont: 'SoundFont Yükleniyor...',
        renderingTitle: 'Video Hazırlanıyor...',
        renderingSubtitle: 'Bu işlem biraz zaman alabilir, lütfen bekleyin.',
        prevSongTitle: 'Önceki Şarkı',
        stopTitle: 'Durdur',
        playPauseTitle: 'Oynat/Duraklat',
        resetTitle: 'Başa Dön',
        nextSongTitle: 'Sonraki Şarkı',
        videoSettingsTitle: 'Video Ayarları',
        // Dynamic
        statusLoading: 'Yükleniyor...',
        statusReady: 'Hazır',
        statusError: 'Hata!',
        statusPreparing: 'Hazırlanıyor...',
        statusUpdatingSF: 'SoundFont Güncelleniyor...',
        statusItemsFailedToLoad: 'Öğeler Yüklenemedi',
        statusLoadingFile: 'Yükleniyor',
        engineStartError: 'Ses motoru başlatılamadı: ',
        sfHttpError: 'SoundFont yüklenemedi (HTTP ',
        sfLoadError: 'SoundFont yüklenemedi: ',
        renderStarting: 'Başlatılıyor...',
        renderRecordStarting: 'Kayıt Başlatılıyor...',
        renderPreparing: 'Hazırlanıyor...',
        renderRecordingPrefix: 'Kaydediliyor: %',
        renderWaiting: 'Bitiş Bekleniyor...',
        renderError: 'Video işlenirken bir hata oluştu: ',
        renderMissingMidi: 'MIDI verileri kaybolmuş veya yüklenmemiş. Lütfen MIDI dosyasını tekrar yüklemeyi deneyin.',
        renderAltMode: 'Kayıt Başlatılıyor (Alternatif Mod)...',
    },
    en: {
        pageTitle: 'MidiToPiano | MIDI Visualizer',
        subtitle: 'Visualize your MIDI files with professional piano sound',
        sfChangeBtn: '🎹 Change SoundFont',
        leftHandLabel: 'Left Hand (Bass):',
        rightHandLabel: 'Right Hand (Treble):',
        effectColorLabel: 'Effect Color:',
        effectLabel: 'Effect:',
        effectNone: 'Off',
        effectElectric: 'Electric',
        effectSparkle: 'Sparkle',
        effectTrail: 'Color Trail',
        effectStardust: 'Stardust',
        noteStyleLabel: 'Note Style:',
        noteStyleClassic: 'Classic',
        noteStyleGlass: 'Glass',
        noteStyleNeon: 'Neon Ring',
        colorModeLabel: 'Color Mode:',
        colorModeFixed: 'Fixed Hand',
        colorModeDynamic: 'Dynamic',
        intensityLabel: 'Intensity:',
        dropZoneTitle: 'Drag MIDI (.mid) File Here',
        dropZoneSubtitle: 'or click to select a file',
        selectBtnText: 'Select File',
        playlistHint: 'Select multiple files to create a playlist.',
        recordingBadge: '● RECORDING',
        downloadVideoBtn: '🎥 Download Video',
        newFileBtn: '📁 Select New',
        resolutionLabel: 'Resolution:',
        fpsLabel: 'FPS:',
        syncOffsetLabel: 'Sync Offset (ms):',
        libraryTitle: '🎹 My Library (Saved MIDIs)',
        refreshLibraryBtn: 'Refresh',
        emptyLibraryMsg: 'No saved notes yet.',
        libraryNotAvailable: 'Library feature is not available in this version.',
        footerText: '© 2026 MidiToPiano - Professional MIDI Visualizer',
        loadingSoundFont: 'Loading SoundFont...',
        renderingTitle: 'Preparing Video...',
        renderingSubtitle: 'This may take a while, please wait.',
        prevSongTitle: 'Previous Song',
        stopTitle: 'Stop',
        playPauseTitle: 'Play / Pause',
        resetTitle: 'Restart',
        nextSongTitle: 'Next Song',
        videoSettingsTitle: 'Video Settings',
        // Dynamic
        statusLoading: 'Loading...',
        statusReady: 'Ready',
        statusError: 'Error!',
        statusPreparing: 'Preparing...',
        statusUpdatingSF: 'Updating SoundFont...',
        statusItemsFailedToLoad: 'Items Failed to Load',
        statusLoadingFile: 'Loading',
        engineStartError: 'Failed to start audio engine: ',
        sfHttpError: 'SoundFont could not be loaded (HTTP ',
        sfLoadError: 'Could not load SoundFont: ',
        renderStarting: 'Starting...',
        renderRecordStarting: 'Starting Recording...',
        renderPreparing: 'Preparing...',
        renderRecordingPrefix: 'Recording: %',
        renderWaiting: 'Finalizing...',
        renderError: 'An error occurred while rendering video: ',
        renderMissingMidi: 'MIDI data is missing or not loaded. Please try reloading the MIDI file.',
        renderAltMode: 'Starting Recording (Fallback Mode)...',
    }
};

let currentLang = localStorage.getItem('miditopiano-lang') || 'en';

/** Returns the translation for the given key in the current language. */
export function t(key) {
    return (translations[currentLang]?.[key])
        ?? (translations['tr']?.[key])
        ?? key;
}

export function getCurrentLang() {
    return currentLang;
}

export function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem('miditopiano-lang', lang);
    applyTranslations();
    document.documentElement.lang = lang;
    document.title = t('pageTitle');

    document.getElementById('lang-tr-btn')?.classList.toggle('active', lang === 'tr');
    document.getElementById('lang-en-btn')?.classList.toggle('active', lang === 'en');
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const text = t(el.dataset.i18n);
        el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
}

/** Call once after DOM is ready to wire up buttons and apply initial language. */
export function initI18n() {
    applyTranslations();
    document.title = t('pageTitle');
    document.documentElement.lang = currentLang;

    const trBtn = document.getElementById('lang-tr-btn');
    const enBtn = document.getElementById('lang-en-btn');
    if (trBtn && enBtn) {
        trBtn.classList.toggle('active', currentLang === 'tr');
        enBtn.classList.toggle('active', currentLang === 'en');
        trBtn.addEventListener('click', () => setLanguage('tr'));
        enBtn.addEventListener('click', () => setLanguage('en'));
    }
}
