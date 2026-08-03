'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createCaptionSimulator } from '@/lib/caption-simulator';
import type { CaptionEntry } from '@/lib/types';

export function useCaptionSimulator(initialLang = 'en') {
  const [currentText, setCurrentText] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [isLive, setIsLive] = useState(false);

  const simulatorRef = useRef<ReturnType<typeof createCaptionSimulator> | null>(null);

  useEffect(() => {
    simulatorRef.current = createCaptionSimulator(
      {
        onWordTyped: (text) => setCurrentText(text),
        onCaptionComplete: (caption) => {
          setCaptions((prev) => [...prev.slice(-4), caption]);
          setCurrentText('');
        },
        onSpeakerChange: (newSpeaker) => setSpeaker(newSpeaker),
      },
      { initialLang, wordDelay: 350, captionPause: 2500, speakerChangePause: 3500 }
    );

    return () => {
      simulatorRef.current?.reset();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (simulatorRef.current) {
      simulatorRef.current.setLanguage(initialLang);
    }
  }, [initialLang]);

  const start = useCallback(() => {
    setIsLive(true);
    simulatorRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    setIsLive(false);
    simulatorRef.current?.pause();
  }, []);

  return { currentText, speaker, captions, isLive, start, stop };
}
