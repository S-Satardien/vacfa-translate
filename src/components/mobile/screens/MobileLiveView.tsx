'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Globe, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import styles from './MobileLiveView.module.css';
import { useCaptionSimulator } from '../hooks/useCaptionSimulator';
import type { Language, CaptionEntry } from '@/lib/types';
import { createSpeechSynthesisController } from '@/lib/speech-synthesis';
import { subscribeToLiveSync, broadcastCaptionFinal, broadcastCaptionInterim, broadcastMicStatus, getActiveSessionGlossary } from '@/lib/live-sync';
import { createSpeechRecognitionController } from '@/lib/speech-recognition';
import { translateText } from '@/lib/gemini-translator';

/**
 * Props for MobileLiveView
 */
interface MobileLiveViewProps {
  language: Language;
  captionLanguage: Language;
  showCaptions: boolean;
  onChangeLanguage: () => void;
  onLeave: () => void;
  onToggleCaptions: () => void;
}

/**
 * The main live translation view for mobile
 */
export function MobileLiveView({ 
  language, 
  captionLanguage,
  showCaptions,
  onChangeLanguage, 
  onLeave,
  onToggleCaptions 
}: MobileLiveViewProps) {
  // Audio listening (TTS) state — muted by default per user specification
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const ttsRef = useRef<ReturnType<typeof createSpeechSynthesisController> | null>(null);

  // Presenter mic state for mobile
  const [isMobileMicActive, setIsMobileMicActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mobileRecognizerRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);

  // Real-time live captions from broadcast / mic
  const [liveCaptions, setLiveCaptions] = useState<CaptionEntry[]>([]);
  const [liveInterimText, setLiveInterimText] = useState('');
  const [liveSpeaker, setLiveSpeaker] = useState('');

  // Fallback simulator hook
  const { currentText: simText, speaker: simSpeaker, captions: simCaptions, start: startSim, stop: stopSim } = useCaptionSimulator(captionLanguage.code);
  const captionsEndRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Synthesis
  useEffect(() => {
    ttsRef.current = createSpeechSynthesisController();
    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  // Audio playback handler
  const playAudio = useCallback(
    (text: string) => {
      if (isAudioMuted || !ttsRef.current) return;
      ttsRef.current.speak(text, language.code);
    },
    [isAudioMuted, language.code]
  );

  // Subscribe to live cross-tab/device sync
  useEffect(() => {
    const unsubscribe = subscribeToLiveSync({
      onCaptionFinal: (caption) => {
        setLiveCaptions((prev) => [...prev, caption]);
        setLiveInterimText('');
        const textToSpeak = caption.translations?.[language.code] || caption.originalText;
        playAudio(textToSpeak);
      },
      onCaptionInterim: ({ speaker, text }) => {
        setLiveSpeaker(speaker);
        setLiveInterimText(text);
      },
      onMicStatus: ({ isLive, audioLevel: level, speaker }) => {
        setAudioLevel(isLive ? level : 0);
        if (isLive) setLiveSpeaker(speaker);
      },
    });

    return () => unsubscribe();
  }, [language.code, playAudio]);

  // Setup Mobile Speech Recognition for when user taps mic
  useEffect(() => {
    const controller = createSpeechRecognitionController({
      onInterimResult: (interim) => {
        setLiveInterimText(interim);
        setLiveSpeaker('Presenter (Mobile)');
        broadcastCaptionInterim('Presenter (Mobile)', interim);
      },
      onFinalResult: async (finalText) => {
        if (!finalText.trim()) return;
        setLiveInterimText('');
        const speakerName = 'Presenter (Mobile)';
        setLiveSpeaker(speakerName);

        const glossary = getActiveSessionGlossary();
        const res = await translateText(finalText, undefined, glossary);

        const newEntry: CaptionEntry = {
          id: `live-mobile-cap-${Date.now()}`,
          speaker: speakerName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          originalText: res.originalText,
          translations: res.translations,
          glossaryTerms: res.glossaryTerms,
        };

        setLiveCaptions((prev) => [...prev, newEntry]);
        broadcastCaptionFinal(newEntry);
        playAudio(newEntry.translations[language.code] || newEntry.originalText);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
        broadcastMicStatus(true, 'Presenter (Mobile)', level);
      },
      onStateChange: (listening) => {
        setIsMobileMicActive(listening);
        if (!listening) {
          setAudioLevel(0);
          broadcastMicStatus(false, '', 0);
        }
      },
    });

    mobileRecognizerRef.current = controller;

    return () => {
      controller.stop();
    };
  }, [language.code, playAudio]);

  // Simulator lifecycle: run only when no live captions and no mic active
  useEffect(() => {
    if (isMobileMicActive || liveCaptions.length > 0) {
      stopSim();
      return;
    }
    startSim();
    return () => stopSim();
  }, [isMobileMicActive, liveCaptions.length, startSim, stopSim]);

  // Auto-scroll captions
  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simText, simCaptions, liveCaptions, liveInterimText]);

  // Toggle mobile mic
  const toggleMobileMic = async () => {
    if (isMobileMicActive) {
      mobileRecognizerRef.current?.stop();
    } else {
      stopSim();
      await mobileRecognizerRef.current?.start();
    }
  };

  // Determine active captions list
  const displayCaptions = liveCaptions.length > 0 ? liveCaptions : simCaptions;
  const activeCurrentText = liveInterimText || simText;
  const activeSpeaker = liveSpeaker || simSpeaker;

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <header className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className={styles.liveIndicator}>
            <motion.div 
              className={styles.liveDot}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className={styles.liveText}>LIVE</span>
          </div>

          <button
            onClick={toggleMobileMic}
            title={isMobileMicActive ? 'Stop Mic' : 'Speak into Mobile Mic'}
            style={{
              background: isMobileMicActive ? 'var(--vacfa-red)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${isMobileMicActive ? 'var(--vacfa-red)' : 'rgba(255,255,255,0.15)'}`,
              color: 'white',
              borderRadius: '999px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
            }}
          >
            {isMobileMicActive ? <Mic size={13} className="animate-pulse" /> : <MicOff size={13} />}
            <span>{isMobileMicActive ? 'Mic ON' : 'Mic'}</span>
          </button>
        </div>
        
        <button 
          onClick={onLeave}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--vacfa-red)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          Leave
        </button>
      </header>

      {/* Waveform visualizer */}
      <div className={styles.waveformContainer}>
        <div className={styles.waveform}>
          {[...Array(12)].map((_, i) => {
            const dynamicHeight = isMobileMicActive
              ? Math.max(15, audioLevel * 100 * (1 - Math.abs(6 - i) * 0.1))
              : 20;

            return (
              <motion.div
                key={i}
                className={styles.bar}
                animate={{
                  height: isMobileMicActive
                    ? `${dynamicHeight}%`
                    : ['20%', '80%', '40%', '100%', '30%'],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  delay: i * 0.1,
                  ease: 'easeInOut',
                }}
                style={{ height: '20px' }}
              />
            );
          })}
        </div>
      </div>

      <div className={styles.captionsArea}>
        {showCaptions ? (
          <>
            {displayCaptions.map((cap, i) => (
              <div key={i} className={styles.captionItem}>
                <span className={styles.speakerName}>{cap.speaker}</span>
                <p className={styles.captionText}>
                  {cap.translations?.[captionLanguage.code] || cap.originalText}
                </p>
              </div>
            ))}
            
            {(activeCurrentText || activeSpeaker) && (
              <div className={`${styles.captionItem} ${styles.currentCaptionItem}`}>
                <span className={styles.speakerName}>{activeSpeaker || 'Speaking...'}</span>
                <p className={styles.currentText}>
                  {activeCurrentText}
                  <span className="animate-pulse">_</span>
                </p>
              </div>
            )}
            <div ref={captionsEndRef} />
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--grey-400)' }}>
            Captions are turned off
          </div>
        )}
      </div>

      <div className={styles.bottomBar} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem' }}>
        {/* Audio Language & Listening Playback */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <Globe size={18} color="var(--vacfa-red-light)" />
             <span style={{ fontSize: '1rem', color: 'var(--cream)', fontWeight: 500 }}>Audio</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Audio Listen Toggle */}
            <button
              onClick={() => {
                const next = !isAudioMuted;
                setIsAudioMuted(next);
                if (next) {
                  ttsRef.current?.stop();
                } else if (displayCaptions.length > 0) {
                  const last = displayCaptions[displayCaptions.length - 1];
                  playAudio(last.translations?.[language.code] || last.originalText);
                }
              }}
              style={{
                background: isAudioMuted ? 'transparent' : 'rgba(76, 175, 80, 0.2)',
                border: isAudioMuted ? '1px solid var(--grey-700)' : '1px solid var(--success)',
                color: isAudioMuted ? 'var(--grey-400)' : 'var(--success)',
                borderRadius: '8px',
                padding: '0.5rem 0.65rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
              title={isAudioMuted ? 'Tap to listen aloud' : 'Audio is unmuted'}
            >
              {isAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="animate-pulse" />}
              <span>{isAudioMuted ? 'Muted' : 'Live'}</span>
            </button>

            <button 
              onClick={onChangeLanguage}
              style={{ 
                backgroundColor: 'var(--surface-primary)', 
                padding: '0.5rem 1rem', 
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--white)',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}
            >
              {language.nativeName}
            </button>
          </div>
        </div>

        {/* Captions Toggle & Language */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <span style={{ fontSize: '1rem', color: 'var(--cream)', fontWeight: 500 }}>Captions</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {showCaptions && (
              <button 
                onClick={onChangeLanguage}
                style={{ 
                  backgroundColor: 'var(--surface-primary)', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--white)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                {captionLanguage.nativeName}
              </button>
            )}
            
            <button
              onClick={onToggleCaptions}
              style={{
                width: '52px',
                height: '30px',
                borderRadius: '15px',
                backgroundColor: showCaptions ? 'var(--vacfa-red)' : 'var(--grey-700)',
                border: 'none',
                position: 'relative',
                transition: 'background-color 0.2s',
                cursor: 'pointer'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: showCaptions ? '24px' : '2px',
                width: '26px',
                height: '26px',
                borderRadius: '13px',
                backgroundColor: 'white',
                transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
