/**
 * VACFA Translate — Continuous Audio Speech Synthesis (TTS) Engine
 * 
 * Features:
 * 1. Sentence Chunker: Automatically breaks long/run-on sentences at natural punctuation & clause boundaries.
 * 2. FIFO Audio Queue: Never interrupts, skips, or ignores previous speech; queues and plays all sentences sequentially.
 * 3. Adaptive Cadence Catch-Up: Dynamically adjusts speech rate when speakers speak rapidly so listeners stay in sync.
 * 4. Neural Native African Audio: Streams authentic East African Kiswahili, French, and Portuguese neural speech models.
 * 5. Web Speech Synthesis Fallback: Offline backup if network connection is interrupted.
 */

interface SpeechSynthesisController {
  speak: (text: string, langCode: string) => void;
  stop: () => void;
  isSpeaking: () => boolean;
  isSupported: () => boolean;
}

interface AudioQueueItem {
  text: string;
  langCode: string;
}

const audioQueue: AudioQueueItem[] = [];
let isProcessingQueue = false;
let currentAudioElement: HTMLAudioElement | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];

/**
 * Loads available browser speech synthesis voices.
 */
function loadVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  cachedVoices = window.speechSynthesis.getVoices();
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}

/**
 * Strips bracket indicators, glossary markers, and HTML tags from text for clean TTS pronunciation.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/\[(FR|PT|SW|EN)\]/gi, '') // remove prefix indicators
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prepares acronyms (like NITAG, NISH, AEFI, VVM, DALY) for natural phonetic speech in the target language.
 */
function prepareAcronymsForSpeech(text: string, langCode: string): string {
  let processed = text;
  if (langCode === 'fr') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bNISH\b/g, 'Niche')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bPEV\b/g, 'P. E. V.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly')
      .replace(/\bQALY\b/g, 'Koualy');
  } else if (langCode === 'pt') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bNISH\b/g, 'Niche')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bEAPV\b/g, 'E. A. P. V.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly');
  } else if (langCode === 'sw') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bNISH\b/g, 'Nish')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bEPI\b/g, 'E. P. I.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly');
  }
  return processed;
}

/**
 * Splits long run-on sentences and paragraphs into coherent speech chunks (maximum ~140 characters).
 * Preserves sentence integrity so fast and continuous speakers are heard without truncation.
 */
function chunkTextForSpeech(text: string, maxLen = 140): string[] {
  // First split by natural sentence boundaries
  const rawSentences = text.match(/[^.!?;\n]+[.!?;\n]+|[^.!?;\n]+$/g) || [text];
  const chunks: string[] = [];

  for (let s of rawSentences) {
    s = s.trim();
    if (!s) continue;

    if (s.length <= maxLen) {
      chunks.push(s);
    } else {
      // Split long clauses by words
      const words = s.split(' ');
      let current = '';
      for (const w of words) {
        if ((current + ' ' + w).trim().length <= maxLen) {
          current = (current + ' ' + w).trim();
        } else {
          if (current) chunks.push(current);
          current = w;
        }
      }
      if (current) chunks.push(current);
    }
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Finds the most suitable browser voice for a target language code.
 */
function getBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  if (cachedVoices.length === 0) {
    loadVoices();
  }
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const prefixMap: Record<string, string[]> = {
    fr: ['fr-SN', 'fr-CI', 'fr-CD', 'fr-CM', 'fr-FR', 'fr-BE', 'fr-CH', 'fr'],
    pt: ['pt-AO', 'pt-MZ', 'pt-PT', 'pt-CV', 'pt-GW', 'pt-ST', 'pt'],
    sw: ['sw-KE', 'sw-TZ', 'sw-UG', 'sw', 'bnt'],
    en: ['en-ZA', 'en-NG', 'en-KE', 'en-GB', 'en-US', 'en'],
  };

  const candidatePrefixes = prefixMap[langCode] || [langCode];

  // 1. Exact match on language tag
  for (const prefix of candidatePrefixes) {
    const exact = voices.find((v) => v.lang.toLowerCase() === prefix.toLowerCase());
    if (exact) return exact;
  }

  // 2. Prefix match on language tag (excluding pt-BR when looking for African/European Portuguese)
  for (const prefix of candidatePrefixes) {
    const partial = voices.find((v) => {
      const vLang = v.lang.toLowerCase();
      if (langCode === 'pt' && (vLang === 'pt-br' || vLang.startsWith('pt-br'))) {
        return false;
      }
      return vLang.startsWith(prefix.toLowerCase());
    });
    if (partial) return partial;
  }

  // 3. Name match on voice name
  const nameKeywords: Record<string, string[]> = {
    fr: ['african french', 'français', 'french', 'hortense', 'julie', 'paul'],
    pt: ['portugal', 'português (portugal)', 'angola', 'moçambique', 'portuguese (portugal)', 'helia', 'raquel', 'duarte'],
    sw: ['swahili', 'kiswahili', 'kenya', 'tanzania', 'zuri', 'rafiki'],
    en: ['south africa', 'nigeria', 'kenya', 'english (south africa)', 'english (united kingdom)', 'david', 'zira', 'mark'],
  };

  const keywords = nameKeywords[langCode] || [];
  for (const kw of keywords) {
    const match = voices.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  if (langCode === 'pt') {
    const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (anyPt) return anyPt;
  }

  return null;
}

/**
 * Plays a single speech chunk via Neural Audio Stream or SpeechSynthesis.
 */
function playAudioChunk(chunk: string, langCode: string, playbackRate: number): Promise<void> {
  return new Promise((resolve) => {
    const ttsLangMap: Record<string, string> = {
      sw: 'sw', // Authentic East African Kiswahili neural voice
      fr: 'fr', // French neural voice
      pt: 'pt', // Portuguese neural voice
      en: 'en', // English voice
    };

    const ttsLang = ttsLangMap[langCode] || langCode;
    const query = encodeURIComponent(chunk);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${query}`;

    const audio = new Audio(url);
    currentAudioElement = audio;
    audio.playbackRate = playbackRate;

    let hasResolved = false;
    const finish = () => {
      if (!hasResolved) {
        hasResolved = true;
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        resolve();
      }
    };

    audio.onended = finish;

    audio.onerror = () => {
      // Fallback to SpeechSynthesis if audio stream encounters an issue
      fallbackSpeechSynthesis(chunk, langCode, playbackRate).then(finish);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        fallbackSpeechSynthesis(chunk, langCode, playbackRate).then(finish);
      });
    }
  });
}

/**
 * Fallback SpeechSynthesis player for offline or blocked environments.
 */
function fallbackSpeechSynthesis(text: string, langCode: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getBestVoiceForLanguage(langCode);
    if (voice) {
      utterance.voice = voice;
    }

    const langMap: Record<string, string> = {
      fr: 'fr-FR',
      pt: 'pt-PT',
      sw: 'sw-KE',
      en: 'en-ZA',
    };
    utterance.lang = langMap[langCode] || langCode;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Continuous FIFO Queue Worker:
 * Processes queued sentences sequentially without dropping or interrupting earlier statements.
 * Dynamically adjusts cadence rate to catch up if a fast speaker generates a backlog.
 */
async function processAudioQueue(): Promise<void> {
  if (isProcessingQueue) return;
  if (audioQueue.length === 0) return;

  isProcessingQueue = true;

  while (audioQueue.length > 0) {
    const item = audioQueue.shift();
    if (!item) break;

    // Adaptive cadence calculation:
    // If the speaker spoke fast and there are pending sentences waiting,
    // increase the rate slightly (from 0.95 up to 1.18) so the listener catches up smoothly.
    const backlog = audioQueue.length;
    let rate = 0.95;
    if (backlog === 1) {
      rate = 1.08;
    } else if (backlog >= 2) {
      rate = 1.18;
    }

    await playAudioChunk(item.text, item.langCode, rate);
  }

  isProcessingQueue = false;
}

/**
 * Creates an instance of the continuous speech synthesis audio controller.
 */
export function createSpeechSynthesisController(): SpeechSynthesisController {
  const isSupported = typeof window !== 'undefined' && ('Audio' in window || 'speechSynthesis' in window);

  return {
    speak(text: string, langCode: string): void {
      const clean = cleanTextForSpeech(text);
      if (!clean) return;

      const prepared = prepareAcronymsForSpeech(clean, langCode);
      const chunks = chunkTextForSpeech(prepared);

      // Enqueue all sentence chunks sequentially (FIFO)
      for (const chunk of chunks) {
        audioQueue.push({ text: chunk, langCode });
      }

      // Start queue worker if not already running
      processAudioQueue();
    },

    stop(): void {
      // Clear pending queue
      audioQueue.length = 0;
      isProcessingQueue = false;

      // Stop current active audio stream
      if (currentAudioElement) {
        currentAudioElement.pause();
        currentAudioElement.currentTime = 0;
        currentAudioElement = null;
      }

      // Cancel Web SpeechSynthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },

    isSpeaking(): boolean {
      if (isProcessingQueue || audioQueue.length > 0) return true;
      if (currentAudioElement && !currentAudioElement.paused) return true;
      if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) return true;
      return false;
    },

    isSupported(): boolean {
      return isSupported;
    },
  };
}
