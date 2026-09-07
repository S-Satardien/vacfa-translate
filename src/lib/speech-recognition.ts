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
 * Creates an instance of the live speech recognition controller.
 * 
 * @param callbacks Event handlers for transcripts, volume, and errors.
 * @param initialLang BCP-47 language tag (e.g. 'en-US', 'fr-FR', 'pt-PT', 'sw-KE').
 */
export function createSpeechRecognitionController(
  callbacks: SpeechRecognitionCallbacks,
  initialLang = 'en-US'
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
        const text = item[0].transcript;
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
        en: 'en-US',
        fr: 'fr-FR',
        pt: 'pt-PT',
        sw: 'sw-KE',
      };
      activeLang = mapping[langCode] || langCode;
      if (recognition) {
        recognition.lang = activeLang;
      }
    },
  };
}
