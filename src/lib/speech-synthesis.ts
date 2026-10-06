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
let queueGeneration = 0;
let activeChunkResolver: (() => void) | null = null;

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
 * Strips bracket indicators, glossary markers, vocal fillers, and HTML tags from text for clean TTS pronunciation.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/\[(FR|PT|SW|EN)\]/gi, '') // remove prefix indicators
    .replace(/^(um|uh|uhm|ah|er|hmm)[,\s]+/i, '') // strip leading hesitation
    .replace(/[,\s]+(um|uh|uhm|ah|er|hmm)$/i, '') // strip trailing hesitation
    .replace(/,\s*(um|uh|uhm|er|hmm)\s*,/gi, ',') // strip inline hesitation
    .replace(/\b([A-Za-z]+)\s+\1\b/gi, '$1') // de-duplicate stuttered words
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
 * Finds the most suitable native African browser voice for a target language code.
 * Strictly avoids western/American voice assignments (e.g. Microsoft David) for African languages.
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
    en: ['en-ZA', 'en-NG', 'en-KE', 'en-GH', 'en-UG', 'en-TZ', 'en-GB'],
  };

  const candidatePrefixes = prefixMap[langCode] || [langCode];

  // 1. Exact match on language tag
  for (const prefix of candidatePrefixes) {
    const exact = voices.find((v) => v.lang.toLowerCase() === prefix.toLowerCase());
    if (exact) return exact;
  }

  // 2. Prefix match on language tag (strictly excluding pt-BR for Portuguese and en-US for African English)
  for (const prefix of candidatePrefixes) {
    const partial = voices.find((v) => {
      const vLang = v.lang.toLowerCase();
      if (langCode === 'pt' && (vLang === 'pt-br' || vLang.startsWith('pt-br'))) {
        return false;
      }
      if (langCode === 'en' && (vLang === 'en-us' || vLang.startsWith('en-us'))) {
        return false;
      }
      return vLang.startsWith(prefix.toLowerCase());
    });
    if (partial) return partial;
  }

  // 3. Name match on voice name (prioritizing authentic African neural & regional speaker models)
  const nameKeywords: Record<string, string[]> = {
    fr: ['côte d\'ivoire', 'cameroun', 'cameroon', 'senegal', 'sénégal', 'congo', 'african french', 'maurice', 'henri', 'français', 'french'],
    pt: ['angola', 'moçambique', 'mozambique', 'portugal', 'português (portugal)', 'celeste', 'helia', 'raquel', 'duarte'],
    sw: ['swahili', 'kiswahili', 'kenya', 'tanzania', 'asad', 'rehema', 'asilia', 'daudi', 'zuri', 'rafiki'],
    en: ['south africa', 'nigeria', 'kenya', 'ghana', 'english (south africa)', 'leah', 'luke', 'ezinne', 'abeo', 'chilufya'],
  };

  const keywords = nameKeywords[langCode] || [];
  for (const kw of keywords) {
    const match = voices.find((v) => {
      const vName = v.name.toLowerCase();
      const vLang = v.lang.toLowerCase();
      if (langCode === 'pt' && (vLang.startsWith('pt-br') || vName.includes('brasil') || vName.includes('brazil'))) {
        return false;
      }
      if (langCode === 'en' && (vLang.startsWith('en-us') || vName.includes('united states') || vName.includes('david') || vName.includes('mark') || vName.includes('zira'))) {
        return false;
      }
      return vName.includes(kw);
    });
    if (match) return match;
  }

  // 4. CRITICAL: Language-Specific African Voice Fallback
  if (langCode === 'sw') {
    // If no native Swahili voice pack is installed in the client browser:
    // DO NOT allow the browser to fall back to an American English voice (Microsoft David) which butchers Swahili.
    // Instead, select an African English voice (South African, Nigerian, Kenyan) or an African Romance voice
    // that naturally possesses open vowel cadence and authentic African syllable timing:
    const africanVoice = voices.find((v) => {
      const vl = v.lang.toLowerCase();
      const vn = v.name.toLowerCase();
      return (
        vl.startsWith('en-za') ||
        vl.startsWith('en-ng') ||
        vl.startsWith('en-ke') ||
        vl.startsWith('fr-sn') ||
        vl.startsWith('fr-ci') ||
        vl.startsWith('pt-ao') ||
        vn.includes('south africa') ||
        vn.includes('nigeria') ||
        vn.includes('kenya') ||
        vn.includes('leah') ||
        vn.includes('ezinne') ||
        vn.includes('abeo')
      );
    });
    if (africanVoice) return africanVoice;

    // Secondary fallback: Clean acoustic vowel voice (Portuguese Portugal, Italian, or Spanish)
    const pureAcousticVoice = voices.find((v) => {
      const vl = v.lang.toLowerCase();
      return (vl.startsWith('pt-pt') || vl.startsWith('it') || vl.startsWith('es')) && !vl.startsWith('pt-br');
    });
    if (pureAcousticVoice) return pureAcousticVoice;
  }

  if (langCode === 'en') {
    // If no African English voice is found, prefer Commonwealth British English (non-rhotic) over US American
    const commonwealthVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en-gb'));
    if (commonwealthVoice) return commonwealthVoice;
  }

  if (langCode === 'pt') {
    const anyPtNonBr = voices.find((v) => {
      const vl = v.lang.toLowerCase();
      return vl.startsWith('pt') && !vl.startsWith('pt-br');
    });
    if (anyPtNonBr) return anyPtNonBr;
  }

  return null;
}

let persistentAudio: HTMLAudioElement | null = null;

/**
 * Unlocks browser audio autoplay when the user interacts with the page (e.g. clicks Listen Live or Unmute).
 */
export function unlockAudioPlayback(): void {
  if (typeof window === 'undefined') return;
  if (!persistentAudio) {
    persistentAudio = new Audio();
    persistentAudio.preload = 'auto';
  }
  // Play 1ms silent audio to unlock autoplay permissions in modern browsers
  persistentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  persistentAudio.play().catch(() => {});
}

/**
 * Plays a single speech chunk via Neural Audio Stream or SpeechSynthesis.
 * Guaranteed to execute fallback at most once, eliminating duplicate audio playback.
 */
function playAudioChunk(
  chunk: string,
  langCode: string,
  playbackRate: number,
  expectedGen: number
): Promise<void> {
  return new Promise((resolve) => {
    // If stop() or channel switch occurred before this chunk started, abort immediately
    if (queueGeneration !== expectedGen) {
      resolve();
      return;
    }

    let isDone = false;
    const finish = () => {
      if (!isDone) {
        isDone = true;
        activeChunkResolver = null;
        resolve();
      }
    };

    activeChunkResolver = finish;

    let fallbackInvoked = false;
    const invokeFallbackOnce = () => {
      if (isDone || fallbackInvoked || queueGeneration !== expectedGen) return;
      fallbackInvoked = true;
      fallbackSpeechSynthesis(chunk, langCode, playbackRate, expectedGen).then(finish);
    };

    const startStreamingAudio = () => {
      if (isDone || queueGeneration !== expectedGen) return;

      const ttsLangMap: Record<string, string> = {
        sw: 'sw', // Authentic East African Kiswahili neural voice
        fr: 'fr', // French neural voice
        pt: 'pt-PT', // African Lusophone (Angola, Mozambique) / European Portuguese (NOT Brazilian)
        en: 'en', // English voice
      };

      const ttsLang = ttsLangMap[langCode] || langCode;
      const query = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${query}`;

      if (!persistentAudio) {
        persistentAudio = new Audio();
      }

      const audio = persistentAudio;
      currentAudioElement = audio;
      audio.playbackRate = playbackRate;

      audio.onended = () => {
        if (!fallbackInvoked) {
          finish();
        }
      };

      audio.onerror = () => {
        // Audio stream failed (e.g. CORS/network limit) -> trigger fallback ONCE
        invokeFallbackOnce();
      };

      audio.src = url;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // If aborted because stop() or pause() was called, do NOT execute fallback!
          if (err?.name === 'AbortError' || queueGeneration !== expectedGen) {
            finish();
            return;
          }
          invokeFallbackOnce();
        });
      }
    };

    // Stream authentic neural audio directly for Swahili, French, Portuguese, and English
    startStreamingAudio();
  });
}

/**
 * Fallback SpeechSynthesis player for offline or blocked environments.
 * Uses expectedGen check and cancels any pending browser utterances before speaking.
 */
function fallbackSpeechSynthesis(
  text: string,
  langCode: string,
  rate: number,
  expectedGen: number
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    if (queueGeneration !== expectedGen) {
      resolve();
      return;
    }

    // Cancel any previous hung or running browser utterance before speaking new chunk
    window.speechSynthesis.cancel();

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
    // For Swahili speech cadence: musical baseline (0.95), scales up to 1.22 when catching up on backlog
    if (langCode === 'sw') {
      utterance.rate = Math.min(rate, 1.22);
    } else {
      utterance.rate = rate;
    }
    utterance.pitch = 1.0;

    let isDone = false;
    const finish = () => {
      if (!isDone) {
        isDone = true;
        resolve();
      }
    };

    // Safety timeout in case speechSynthesis.speak gets stuck (known browser bug where onend doesn't fire)
    const timeout = setTimeout(finish, 10000);

    utterance.onend = () => {
      clearTimeout(timeout);
      finish();
    };
    utterance.onerror = () => {
      clearTimeout(timeout);
      finish();
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Continuous Zero-Drop FIFO Queue Worker:
 * Processes queued sentences sequentially without dropping or interrupting earlier statements.
 * Dynamically scales playback rate (1.0x -> 1.35x) to catch up smoothly when a fast speaker generates a backlog.
 */
async function processAudioQueue(): Promise<void> {
  if (isProcessingQueue) return;
  if (audioQueue.length === 0) return;

  isProcessingQueue = true;
  const thisGen = queueGeneration;

  while (audioQueue.length > 0 && queueGeneration === thisGen) {
    const item = audioQueue.shift();
    if (!item) break;

    // Adaptive cadence calculation (Zero-drop catch-up):
    // Preserves 100% of technical and medical sentences while speeding up playback when queued
    const backlog = audioQueue.length;
    let rate = 1.0;
    if (backlog === 1) {
      rate = 1.14; // brisk interpretation pace
    } else if (backlog === 2) {
      rate = 1.25; // accelerated catch-up pace
    } else if (backlog >= 3) {
      rate = 1.35; // maximum clean neural catch-up pace
    }

    await playAudioChunk(item.text, item.langCode, rate, thisGen);
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
      // Invalidate in-flight and pending queue generation
      queueGeneration++;

      // Clear pending queue
      audioQueue.length = 0;
      isProcessingQueue = false;

      // Abort active chunk promise immediately if one is awaiting
      if (activeChunkResolver) {
        activeChunkResolver();
        activeChunkResolver = null;
      }

      // Stop current active audio stream
      if (currentAudioElement) {
        currentAudioElement.pause();
        currentAudioElement.removeAttribute('src');
        currentAudioElement.load();
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
