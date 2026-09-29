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
  Play,
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
  broadcastPresence,
  getActiveSessionGlossary,
} from '@/lib/live-sync';
import { INITIAL_INSTRUCTION_CAPTION } from '@/lib/demo-data';
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

  // Real-time channel listener presence state (accurate, non-placeholder)
  const clientIdRef = useRef<string>(
    typeof window !== 'undefined'
      ? `client-${Math.random().toString(36).slice(2, 9)}`
      : 'client-1'
  );
  const [channelListeners, setChannelListeners] = useState<Record<string, number>>({});
  const remoteClientsRef = useRef<Map<string, { lang: string; time: number }>>(new Map());

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

  // Audio level state
  const [audioLevel, setAudioLevel] = useState(0);

  // Live Captions state
  const [captions, setCaptions] = useState<CaptionEntry[]>([INITIAL_INSTRUCTION_CAPTION]);
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

  // Setup Live Synchronization listener (receives events from other tabs / meeting bot)
  useEffect(() => {
    const unsubscribe = subscribeToLiveSync({
      onCaptionFinal: (caption) => {
        setCaptions((prev) => [...prev, caption]);
        setPartialText('');
        playCaptionAudio(caption);
      },
      onCaptionInterim: ({ speaker, text }) => {
        setCurrentSpeaker(speaker);
        setPartialText(text);
      },
      onMicStatus: ({ isLive, audioLevel: level, speaker }) => {
        setAudioLevel(isLive ? level : 0);
        if (isLive) setCurrentSpeaker(speaker);
      },
      onGlossaryAdded: (newTerm) => {
        setActiveGlossary((prev) => [newTerm, ...prev]);
      },
      onPresenceHeartbeat: ({ clientId, audioLang: remoteLang }) => {
        if (clientId === clientIdRef.current) return;
        remoteClientsRef.current.set(clientId, { lang: remoteLang, time: Date.now() });
        const now = Date.now();
        const counts: Record<string, number> = {};
        currentSession.languages.forEach((l) => { counts[l.code] = 0; });
        counts[audioLang] = (counts[audioLang] || 0) + 1;
        for (const [id, peer] of remoteClientsRef.current.entries()) {
          if (id === clientIdRef.current) continue;
          if (now - peer.time < 12000) {
            counts[peer.lang] = (counts[peer.lang] || 0) + 1;
          }
        }
        setChannelListeners(counts);
      },
    });

    return () => unsubscribe();
  }, [playCaptionAudio, audioLang, currentSession.languages]);

  // Periodic heartbeat broadcast & listener count aggregation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pulse = () => {
      broadcastPresence(clientIdRef.current, audioLang, currentSession.id);
    };
    pulse();
    const interval = setInterval(pulse, 4000);

    const refreshCounts = () => {
      const now = Date.now();
      const counts: Record<string, number> = {};
      currentSession.languages.forEach((l) => { counts[l.code] = 0; });
      counts[audioLang] = (counts[audioLang] || 0) + 1;
      for (const [id, peer] of remoteClientsRef.current.entries()) {
        if (id === clientIdRef.current) continue;
        if (now - peer.time < 12000) {
          counts[peer.lang] = (counts[peer.lang] || 0) + 1;
        } else {
          remoteClientsRef.current.delete(id);
        }
      }
      setChannelListeners(counts);
    };

    const cleanup = setInterval(refreshCounts, 4000);

    return () => {
      clearInterval(interval);
      clearInterval(cleanup);
    };
  }, [audioLang, currentSession.id, currentSession.languages]);

  // Microsoft Teams Bot Ingestion Relay Bridge (Port 9876: WebSocket + SSE)
  const [isBotRelayConnected, setIsBotRelayConnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ws: WebSocket | null = null;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isConnected = false;

    function handlePayload(data: any) {
      if (data.type === 'caption') {
        const cap: CaptionEntry = data.caption;
        setCaptions((prev) => {
          const isDup = prev.slice(-4).some(
            (c) => c.originalText.trim().toLowerCase() === cap.originalText.trim().toLowerCase()
          );
          if (isDup) return prev;
          return [...prev, cap];
        });
        setPartialText('');
        setCurrentSpeaker(cap.speaker);
        playCaptionAudio(cap);
      } else if (data.type === 'interim') {
        setCurrentSpeaker(data.speaker || 'Teams Speaker');
        setPartialText(data.text);
      } else if (data.type === 'bot_status') {
        setIsBotRelayConnected(Boolean(data.connected));
      }
    }

    function tryWebSocket() {
      try {
        ws = new WebSocket('ws://127.0.0.1:9876');

        ws.onopen = () => {
          isConnected = true;
          setIsBotRelayConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handlePayload(data);
          } catch {}
        };

        ws.onerror = () => {
          if (!isConnected) {
            tryEventSource();
          }
        };

        ws.onclose = () => {
          isConnected = false;
          setIsBotRelayConnected(false);
          reconnectTimeout = setTimeout(tryWebSocket, 3000);
        };
      } catch {
        tryEventSource();
      }
    }

    function tryEventSource() {
      try {
        eventSource = new EventSource('http://127.0.0.1:9876/events');

        eventSource.onopen = () => {
          isConnected = true;
          setIsBotRelayConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handlePayload(data);
          } catch {}
        };

        eventSource.onerror = () => {
          isConnected = false;
          setIsBotRelayConnected(false);
          eventSource?.close();
        };
      } catch {
        setIsBotRelayConnected(false);
      }
    }

    tryWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      if (eventSource) eventSource.close();
    };
  }, [playCaptionAudio]);

  const handleLeave = () => {
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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <div className={styles.liveBadge}>LIVE</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h1 className={styles.title} style={{ margin: 0 }}>{currentSession.name}</h1>
              {(currentSession.meetingIntegration?.botEnabled || isBotRelayConnected) && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: isBotRelayConnected ? 'rgba(76, 175, 80, 0.18)' : 'rgba(84, 91, 199, 0.2)',
                  color: isBotRelayConnected ? 'var(--success)' : '#8E96F7',
                  border: `1px solid ${isBotRelayConnected ? 'var(--success)' : 'rgba(84, 91, 199, 0.4)'}`,
                }}>
                  <Bot size={12} className={isBotRelayConnected ? 'animate-pulse' : ''} />
                  {isBotRelayConnected ? 'Teams Bot Linked (Hearing All Attendees)' : `${currentSession.meetingIntegration?.platform?.toUpperCase() || 'TEAMS'} Bot Standby`}
                </span>
              )}
            </div>
            <p className={styles.code}>Code: {currentSession.sessionCode}</p>
          </div>

          {/* Meeting Audio Feed Status */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                background: isBotRelayConnected ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isBotRelayConnected ? 'rgba(76, 175, 80, 0.35)' : 'rgba(255, 255, 255, 0.12)'}`,
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '0.8rem',
                color: isBotRelayConnected ? 'var(--success)' : 'var(--cream)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Bot size={16} className={isBotRelayConnected ? 'animate-pulse' : ''} />
              <span style={{ fontWeight: 500 }}>
                {isBotRelayConnected
                  ? 'Meeting Audio Connected — Hearing all speakers live'
                  : 'Meeting Audio Feed — Audio captured from meeting'}
              </span>
            </div>
          </div>

          {/* Audio Waveform */}
          <div className={styles.audioVisualizer}>
            {[...Array(5)].map((_, i) => {
              const baseHeights = [30, 60, 100, 70, 40];
              const dynamicScale = isBotRelayConnected ? 0.65 : 0.35;

              return (
                <div
                  key={i}
                  className={styles.bar}
                  style={{
                    height: `${baseHeights[i]}%`,
                    transform: `scaleY(${dynamicScale})`,
                    transition: 'transform 0.15s ease',
                  }}
                />
              );
            })}
            <span className="ml-2 text-sm text-vacfa-red-light font-medium">
              {isBotRelayConnected ? 'Meeting Audio Live' : 'Audio Feed Standby'}
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
            {captions.length === 0 && !partialText && (
              <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--grey-400)' }}>
                <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(196, 30, 58, 0.12)', color: 'var(--vacfa-red-light)', marginBottom: '1rem' }}>
                  <Bot size={32} />
                </div>
                <h3 style={{ color: 'var(--white)', fontSize: '1.15rem', marginBottom: '0.5rem' }}>
                  Waiting for Meeting Audio
                </h3>
                <p style={{ maxWidth: '440px', margin: '0 auto', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  Meeting audio will stream here automatically once attendees or speakers talk in the meeting.
                </p>
              </div>
            )}
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
                      {cap.id.startsWith('instruction') ? (
                        <Globe size={14} className="inline mr-1 text-vacfa-red-light" />
                      ) : (
                        <Mic size={14} className="inline mr-1" />
                      )}
                      {' '}{cap.speaker}
                    </span>
                    <span>{cap.timestamp}</span>
                  </div>
                  {cap.originalText !== (cap.translations?.[captionLang] || cap.originalText) && (
                    <div className={styles.originalText}>{cap.originalText}</div>
                  )}
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
                        <Users size={12} /> {channelListeners[lang.code] !== undefined ? channelListeners[lang.code] : (audioLang === lang.code ? 1 : 0)}
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
