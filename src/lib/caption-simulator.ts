/**
 * VACFA Translate — Caption Simulator
 * 
 * Simulates real-time caption typing for the live session demo.
 * Types out captions word-by-word with realistic timing,
 * highlights glossary terms, and simulates speaker changes.
 */

import { DEMO_CAPTIONS, GLOSSARY_TERMS } from './demo-data';
import type { CaptionEntry } from './types';

/** Configuration for caption simulation timing */
interface SimulatorConfig {
  /** Milliseconds between words (base) */
  wordDelay: number;
  /** Milliseconds pause between captions */
  captionPause: number;
  /** Milliseconds pause on speaker change */
  speakerChangePause: number;
  /** Whether to loop back to start */
  loop: boolean;
  /** Initial language */
  initialLang?: string;
}

const DEFAULT_CONFIG: SimulatorConfig = {
  wordDelay: 200,
  captionPause: 2500,
  speakerChangePause: 3500,
  loop: true,
  initialLang: 'en',
};

/** Callback types for simulator events */
interface SimulatorCallbacks {
  /** Called as each word is typed */
  onWordTyped: (partialText: string, captionIndex: number) => void;
  /** Called when a full caption is complete */
  onCaptionComplete: (caption: CaptionEntry, index: number) => void;
  /** Called when the speaker changes */
  onSpeakerChange: (speaker: string) => void;
  /** Called when a glossary term is typed */
  onGlossaryTermDetected: (term: string) => void;
}

/**
 * Creates a caption simulator that types out demo captions word by word.
 * Returns start/stop/reset/setLanguage controls.
 */
export function createCaptionSimulator(
  callbacks: Partial<SimulatorCallbacks>,
  config: Partial<SimulatorConfig> = {}
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let isRunning = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let currentCaptionIndex = 0;
  let currentWordIndex = 0;
  let lastSpeaker = '';
  let activeLang = cfg.initialLang || 'en';

  const glossaryTermSet = new Set(
    GLOSSARY_TERMS.map((t) => t.term.toLowerCase())
  );

  /**
   * Checks if the text typed so far contains any glossary term
   */
  function checkForGlossaryTerms(text: string): void {
    const lower = text.toLowerCase();
    for (const term of glossaryTermSet) {
      if (lower.includes(term)) {
        callbacks.onGlossaryTermDetected?.(term);
      }
    }
  }

  /**
   * Types the next word in the current caption
   */
  function typeNextWord(): void {
    if (!isRunning) return;

    const caption = DEMO_CAPTIONS[currentCaptionIndex];
    if (!caption) {
      if (cfg.loop) {
        currentCaptionIndex = 0;
        currentWordIndex = 0;
        lastSpeaker = '';
        typeNextWord();
      }
      return;
    }

    // Handle speaker change
    if (caption.speaker !== lastSpeaker) {
      lastSpeaker = caption.speaker;
      callbacks.onSpeakerChange?.(caption.speaker);
    }

    // Determine text to type based on active language
    let textToType = caption.originalText; // default to English
    if (activeLang === 'fr') textToType = caption.translatedText;
    if (activeLang === 'pt' && caption.translatedPt) textToType = caption.translatedPt;
    // For other languages, simulate by mangling the original text slightly to look different
    if (activeLang !== 'en' && activeLang !== 'fr' && activeLang !== 'pt') {
      textToType = caption.originalText.split(' ').map(w => w + (activeLang === 'sw' ? 'a' : 'i')).join(' ');
    }

    const words = textToType.split(' ');

    if (currentWordIndex < words.length) {
      const partialText = words.slice(0, currentWordIndex + 1).join(' ');
      callbacks.onWordTyped?.(partialText, currentCaptionIndex);
      checkForGlossaryTerms(partialText);
      currentWordIndex++;

      // Add slight randomness to typing speed for realism
      const jitter = Math.random() * 60 - 30;
      timeoutId = setTimeout(typeNextWord, cfg.wordDelay + jitter);
    } else {
      // Caption complete
      callbacks.onCaptionComplete?.(caption, currentCaptionIndex);
      currentCaptionIndex++;
      currentWordIndex = 0;

      // Determine pause duration
      const nextCaption = DEMO_CAPTIONS[currentCaptionIndex];
      const pause =
        nextCaption && nextCaption.speaker !== caption.speaker
          ? cfg.speakerChangePause
          : cfg.captionPause;

      timeoutId = setTimeout(typeNextWord, pause);
    }
  }

  return {
    /** Start the caption simulation */
    start() {
      if (isRunning) return;
      isRunning = true;
      typeNextWord();
    },

    /** Pause the simulation */
    pause() {
      isRunning = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },

    /** Stop and reset to the beginning */
    reset() {
      isRunning = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      currentCaptionIndex = 0;
      currentWordIndex = 0;
      lastSpeaker = '';
    },

    /** Get current state */
    getState() {
      return {
        isRunning,
        captionIndex: currentCaptionIndex,
        wordIndex: currentWordIndex,
        totalCaptions: DEMO_CAPTIONS.length,
        activeLang,
      };
    },

    /** Set the language to simulate typing for */
    setLanguage(lang: string) {
      if (activeLang !== lang) {
        activeLang = lang;
        // Reset current word index to restart typing the current caption in the new language
        currentWordIndex = 0;
      }
    }
  };
}

/**
 * Highlights glossary terms in a text string by wrapping them in spans.
 * Returns an array of segments: { text, isGlossary, term? }
 */
export function segmentTextWithGlossary(
  text: string
): Array<{ text: string; isGlossary: boolean; term?: string }> {
  const segments: Array<{ text: string; isGlossary: boolean; term?: string }> = [];
  const lowerText = text.toLowerCase();

  // Sort terms by length (longest first) to match greedily
  const sortedTerms = GLOSSARY_TERMS
    .map((t) => t.term)
    .sort((a, b) => b.length - a.length);

  // Find all term positions
  const matches: Array<{ start: number; end: number; term: string }> = [];
  for (const term of sortedTerms) {
    let searchFrom = 0;
    const lowerTerm = term.toLowerCase();
    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(lowerTerm, searchFrom);
      if (idx === -1) break;
      // Check no overlap with existing matches
      const overlaps = matches.some(
        (m) => idx < m.end && idx + term.length > m.start
      );
      if (!overlaps) {
        matches.push({ start: idx, end: idx + term.length, term });
      }
      searchFrom = idx + 1;
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Build segments
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), isGlossary: false });
    }
    segments.push({
      text: text.slice(match.start, match.end),
      isGlossary: true,
      term: match.term,
    });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isGlossary: false });
  }

  return segments.length > 0 ? segments : [{ text, isGlossary: false }];
}

/**
 * Formats a timestamp string (HH:MM:SS) to elapsed duration from session start.
 */
export function formatElapsedTime(timestamp: string, startTime = '09:00:00'): string {
  const [startH, startM, startS] = startTime.split(':').map(Number);
  const [h, m, s] = timestamp.split(':').map(Number);

  const startTotalSec = startH * 3600 + startM * 60 + startS;
  const totalSec = h * 3600 + m * 60 + s;
  const elapsed = totalSec - startTotalSec;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
