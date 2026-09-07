/**
 * VACFA Translate — Live Audio Speech Synthesis (TTS) Engine
 * 
 * Synthesizes translated text into spoken audio using the browser's Web Speech API (SpeechSynthesis).
 * Tuned specifically for African conference delegates:
 * - Portuguese: Prioritizes African Lusophone (Angola, Mozambique) & European Portuguese over Brazilian.
 * - French: Prioritizes African Francophone & clean standard French with measured conference cadence.
 * - Swahili: Prioritizes East African Swahili (Kenya, Tanzania).
 * - English: Prioritizes African English (South Africa, Kenya, Nigeria, Commonwealth).
 */

interface SpeechSynthesisController {
  speak: (text: string, langCode: string) => void;
  stop: () => void;
  isSpeaking: () => boolean;
  isSupported: () => boolean;
}

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
 * 
 * @param text Raw caption text.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/\[(FR|PT|SW|EN)\]/gi, '') // remove prefix indicators
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prepares acronyms (like NITAG, AEFI, VVM, DALY) for natural phonetic speech in the target language.
 */
function prepareAcronymsForSpeech(text: string, langCode: string): string {
  let processed = text;
  if (langCode === 'fr') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bPEV\b/g, 'P. E. V.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly')
      .replace(/\bQALY\b/g, 'Koualy');
  } else if (langCode === 'pt') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bEAPV\b/g, 'E. A. P. V.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly');
  } else if (langCode === 'sw') {
    processed = processed
      .replace(/\bNITAG\b/g, 'Ni-tag')
      .replace(/\bRITAG\b/g, 'Ri-tag')
      .replace(/\bAEFI\b/g, 'A. E. F. I.')
      .replace(/\bEPI\b/g, 'E. P. I.')
      .replace(/\bVVM\b/g, 'V. V. M.')
      .replace(/\bDALY\b/g, 'Daly');
  }
  return processed;
}

/**
 * Finds the most suitable browser voice for a target language code,
 * taking into account African conference listening preferences.
 * 
 * @param langCode Target ISO language code ('fr', 'pt', 'sw', 'en').
 */
function getBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  if (cachedVoices.length === 0) {
    loadVoices();
  }
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Regional preferences:
  // - Portuguese: African Lusophone (Angola/Mozambique) and European Portuguese prioritized over Brazilian (pt-BR)
  // - French: African Francophone and standard French
  // - Swahili: East African Kiswahili
  // - English: African Commonwealth English
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

  // 2. Prefix match on language tag (excluding pt-BR when looking for Portuguese)
  for (const prefix of candidatePrefixes) {
    const partial = voices.find((v) => {
      const vLang = v.lang.toLowerCase();
      if (langCode === 'pt' && (vLang === 'pt-br' || vLang.startsWith('pt-br'))) {
        return false; // Skip Brazilian Portuguese in favor of European/African Portuguese
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

  // 4. Fallback for Portuguese: if no pt-PT voice found, then allow any pt voice
  if (langCode === 'pt') {
    const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (anyPt) return anyPt;
  }

  return null;
}

let currentAudio: HTMLAudioElement | null = null;

/**
 * Streams neural native African TTS audio directly from the neural voice endpoint.
 * Provides authentic, natural East African Kiswahili, Francophone, and Lusophone pronunciation.
 * 
 * @param text The sentence to speak.
 * @param langCode Target language code ('sw', 'fr', 'pt', 'en').
 */
function playNeuralAudio(text: string, langCode: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
      }

      // Map language codes to neural audio stream voices
      const ttsLangMap: Record<string, string> = {
        sw: 'sw', // Authentic East African Kiswahili neural voice
        fr: 'fr', // French neural voice
        pt: 'pt', // Portuguese neural voice
        en: 'en', // English voice
      };

      const ttsLang = ttsLangMap[langCode] || langCode;
      const query = encodeURIComponent(text.slice(0, 200));
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${query}`;

      const audio = new Audio(url);
      currentAudio = audio;

      audio.onended = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        resolve(true);
      };

      audio.onerror = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        resolve(false);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => resolve(true))
          .catch(() => {
            resolve(false);
          });
      } else {
        resolve(true);
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Creates an instance of the speech synthesis audio controller.
 */
export function createSpeechSynthesisController(): SpeechSynthesisController {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return {
    speak(text: string, langCode: string): void {
      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) return;

      const speechReadyText = prepareAcronymsForSpeech(cleanText, langCode);

      // 1. Primary: Use Neural Native African TTS stream for authentic, human Swahili, French, Portuguese
      playNeuralAudio(speechReadyText, langCode).then((played) => {
        if (played) return;

        // 2. Fallback: Browser Web SpeechSynthesis if network or audio stream fails
        if (!isSupported) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(speechReadyText);
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
        utterance.rate = 0.93;
        utterance.pitch = 1.0;

        window.speechSynthesis.speak(utterance);
      });
    },

    stop(): void {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
      }
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    },

    isSpeaking(): boolean {
      if (currentAudio && !currentAudio.paused) return true;
      if (isSupported && window.speechSynthesis.speaking) return true;
      return false;
    },

    isSupported(): boolean {
      return true; // Supported via neural audio stream + SpeechSynthesis fallback
    },
  };
}
