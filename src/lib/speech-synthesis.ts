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

let activeUtterance: SpeechSynthesisUtterance | null = null;

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

  const voices = window.speechSynthesis.getVoices();
  const prefixMap: Record<string, string[]> = {
    fr: ['fr-FR', 'fr-CA', 'fr'],
    pt: ['pt-PT', 'pt-BR', 'pt'],
    sw: ['sw-KE', 'sw-TZ', 'sw'],
    en: ['en-US', 'en-GB', 'en-ZA', 'en'],
  };

  const candidatePrefixes = prefixMap[langCode] || [langCode];

  for (const prefix of candidatePrefixes) {
    const exact = voices.find((v) => v.lang.toLowerCase() === prefix.toLowerCase());
    if (exact) return exact;
  }

  for (const prefix of candidatePrefixes) {
    const partial = voices.find((v) => v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
    if (partial) return partial;
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

      // Cancel previous utterance to avoid latency lag during fast speech
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

      activeUtterance = utterance;
      utterance.onend = () => {
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
      };
      utterance.onerror = () => {
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
      };

      window.speechSynthesis.speak(utterance);
    },

    stop(): void {
      if (!isSupported) return;
      window.speechSynthesis.cancel();
      activeUtterance = null;
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
