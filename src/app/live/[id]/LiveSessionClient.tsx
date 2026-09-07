'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  Users,
  Mic,
  MicOff,
  Globe,
  PlusCircle,
  Volume2,
  VolumeX,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Session, CaptionEntry, GlossaryTerm } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AiConfigModal } from '@/components/ui/AiConfigModal';
import { createSpeechRecognitionController } from '@/lib/speech-recognition';
import { translateText, getStoredApiKey } from '@/lib/gemini-translator';
import { createSpeechSynthesisController } from '@/lib/speech-synthesis';
import {
  subscribeToLiveSync,
  broadcastCaptionFinal,
  broadcastCaptionInterim,
  broadcastMicStatus,
  broadcastGlossaryAdded,
  getActiveSessionGlossary,
} from '@/lib/live-sync';
import { createCaptionSimulator } from '@/lib/caption-simulator';
import styles from './LiveSession.module.css';

interface LiveSessionClientProps {
  session: Session;
}

export default function LiveSessionClient({ session }: LiveSessionClientProps) {
  const router = useRouter();

  // Language channel states
  const [audioLang, setAudioLang] = useState(session.languages[1]?.code || 'fr');
  const [captionLang, setCaptionLang] = useState(session.languages[0]?.code || 'en');
  const [showCaptions, setShowCaptions] = useState(true);
  const [notes, setNotes] = useState('');

  // Live audio listening (TTS) — default to muted per user preference
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const ttsRef = useRef<ReturnType<typeof createSpeechSynthesisController> | null>(null);

  // Presenter Microphone state
  const [isPresenterMicLive, setIsPresenterMicLive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micErrorMessage, setMicErrorMessage] = useState('');
  const speechRecognizerRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);

  // Live Captions state
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [partialText, setPartialText] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const captionsEndRef = useRef<HTMLDivElement>(null);

  // AI & Glossary state
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [activeGlossary, setActiveGlossary] = useState<GlossaryTerm[]>([]);

  // Glossary suggestion modal state
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState('');
  const [glossaryCategory, setGlossaryCategory] = useState<'immunology' | 'epidemiology' | 'logistics' | 'policy'>('epidemiology');
  const [glossaryContext, setGlossaryContext] = useState('');
  const [glossarySubmitted, setGlossarySubmitted] = useState(false);

  // Fallback simulator reference
  const simulatorRef = useRef<ReturnType<typeof createCaptionSimulator> | null>(null);

  // Initialize Speech Synthesis controller
  useEffect(() => {
    ttsRef.current = createSpeechSynthesisController();
    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  // Initialize active glossary from storage
  useEffect(() => {
    setActiveGlossary(getActiveSessionGlossary());
    setHasApiKey(Boolean(getStoredApiKey()));
  }, []);

  // Auto-scroll captions container
  useEffect(() => {
    if (showCaptions) {
      captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [captions, partialText, showCaptions]);

  // Handle incoming audio playback when a caption is generated/received
  const playCaptionAudio = useCallback(
    (cap: CaptionEntry) => {
      if (isAudioMuted || !ttsRef.current) return;
      const translated = cap.translations?.[audioLang] || cap.originalText;
      ttsRef.current.speak(translated, audioLang);
    },
    [audioLang, isAudioMuted]
  );

  // Process a finalized sentence from the microphone
  const handleFinalSpeech = useCallback(
    async (finalTranscript: string) => {
      if (!finalTranscript.trim()) return;

      setPartialText('');
      const speakerName = 'Presenter (Live)';
      setCurrentSpeaker(speakerName);

      try {
        const result = await translateText(finalTranscript, 'en', activeGlossary);

        const newEntry: CaptionEntry = {
          id: `live-cap-${Date.now()}`,
          speaker: speakerName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          originalText: result.originalText,
          translations: result.translations,
          glossaryTerms: result.glossaryTerms,
        };

        setCaptions((prev) => [...prev, newEntry]);
        broadcastCaptionFinal(newEntry);
        playCaptionAudio(newEntry);
      } catch (err: any) {
        setMicErrorMessage('Translation error: ' + (err?.message || 'Unknown error'));
      }
    },
    [activeGlossary, playCaptionAudio]
  );

  // Setup Live Synchronization listener (receives events from other tabs / presenter)
  useEffect(() => {
    const unsubscribe = subscribeToLiveSync({
      onCaptionFinal: (caption) => {
        // If we are not the one actively broadcasting, accept external captions
        if (!isPresenterMicLive) {
          setCaptions((prev) => [...prev, caption]);
          setPartialText('');
          playCaptionAudio(caption);
        }
      },
      onCaptionInterim: ({ speaker, text }) => {
        if (!isPresenterMicLive) {
          setCurrentSpeaker(speaker);
          setPartialText(text);
        }
      },
      onMicStatus: ({ isLive, audioLevel: level, speaker }) => {
        if (!isPresenterMicLive) {
          setAudioLevel(isLive ? level : 0);
          if (isLive) setCurrentSpeaker(speaker);
        }
      },
      onGlossaryAdded: (newTerm) => {
        setActiveGlossary((prev) => [newTerm, ...prev]);
      },
    });

    return () => unsubscribe();
  }, [isPresenterMicLive, playCaptionAudio]);

  // Setup Speech Recognition Controller
  useEffect(() => {
    const controller = createSpeechRecognitionController({
      onInterimResult: (interim) => {
        setPartialText(interim);
        setCurrentSpeaker('Presenter (Live)');
        broadcastCaptionInterim('Presenter (Live)', interim);
      },
      onFinalResult: (finalText) => {
        handleFinalSpeech(finalText);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
        broadcastMicStatus(true, 'Presenter (Live)', level);
      },
      onStateChange: (listening) => {
        setIsPresenterMicLive(listening);
        if (!listening) {
          setAudioLevel(0);
          broadcastMicStatus(false, '', 0);
        }
      },
      onError: (err) => {
        setMicErrorMessage(err);
      },
    });

    speechRecognizerRef.current = controller;

    return () => {
      controller.stop();
    };
  }, [handleFinalSpeech]);

  // Fallback simulator: Run demo loop if presenter mic is idle and no live captions exist
  useEffect(() => {
    if (isPresenterMicLive || captions.length > 0) {
      simulatorRef.current?.pause();
      return;
    }

    let localCaptions: CaptionEntry[] = [];
    const sim = createCaptionSimulator({
      onWordTyped: (partial) => {
        setPartialText(partial);
      },
      onCaptionComplete: (cap) => {
        localCaptions = [...localCaptions, cap];
        setCaptions(localCaptions);
        setPartialText('');
        playCaptionAudio(cap);
      },
      onSpeakerChange: (speaker) => {
        setCurrentSpeaker(speaker);
      },
    });

    simulatorRef.current = sim;
    sim.setLanguage(captionLang);
    sim.start();

    return () => {
      sim.pause();
    };
  }, [isPresenterMicLive, captions.length, captionLang, playCaptionAudio]);

  // Toggle Presenter Microphone
  const togglePresenterMic = async () => {
    setMicErrorMessage('');
    if (isPresenterMicLive) {
      speechRecognizerRef.current?.stop();
    } else {
      // Pause simulator when presenter starts speaking
      simulatorRef.current?.pause();
      await speechRecognizerRef.current?.start();
    }
  };

  const handleLeave = () => {
    speechRecognizerRef.current?.stop();
    ttsRef.current?.stop();
    router.push('/');
  };

  // Submit a dynamic glossary term
  const handleGlossarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!glossaryTerm.trim()) return;

    const newTerm: GlossaryTerm = {
      id: `term-delegate-${Date.now()}`,
      term: glossaryTerm.trim(),
      category: glossaryCategory,
      translations: {
        en: glossaryTerm.trim(),
        fr: glossaryContext ? glossaryContext : glossaryTerm.trim(),
        pt: glossaryContext ? glossaryContext : glossaryTerm.trim(),
        sw: glossaryContext ? glossaryContext : glossaryTerm.trim(),
      },
      context: glossaryContext,
      contributor: 'organiser',
      contributorName: 'Live Delegate',
    };

    setActiveGlossary((prev) => [newTerm, ...prev]);
    broadcastGlossaryAdded(newTerm);

    setGlossarySubmitted(true);
    setTimeout(() => {
      setGlossarySubmitted(false);
      setIsGlossaryModalOpen(false);
      setGlossaryTerm('');
      setGlossaryContext('');
    }, 1500);
  };

  const renderTextWithGlossary = (text: string, glossaryTerms: string[] = []) => {
    if (!glossaryTerms.length) return text;

    let result = text;
    glossaryTerms.forEach((term) => {
      const regex = new RegExp(`(${term})`, 'gi');
      result = result.replace(regex, `<span class="${styles.glossaryTerm}">$1</span>`);
    });

    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  };

  return (
    <div className={styles.container}>
      {/* Left Panel */}
      <div className={styles.leftPanel}>
        <div style={{ flex: '0 0 auto' }}>
          <div className={styles.headerInfo}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className={styles.liveBadge}>LIVE</div>
              <button
                onClick={() => setIsAiConfigOpen(true)}
                title="Configure Gemini AI"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: hasApiKey ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${hasApiKey ? 'var(--success)' : 'rgba(255, 255, 255, 0.15)'}`,
                  color: hasApiKey ? 'var(--success)' : 'var(--cream)',
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Sparkles size={12} />
                <span>{hasApiKey ? 'Gemini AI' : 'Smart AI'}</span>
              </button>
            </div>

            <h1 className={styles.title}>{session.name}</h1>
            <p className={styles.code}>Code: {session.sessionCode}</p>
          </div>

          {/* Presenter Live Mic Broadcast Action */}
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              onClick={togglePresenterMic}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: isPresenterMicLive ? 'var(--vacfa-red)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${isPresenterMicLive ? 'var(--vacfa-red)' : 'rgba(255, 255, 255, 0.15)'}`,
                color: 'white',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: isPresenterMicLive ? '0 0 15px rgba(196, 30, 58, 0.5)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isPresenterMicLive ? (
                <>
                  <Mic size={18} className="animate-pulse" />
                  <span>Presenter Mic: ON (Speaking)</span>
                </>
              ) : (
                <>
                  <MicOff size={18} />
                  <span>Start Presenting (Live Mic)</span>
                </>
              )}
            </button>
            {micErrorMessage && (
              <p style={{ color: 'var(--vacfa-red-light)', fontSize: '0.75rem', marginTop: '6px', lineHeight: 1.3 }}>
                {micErrorMessage}
              </p>
            )}
          </div>

          {/* Audio Waveform (reactive to actual mic volume or simulator) */}
          <div className={styles.audioVisualizer}>
            {[...Array(5)].map((_, i) => {
              const baseHeights = [30, 60, 100, 70, 40];
              const dynamicScale = isPresenterMicLive
                ? Math.max(0.2, audioLevel * 2 * (1 - Math.abs(2 - i) * 0.2))
                : 0.5;

              return (
                <div
                  key={i}
                  className={styles.bar}
                  style={{
                    height: `${baseHeights[i]}%`,
                    transform: `scaleY(${dynamicScale})`,
                    transition: 'transform 0.1s ease',
                  }}
                />
              );
            })}
            <span className="ml-2 text-sm text-vacfa-red-light font-medium">
              {isPresenterMicLive ? 'Mic Broadcasting' : 'Audio Active'}
            </span>
          </div>
        </div>

        {/* Split Notes & Glossary Suggestion */}
        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', marginTop: '1rem', gap: '1.25rem', overflowY: 'auto' }}>
          {/* Notes Section */}
          <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '120px' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--grey-400)' }}>My Notes / Q&A</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type your notes or questions for the speaker here..."
              style={{
                flex: '1 1 auto',
                background: 'var(--surface-primary)',
                border: '1px solid var(--surface-elevated)',
                borderRadius: '12px',
                padding: '0.85rem',
                color: 'var(--cream)',
                resize: 'none',
                fontFamily: 'inherit',
                outline: 'none',
                fontSize: '0.85rem',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--vacfa-red)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--surface-elevated)')}
            />
          </div>

          {/* Glossary Suggestion Section */}
          <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '120px' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--grey-400)' }}>Suggest Glossary Term</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--grey-700)' }}>
              Spot an incorrect translation? Add it to the memory bank.
            </p>

            <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-primary)', borderRadius: '12px', border: '1px solid var(--surface-elevated)', padding: '0.75rem' }}>
              <Button variant="outline" size="sm" onClick={() => setIsGlossaryModalOpen(true)}>
                <PlusCircle size={16} style={{ marginRight: '8px' }} /> Add to Glossary
              </Button>
            </div>
          </div>
        </div>

        <button className={styles.leaveButton} onClick={handleLeave} style={{ marginTop: '1.25rem' }}>
          <LogOut size={18} />
          Leave Session
        </button>
      </div>

      {/* Center Panel (Captions) */}
      <div className={styles.centerPanel}>
        {showCaptions ? (
          <div className={styles.captionsContainer}>
            <AnimatePresence initial={false}>
              {captions.map((cap, index) => (
                <motion.div
                  key={`${cap.id}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={styles.captionBox}
                >
                  <div className={styles.captionHeader}>
                    <span className={styles.speaker}>
                      <Mic size={14} className="inline mr-1" /> {cap.speaker}
                    </span>
                    <span>{cap.timestamp}</span>
                  </div>
                  <div className={styles.originalText}>{cap.originalText}</div>
                  <div className={styles.translatedText}>
                    {renderTextWithGlossary(
                      captionLang === 'en'
                        ? cap.originalText
                        : cap.translations?.[captionLang] || cap.originalText,
                      cap.glossaryTerms
                    )}
                  </div>
                </motion.div>
              ))}

              {partialText && (
                <motion.div
                  key="partial"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={styles.captionBox}
                  style={{ opacity: 0.8 }}
                >
                  <div className={styles.captionHeader}>
                    <span className={styles.speaker}>
                      <Mic size={14} className="inline mr-1" /> {currentSpeaker || 'Live Speaking...'}
                    </span>
                  </div>
                  <div className={styles.translatedText}>
                    {partialText}
                    <span className="animate-pulse">_</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={captionsEndRef} />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--grey-400)' }}>
            Captions are turned off
          </div>
        )}
      </div>

      {/* Right Panel (Audio & Captions Selectors) */}
      <div className={styles.rightPanel}>
        {/* Audio Channel Section */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className={styles.channelsTitle} style={{ margin: 0 }}>Audio Channel</h2>
            <button
              onClick={() => {
                const nextState = !isAudioMuted;
                setIsAudioMuted(nextState);
                if (nextState) {
                  ttsRef.current?.stop();
                } else if (captions.length > 0) {
                  playCaptionAudio(captions[captions.length - 1]);
                }
              }}
              title={isAudioMuted ? 'Click to Listen Live' : 'Mute Spoken Audio'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '999px',
                border: isAudioMuted ? '1px solid var(--grey-400)' : '1px solid var(--success)',
                background: isAudioMuted ? 'transparent' : 'rgba(76, 175, 80, 0.2)',
                color: isAudioMuted ? 'var(--grey-400)' : 'var(--success)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="animate-pulse" />}
              <span>{isAudioMuted ? 'Muted' : 'Listening'}</span>
            </button>
          </div>

          <div className={styles.channelList}>
            {session.languages.map((lang) => {
              const isActive = audioLang === lang.code;
              return (
                <div
                  key={`audio-${lang.code}`}
                  className={`${styles.channelItem} ${isActive ? styles.channelActive : ''}`}
                  onClick={() => {
                    setAudioLang(lang.code);
                    if (!isAudioMuted && captions.length > 0) {
                      const lastCap = captions[captions.length - 1];
                      ttsRef.current?.speak(lastCap.translations?.[lang.code] || lastCap.originalText, lang.code);
                    }
                  }}
                >
                  <div className={styles.channelInfo}>
                    <Globe size={18} color={isActive ? 'white' : 'var(--grey-400)'} />
                    <div>
                      <div className={styles.channelName}>{lang.name}</div>
                      <div className={styles.listenerCount}>
                        <Users size={12} /> {lang.listenerCount || 0}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Captions Channel Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className={styles.channelsTitle} style={{ margin: 0 }}>Captions</h2>
            <button
              onClick={() => setShowCaptions(!showCaptions)}
              style={{
                background: showCaptions ? 'var(--vacfa-red)' : 'transparent',
                border: showCaptions ? 'none' : '1px solid var(--grey-400)',
                color: showCaptions ? 'white' : 'var(--grey-400)',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {showCaptions ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className={styles.channelList} style={{ opacity: showCaptions ? 1 : 0.5, pointerEvents: showCaptions ? 'auto' : 'none' }}>
            {session.languages.map((lang) => {
              const isActive = captionLang === lang.code;
              return (
                <div
                  key={`caption-${lang.code}`}
                  className={`${styles.channelItem} ${isActive ? styles.channelActive : ''}`}
                  onClick={() => setCaptionLang(lang.code)}
                  style={{ padding: '0.75rem', minHeight: 'auto' }}
                >
                  <div className={styles.channelInfo}>
                    <div className={styles.channelName}>{lang.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Suggest Glossary Modal */}
      <Modal
        isOpen={isGlossaryModalOpen}
        onClose={() => !glossarySubmitted && setIsGlossaryModalOpen(false)}
        title="Add to Glossary Memory"
      >
        <form onSubmit={handleGlossarySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--grey-400)' }}>Source Term (Spoken Word)</label>
            <input
              type="text"
              value={glossaryTerm}
              onChange={(e) => setGlossaryTerm(e.target.value)}
              placeholder="e.g. Seroconversion"
              required
              disabled={glossarySubmitted}
              style={{
                width: '100%',
                background: 'var(--surface-primary)',
                border: '1px solid var(--surface-elevated)',
                borderRadius: '8px',
                padding: '0.75rem',
                color: 'var(--cream)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--vacfa-red)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--surface-elevated)')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--grey-400)' }}>Category</label>
            <select
              value={glossaryCategory}
              onChange={(e) => setGlossaryCategory(e.target.value as any)}
              disabled={glossarySubmitted}
              style={{
                width: '100%',
                background: 'var(--surface-primary)',
                border: '1px solid var(--surface-elevated)',
                borderRadius: '8px',
                padding: '0.75rem',
                color: 'var(--cream)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--vacfa-red)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--surface-elevated)')}
            >
              <option value="epidemiology">Epidemiology</option>
              <option value="immunology">Immunology</option>
              <option value="logistics">Logistics</option>
              <option value="policy">Policy</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--grey-400)' }}>Context / Suggested Translation (Optional)</label>
            <textarea
              value={glossaryContext}
              onChange={(e) => setGlossaryContext(e.target.value)}
              placeholder="Explain how this should be translated or used..."
              disabled={glossarySubmitted}
              style={{
                width: '100%',
                background: 'var(--surface-primary)',
                border: '1px solid var(--surface-elevated)',
                borderRadius: '8px',
                padding: '0.75rem',
                color: 'var(--cream)',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none',
                minHeight: '80px',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--vacfa-red)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--surface-elevated)')}
            />
          </div>

          <Button type="submit" variant="primary" size="lg" disabled={glossarySubmitted || !glossaryTerm.trim()}>
            {glossarySubmitted ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}>
                <CheckCircle2 size={18} /> Added to Memory
              </span>
            ) : (
              'Submit to Memory'
            )}
          </Button>
        </form>
      </Modal>

      {/* AI Engine Configuration Modal */}
      <AiConfigModal
        isOpen={isAiConfigOpen}
        onClose={() => setIsAiConfigOpen(false)}
        onConfigSaved={() => {
          setHasApiKey(Boolean(getStoredApiKey()));
        }}
      />
    </div>
  );
}
