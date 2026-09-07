/**
 * VACFA Translate — Live Audio Speech Synthesis (TTS) Engine
 * 
 * Synthesizes translated text into spoken audio using the browser's Web Speech API (SpeechSynthesis).
 * Enables delegates to hear real-time interpretations in French, Portuguese, Swahili, or English.
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
 * Finds the most suitable browser voice for a target language code.
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

  const prefixMap: Record<string, string[]> = {
    fr: ['fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'fr'],
    pt: ['pt-PT', 'pt-BR', 'pt'],
    sw: ['sw-KE', 'sw-TZ', 'sw', 'bnt'],
    en: ['en-US', 'en-GB', 'en-ZA', 'en-AU', 'en'],
  };

  const candidatePrefixes = prefixMap[langCode] || [langCode];

  // 1. Exact match on language tag
  for (const prefix of candidatePrefixes) {
    const exact = voices.find((v) => v.lang.toLowerCase() === prefix.toLowerCase());
    if (exact) return exact;
  }

  // 2. Prefix match on language tag
  for (const prefix of candidatePrefixes) {
    const partial = voices.find((v) => v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
    if (partial) return partial;
  }

  // 3. Name match on voice name (e.g. "French", "Français", "Portuguese", "Português", "Swahili", "Kiswahili")
  const nameKeywords: Record<string, string[]> = {
    fr: ['french', 'français', 'hortense', 'julie'],
    pt: ['portuguese', 'português', 'maria', 'helia'],
    sw: ['swahili', 'kiswahili'],
    en: ['english', 'david', 'zira', 'mark', 'george'],
  };

  const keywords = nameKeywords[langCode] || [];
  for (const kw of keywords) {
    const match = voices.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  return null;
}

/**
 * Creates an instance of the speech synthesis audio controller.
 */
export function createSpeechSynthesisController(): SpeechSynthesisController {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return {
    speak(text: string, langCode: string): void {
      if (!isSupported) return;

      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) return;

      // Cancel previous utterance to prevent queue pile-up during real-time speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voice = getBestVoiceForLanguage(langCode);
      if (voice) {
        utterance.voice = voice;
      }

      const langMap: Record<string, string> = {
        fr: 'fr-FR',
        pt: 'pt-PT',
        sw: 'sw-KE',
        en: 'en-US',
      };
      utterance.lang = langMap[langCode] || langCode;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    },

    stop(): void {
      if (!isSupported) return;
      window.speechSynthesis.cancel();
    },

    isSpeaking(): boolean {
      if (!isSupported) return false;
      return window.speechSynthesis.speaking;
    },

    isSupported(): boolean {
      return isSupported;
    },
  };
}
