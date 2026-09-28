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
  Bot,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Session, CaptionEntry, GlossaryTerm } from '@/lib/types';
import { getSessionById } from '@/lib/session-store';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AiConfigModal } from '@/components/ui/AiConfigModal';
import { createSpeechRecognitionController } from '@/lib/speech-recognition';
import { translateText, getStoredApiKey } from '@/lib/gemini-translator';
import { createSpeechSynthesisController, unlockAudioPlayback } from '@/lib/speech-synthesis';
import {
  subscribeToLiveSync,
  broadcastCaptionFinal,
  broadcastCaptionInterim,
  broadcastMicStatus,
  broadcastGlossaryAdded,
  getActiveSessionGlossary,
} from '@/lib/live-sync';
import { createCaptionSimulator } from '@/lib/caption-simulator';
import { sendTeamsCartCaption } from '@/lib/teams-cart';
import styles from './LiveSession.module.css';

interface LiveSessionClientProps {
  session: Session;
  sessionId?: string;
}

export default function LiveSessionClient({ session, sessionId }: LiveSessionClientProps) {
  const router = useRouter();
  const [currentSession, setCurrentSession] = useState<Session>(session);

  useEffect(() => {
    if (sessionId) {
      const stored = getSessionById(sessionId);
      if (stored) {
        setCurrentSession(stored);
        if (stored.languages.length > 1) {
          setAudioLang(stored.languages[1].code);
        }
      }
    }
  }, [sessionId]);

  // Language channel states
  const [audioLang, setAudioLang] = useState(session.languages[1]?.code || 'fr');
  const [captionLang, setCaptionLang] = useState(session.languages[0]?.code || 'en');
  const [showCaptions, setShowCaptions] = useState(true);
  const [notes, setNotes] = useState('');

  // Microsoft Teams In-Meeting Side Panel Detection
  const [isTeamsEmbed, setIsTeamsEmbed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      setIsTeamsEmbed(search.includes('embed=teams') || search.includes('teams=true'));
    }
  }, []);

  // Live audio listening (TTS) — default to muted per user preference
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const ttsRef = useRef<ReturnType<typeof createSpeechSynthesisController> | null>(null);

  // Presenter Microphone state
  const [isPresenterMicLive, setIsPresenterMicLive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micErrorMessage, setMicErrorMessage] = useState('');
  const [floorLanguage, setFloorLanguage] = useState<'auto' | 'en' | 'fr' | 'pt' | 'sw'>('auto');
  const speechRecognizerRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);

  const handleFloorLanguageChange = (lang: 'auto' | 'en' | 'fr' | 'pt' | 'sw') => {
    setFloorLanguage(lang);
    speechRecognizerRef.current?.setLanguage(lang === 'auto' ? 'en' : lang);
  };

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

  const playedCaptionIdsRef = useRef<Set<string>>(new Set());

  // Handle incoming audio playback when a caption is generated/received
  const playCaptionAudio = useCallback(
    (cap: CaptionEntry) => {
      if (isAudioMuted || !ttsRef.current) return;
      if (playedCaptionIdsRef.current.has(cap.id)) return;
      const translated = cap.translations?.[audioLang] || cap.originalText;
      if (!translated || translated === '...') return;
      playedCaptionIdsRef.current.add(cap.id);
      ttsRef.current.speak(translated, audioLang);
    },
    [audioLang, isAudioMuted]
  );

  // Process a finalized sentence from the microphone
  const handleFinalSpeech = useCallback(
    async (finalTranscript: string) => {
      if (!finalTranscript.trim()) return;

      setPartialText('');
      const initialSpeaker =
        floorLanguage === 'auto' ? 'Presenter (Live)' : `Presenter (${floorLanguage.toUpperCase()})`;
      setCurrentSpeaker(initialSpeaker);

      const captionId = `live-cap-${Date.now()}`;
      // 1. Instant Optimistic Render: Display the user's sentence immediately (0ms delay!)
      const initialEntry: CaptionEntry = {
        id: captionId,
        speaker: initialSpeaker,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        originalText: finalTranscript,
        translations: {
          en: finalTranscript,
          fr: '...',
          pt: '...',
          sw: '...',
        },
        glossaryTerms: [],
      };

      setCaptions((prev) => [...prev, initialEntry]);

      // 2. Sub-second Gemini 2.0 Flash bidirectional translation
      try {
        const result = await translateText(
          finalTranscript,
          floorLanguage === 'auto' ? undefined : floorLanguage,
          activeGlossary
        );

        const detectedLang = result.sourceLang || 'en';
        const finalSpeaker = `Presenter (${detectedLang.toUpperCase()})`;

        const updatedEntry: CaptionEntry = {
          ...initialEntry,
          speaker: finalSpeaker,
          translations: result.translations,
          glossaryTerms: result.glossaryTerms,
        };

        setCaptions((prev) => prev.map((c) => (c.id === captionId ? updatedEntry : c)));
        broadcastCaptionFinal(updatedEntry);
        playCaptionAudio(updatedEntry);

        // Stream to Microsoft Teams CART API if configured
        if (currentSession.meetingIntegration?.teamsCartUrl) {
          const cartLang = currentSession.meetingIntegration.teamsCartLanguage || 'fr';
          const translated = updatedEntry.translations?.[cartLang];
          const isValid =
            cartLang === 'en'
              ? Boolean(updatedEntry.originalText?.trim())
              : Boolean(translated && translated !== '...' && translated.trim());

          if (isValid) {
            const cartText = cartLang === 'en' ? updatedEntry.originalText : translated!;
            sendTeamsCartCaption(currentSession.meetingIntegration.teamsCartUrl, cartText, {
              speaker: `VACFA (${cartLang.toUpperCase()})`,
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        setMicErrorMessage('Translation error: ' + (err?.message || 'Unknown error'));
      }
    },
    [activeGlossary, floorLanguage, playCaptionAudio, currentSession.meetingIntegration]
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
    const speakerLabel =
      floorLanguage === 'auto' ? 'Presenter (Live)' : `Presenter (${floorLanguage.toUpperCase()})`;

    const initialLangTag =
      floorLanguage === 'auto'
        ? 'en-ZA'
        : floorLanguage === 'fr'
        ? 'fr-FR'
        : floorLanguage === 'pt'
        ? 'pt-PT'
        : floorLanguage === 'sw'
        ? 'sw-KE'
        : 'en-ZA';

    const controller = createSpeechRecognitionController(
      {
        onInterimResult: (interim) => {
          setPartialText(interim);
          setCurrentSpeaker(speakerLabel);
          broadcastCaptionInterim(speakerLabel, interim);
        },
        onFinalResult: (finalText) => {
          handleFinalSpeech(finalText);
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
          broadcastMicStatus(true, speakerLabel, level);
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
      },
      initialLangTag
    );

    speechRecognizerRef.current = controller;

    return () => {
      controller.stop();
    };
  }, [floorLanguage, handleFinalSpeech]);

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
      unlockAudioPlayback();
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

  if (isTeamsEmbed) {
    return (
      <div className={styles.teamsContainer}>
        {/* Teams Header */}
        <div className={styles.teamsHeader}>
          <div className={styles.teamsTopRow}>
            <div className={styles.teamsBrand}>
              <div className={styles.teamsLogo}>
                VACFA <span className={styles.teamsLogoSpan}>TRANSLATE</span>
              </div>
              <span className={styles.teamsBadge}>
                <Bot size={11} /> Teams
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  background: 'var(--vacfa-red)',
                  color: 'white',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                LIVE
              </span>
              <button
                onClick={() => setIsAiConfigOpen(true)}
                title="Gemini AI Settings"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: hasApiKey ? 'var(--success)' : 'var(--grey-400)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <Sparkles size={14} />
              </button>
            </div>
          </div>

          {/* Teams Audio Control Card */}
          <div className={styles.teamsAudioControlCard}>
            <div className={styles.teamsAudioToggleRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={14} color="var(--vacfa-red-light)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Audio Channel</span>
              </div>

              <button
                className={`${styles.teamsAudioBtn} ${isAudioMuted ? styles.teamsAudioBtnMuted : styles.teamsAudioBtnActive}`}
                onClick={() => {
                  const nextState = !isAudioMuted;
                  setIsAudioMuted(nextState);
                  if (nextState) {
                    ttsRef.current?.stop();
                  } else {
                    unlockAudioPlayback();
                    playedCaptionIdsRef.current.clear();
                    if (captions.length > 0) {
                      const lastCap = captions[captions.length - 1];
                      playedCaptionIdsRef.current.add(lastCap.id);
                      const translated = lastCap.translations?.[audioLang] || lastCap.originalText;
                      if (translated && translated !== '...') {
                        ttsRef.current?.speak(translated, audioLang);
                      }
                    }
                  }
                }}
              >
                {isAudioMuted ? <VolumeX size={13} /> : <Volume2 size={13} className="animate-pulse" />}
                <span>{isAudioMuted ? 'Muted' : 'Listening'}</span>
              </button>
            </div>

            {/* Language Chips */}
            <div className={styles.teamsLangChips}>
              {currentSession.languages.map((lang) => {
                const isActive = audioLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    className={`${styles.teamsLangChip} ${isActive ? styles.teamsLangChipActive : ''}`}
                    onClick={() => {
                      if (audioLang === lang.code) return;
                      ttsRef.current?.stop();
                      setAudioLang(lang.code);
                      setCaptionLang(lang.code);
                      unlockAudioPlayback();
                      playedCaptionIdsRef.current.clear();
                      if (!isAudioMuted && captions.length > 0) {
                        const lastCap = captions[captions.length - 1];
                        playedCaptionIdsRef.current.add(lastCap.id);
                        const translated = lastCap.translations?.[lang.code] || lastCap.originalText;
                        if (translated && translated !== '...') {
                          ttsRef.current?.speak(translated, lang.code);
                        }
                      }
                    }}
                  >
                    {lang.code.toUpperCase()} • {lang.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Captions Feed */}
        <div className={styles.teamsCaptionsStream}>
          <AnimatePresence initial={false}>
            {captions.map((cap, index) => (
              <motion.div
                key={`${cap.id}-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={styles.teamsCaptionCard}
              >
                <div className={styles.teamsCaptionMeta}>
                  <span><Mic size={11} className="inline mr-1" /> {cap.speaker}</span>
                  <span>{cap.timestamp}</span>
                </div>
                {captionLang !== 'en' && (
                  <div className={styles.teamsOriginalSnippet}>
                    {cap.originalText}
                  </div>
                )}
                <div className={styles.teamsTranslatedSnippet}>
                  {renderTextWithGlossary(
                    cap.translations?.[captionLang] || cap.originalText,
                    cap.glossaryTerms
                  )}
                </div>
              </motion.div>
            ))}

            {partialText && (
              <motion.div
                key="teams-partial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={styles.teamsCaptionCard}
                style={{ opacity: 0.85, borderStyle: 'dashed' }}
              >
                <div className={styles.teamsCaptionMeta}>
                  <span><Mic size={11} className="inline mr-1" /> {currentSpeaker || 'Speaking...'}</span>
                </div>
                <div className={styles.teamsTranslatedSnippet}>
                  {partialText}
                  <span className="animate-pulse">_</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={captionsEndRef} />
        </div>

        {/* Teams Bottom Footer */}
        <div className={styles.teamsFooter}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsGlossaryModalOpen(true)}
            icon={<PlusCircle size={13} />}
          >
            Suggest Term
          </Button>

          <Button
            variant={isPresenterMicLive ? 'primary' : 'outline'}
            size="sm"
            onClick={togglePresenterMic}
            icon={isPresenterMicLive ? <Mic size={13} className="animate-pulse" /> : <MicOff size={13} />}
          >
            {isPresenterMicLive ? 'Mic Live' : 'Present'}
          </Button>
        </div>

        {/* Modals */}
        <Modal
          isOpen={isGlossaryModalOpen}
          onClose={() => !glossarySubmitted && setIsGlossaryModalOpen(false)}
          title="Add to Glossary Memory"
        >
          <form onSubmit={handleGlossarySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--grey-400)' }}>Source Term</label>
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
                  padding: '0.65rem',
                  color: 'var(--cream)',
                }}
              />
            </div>
            <Button type="submit" variant="primary" size="md" disabled={glossarySubmitted || !glossaryTerm.trim()}>
              {glossarySubmitted ? 'Added!' : 'Submit'}
            </Button>
          </form>
        </Modal>

        <AiConfigModal
          isOpen={isAiConfigOpen}
          onClose={() => setIsAiConfigOpen(false)}
          onConfigSaved={() => setHasApiKey(Boolean(getStoredApiKey()))}
        />
      </div>
    );
  }

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h1 className={styles.title} style={{ margin: 0 }}>{currentSession.name}</h1>
              {currentSession.meetingIntegration?.botEnabled && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(84, 91, 199, 0.2)',
                  color: '#8E96F7',
                  border: '1px solid rgba(84, 91, 199, 0.4)',
                }}>
                  <Bot size={12} /> {currentSession.meetingIntegration.platform.toUpperCase()} Bot
                </span>
              )}
            </div>
            <p className={styles.code}>Code: {currentSession.sessionCode}</p>
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

            {/* Floor Speaker Language Selector */}
            <div
              style={{
                marginTop: '10px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '8px',
                padding: '8px 10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--cream)',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Mic size={12} color="var(--vacfa-red-light)" />
                Floor Language:
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {[
                  { code: 'auto', label: '⚡ Auto' },
                  { code: 'en', label: '🇬🇧 EN' },
                  { code: 'fr', label: '🇫🇷 FR' },
                  { code: 'pt', label: '🇵🇹 PT' },
                  { code: 'sw', label: '🇹🇿 SW' },
                ].map((item) => {
                  const isSelected = floorLanguage === item.code;
                  return (
                    <button
                      key={item.code}
                      onClick={() => handleFloorLanguageChange(item.code as any)}
                      style={{
                        padding: '4px 7px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: isSelected ? '1px solid var(--vacfa-red)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'var(--vacfa-red)' : 'rgba(255, 255, 255, 0.04)',
                        color: isSelected ? 'white' : 'var(--cream)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
                      cap.translations?.[captionLang] || cap.originalText,
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
                } else {
                  unlockAudioPlayback();
                  playedCaptionIdsRef.current.clear();
                  if (captions.length > 0) {
                    const lastCap = captions[captions.length - 1];
                    playedCaptionIdsRef.current.add(lastCap.id);
                    const translated = lastCap.translations?.[audioLang] || lastCap.originalText;
                    if (translated && translated !== '...') {
                      ttsRef.current?.speak(translated, audioLang);
                    }
                  }
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
            {currentSession.languages.map((lang) => {
              const isActive = audioLang === lang.code;
              return (
                <div
                  key={`audio-${lang.code}`}
                  className={`${styles.channelItem} ${isActive ? styles.channelActive : ''}`}
                  onClick={() => {
                    if (audioLang === lang.code) return;
                    // Instantly abort audio from previous language and dump queue
                    ttsRef.current?.stop();
                    setAudioLang(lang.code);
                    unlockAudioPlayback();
                    playedCaptionIdsRef.current.clear();
                    if (!isAudioMuted && captions.length > 0) {
                      const lastCap = captions[captions.length - 1];
                      playedCaptionIdsRef.current.add(lastCap.id);
                      const translated = lastCap.translations?.[lang.code] || lastCap.originalText;
                      if (translated && translated !== '...') {
                        ttsRef.current?.speak(translated, lang.code);
                      }
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
            {currentSession.languages.map((lang) => {
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
