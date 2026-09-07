/**
 * VACFA Translate — Real-Time Speech Recognition Engine
 * 
 * Captures live microphone input via the Web Speech API (SpeechRecognition / webkitSpeechRecognition),
 * tracks audio volume levels via the Web Audio API for animated waveforms,
 * and provides continuous streaming of interim and final speech transcripts.
 */

export interface SpeechRecognitionCallbacks {
  /** Fired when interim or partial speech is recognized */
  onInterimResult?: (transcript: string) => void;
  /** Fired when a complete speech phrase/sentence is finalized */
  onFinalResult?: (transcript: string) => void;
  /** Fired on microphone volume level change (0.0 to 1.0) */
  onAudioLevel?: (level: number) => void;
  /** Fired when listening state changes */
  onStateChange?: (isListening: boolean) => void;
  /** Fired on error */
  onError?: (errorMessage: string) => void;
}

export interface SpeechRecognitionController {
  start: () => Promise<void>;
  stop: () => void;
  isListening: () => boolean;
  isSupported: () => boolean;
  setLanguage: (langCode: string) => void;
}

/**
 * Normalizes speech recognition phonetic ambiguities for specialized African vaccine,
 * epidemiological, and health economics acronyms and terminology.
 * 
 * E.g., ensures "night tag" or "nit tag" -> "NITAG", "right tag" -> "RITAG",
 * "garvey" -> "Gavi", "a e f i" -> "AEFI", "v v m" -> "VVM", etc.
 */
export function normalizeMedicalSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b(night\s*tag|nit\s*tag|knit\s*tag|knight\s*tag|nytag|ni\s*tag|nite\s*tag)\b/gi, 'NITAG')
    .replace(/\b(niche|nish|n\s*i\s*s\s*h)\b/gi, 'NISH')
    .replace(/\b(right\s*tag|rytag|ri\s*tag|write\s*tag)\b/gi, 'RITAG')
    .replace(/\b(a\s*e\s*f\s*i|affy)\b/gi, 'AEFI')
    .replace(/\b(e\s*p\s*i)\b/gi, 'EPI')
    .replace(/\b(v\s*v\s*m|vbm)\b/gi, 'VVM')
    .replace(/\b(garvey|garve|gavy|gabi)\b/gi, 'Gavi')
    .replace(/\b(m\s*r\s*n\s*a)\b/gi, 'mRNA')
    .replace(/\b(zero\s*dose|0\s*dose)\b/gi, 'zero-dose')
    .replace(/\b(i\s*c\s*e\s*r|eye\s*ser)\b/gi, 'ICER')
    .replace(/\b(d\s*a\s*l\s*y|dah\s*lee)\b/gi, 'DALY')
    .replace(/\b(q\s*a\s*l\s*y|kwah\s*lee)\b/gi, 'QALY')
    .replace(/\b(h\s*t\s*a)\b/gi, 'HTA')
    .replace(/\b(c\s*e\s*a)\b/gi, 'CEA');
}

/**
 * Creates an instance of the live speech recognition controller.
 * 
 * @param callbacks Event handlers for transcripts, volume, and errors.
 * @param initialLang BCP-47 language tag (default: 'en-ZA' for African English accents).
 */
export function createSpeechRecognitionController(
  callbacks: SpeechRecognitionCallbacks,
  initialLang = 'en-ZA'
): SpeechRecognitionController {
  let recognition: any = null;
  let isListeningState = false;
  let activeLang = initialLang;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let microphoneStream: MediaStream | null = null;
  let animationFrameId: number | null = null;

  // Detect speech recognition support
  const SpeechRecognitionConstructor =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  /**
   * Initializes Web Audio analyser to measure mic volume for visualizer bars.
   */
  async function initAudioAnalyser(): Promise<void> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioCtx();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioContext.createMediaStreamSource(microphoneStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function updateVolume() {
        if (!analyser || !isListeningState) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(1, average / 128); // 0.0 to 1.0

        callbacks.onAudioLevel?.(normalized);
        animationFrameId = requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch {
      // Audio level monitoring is optional; speech recognition can still work
    }
  }

  /**
   * Cleans up audio analyser and microphone stream.
   */
  function cleanupAudioAnalyser(): void {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop());
      microphoneStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyser = null;
    callbacks.onAudioLevel?.(0);
  }

  /**
   * Builds the SpeechRecognition instance with event listeners.
   */
  function setupRecognition(): void {
    if (!SpeechRecognitionConstructor) return;

    recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = activeLang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const text = normalizeMedicalSpeech(item[0].transcript);
        if (item.isFinal) {
          callbacks.onFinalResult?.(text.trim());
        } else {
          interim += text;
        }
      }
      if (interim) {
        callbacks.onInterimResult?.(interim);
      }
    };

    recognition.onerror = (event: any) => {
      // Don't treat expected 'no-speech' or 'aborted' as fatal errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      callbacks.onError?.(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if user did not explicitly stop (handles browser timeouts)
      if (isListeningState) {
        try {
          recognition.start();
        } catch {
          // Restart failed, update state
          isListeningState = false;
          cleanupAudioAnalyser();
          callbacks.onStateChange?.(false);
        }
      } else {
        cleanupAudioAnalyser();
        callbacks.onStateChange?.(false);
      }
    };
  }

  return {
    async start(): Promise<void> {
      if (!SpeechRecognitionConstructor) {
        callbacks.onError?.('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }

      if (isListeningState) return;

      setupRecognition();
      try {
        isListeningState = true;
        recognition.start();
        callbacks.onStateChange?.(true);
        await initAudioAnalyser();
      } catch (err: any) {
        isListeningState = false;
        cleanupAudioAnalyser();
        callbacks.onStateChange?.(false);
        callbacks.onError?.(err?.message || 'Failed to start microphone speech recognition.');
      }
    },

    stop(): void {
      isListeningState = false;
      cleanupAudioAnalyser();
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          // Ignore
        }
      }
      callbacks.onStateChange?.(false);
    },

    isListening(): boolean {
      return isListeningState;
    },

    isSupported(): boolean {
      return Boolean(SpeechRecognitionConstructor);
    },

    setLanguage(langCode: string): void {
      const mapping: Record<string, string> = {
        en: 'en-ZA', // Tuned for African English accents (South Africa, Kenya, Nigeria, Ghana)
        fr: 'fr-FR',
        pt: 'pt-PT', // Tuned for African Lusophone Portuguese (Angola, Mozambique)
        sw: 'sw-KE', // Tuned for East African Swahili (Kenya, Tanzania)
      };
      activeLang = mapping[langCode] || langCode;
      if (recognition) {
        recognition.lang = activeLang;
      }
    },
  };
}
