'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Users, Mic, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createCaptionSimulator } from '@/lib/caption-simulator';
import type { Session, CaptionEntry } from '@/lib/types';
import styles from './LiveSession.module.css';

function useCaptionSimulator() {
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [partialText, setPartialText] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState('');

  const [simulator, setSimulator] = useState<ReturnType<typeof createCaptionSimulator> | null>(null);

  useEffect(() => {
    let captionBuilder: CaptionEntry[] = [];
    
    const sim = createCaptionSimulator({
      onWordTyped: (partial) => {
        setPartialText(partial);
      },
      onCaptionComplete: (caption) => {
        captionBuilder = [...captionBuilder, caption];
        setCaptions(captionBuilder);
        setPartialText('');
      },
      onSpeakerChange: (speaker) => {
        setCurrentSpeaker(speaker);
      }
    });

    setSimulator(sim);
    sim.start();
    return () => sim.pause();
  }, []);

  return { captions, partialText, currentSpeaker, simulator };
}

export default function LiveSessionClient({ session }: { session: Session }) {
  const router = useRouter();
  const { captions, partialText, currentSpeaker, simulator } = useCaptionSimulator();
  
  // Separate states for audio and captions
  const [audioLang, setAudioLang] = useState(session.languages[1]?.code || 'fr');
  const [captionLang, setCaptionLang] = useState(session.languages[0]?.code || 'en');
  const [showCaptions, setShowCaptions] = useState(true);
  const [notes, setNotes] = useState('');
  
  const captionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCaptions) {
      captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [captions, partialText, showCaptions]);

  useEffect(() => {
    if (simulator) {
      simulator.setLanguage(captionLang);
    }
  }, [captionLang, simulator]);

  const handleLeave = () => {
    router.push('/dashboard');
  };

  const renderTextWithGlossary = (text: string, glossaryTerms: string[] = []) => {
    if (!glossaryTerms.length) return text;
    
    let result = text;
    glossaryTerms.forEach(term => {
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
            <div className={styles.liveBadge}>LIVE</div>
            <h1 className={styles.title}>{session.name}</h1>
            <p className={styles.code}>Code: {session.sessionCode}</p>
          </div>
          
          <div className={styles.audioVisualizer}>
            <div className={styles.bar}></div>
            <div className={styles.bar}></div>
            <div className={styles.bar}></div>
            <div className={styles.bar}></div>
            <div className={styles.bar}></div>
            <span className="ml-2 text-sm text-vacfa-red-light font-medium">Audio Active</span>
          </div>
        </div>

        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', marginTop: '2rem', gap: '0.5rem' }}>
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
              padding: '1rem',
              color: 'var(--cream)',
              resize: 'none',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--vacfa-red)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--surface-elevated)'}
          />
        </div>

        <button className={styles.leaveButton} onClick={handleLeave} style={{ marginTop: '1.5rem' }}>
          <LogOut size={18} />
          Leave Session
        </button>
      </div>

      {/* Center Panel */}
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
                    <span className={styles.speaker}><Mic size={14} className="inline mr-1"/> {cap.speaker}</span>
                    <span>{cap.timestamp}</span>
                  </div>
                  <div className={styles.originalText}>{cap.originalText}</div>
                  <div className={styles.translatedText}>
                    {renderTextWithGlossary(
                      captionLang === 'en' 
                        ? cap.originalText 
                        : (cap.translations?.[captionLang] || cap.originalText), 
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
                  style={{ opacity: 0.7 }}
                >
                  <div className={styles.captionHeader}>
                    <span className={styles.speaker}><Mic size={14} className="inline mr-1"/> {currentSpeaker || 'Translating...'}</span>
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
          <div className={styles.captionsContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <p>Captions are turned off</p>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className={styles.rightPanel}>
        
        <div style={{ marginBottom: '2rem' }}>
          <h2 className={styles.channelsTitle}>Audio Channel</h2>
          <div className={styles.channelList}>
            {session.languages.map((lang) => {
              const isActive = audioLang === lang.code;
              return (
                <div 
                  key={`audio-${lang.code}`}
                  className={`${styles.channelItem} ${isActive ? styles.channelActive : ''}`}
                  onClick={() => setAudioLang(lang.code)}
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
                transition: 'all 0.2s ease'
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
                    <div>
                      <div className={styles.channelName}>{lang.name}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
