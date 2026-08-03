'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import styles from './MobileLiveView.module.css';
import { useCaptionSimulator } from '../hooks/useCaptionSimulator';
import type { Language } from '@/lib/types';

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
  const { currentText, speaker, captions, start, stop } = useCaptionSimulator(captionLanguage.code);
  const captionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  useEffect(() => {
    // Auto-scroll to bottom
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentText, captions]);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <header className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
        <div className={styles.liveIndicator}>
          <motion.div 
            className={styles.liveDot}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className={styles.liveText}>LIVE</span>
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

      <div className={styles.waveformContainer}>
        <div className={styles.waveform}>
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className={styles.bar}
              animate={{ height: ['20%', '80%', '40%', '100%', '30%'] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                repeatType: 'reverse',
                delay: i * 0.1,
                ease: "easeInOut"
              }}
              style={{ height: '20px' }}
            />
          ))}
        </div>
      </div>

      <div className={styles.captionsArea}>
        {showCaptions ? (
          <>
            {captions.map((cap, i) => (
              <div key={i} className={styles.captionItem}>
                <span className={styles.speakerName}>{cap.speaker}</span>
                <p className={styles.captionText}>
                  {captionLanguage.code === 'en' 
                    ? cap.originalText 
                    : (cap.translations?.[captionLanguage.code] || cap.originalText)}
                </p>
              </div>
            ))}
            
            {(currentText || speaker) && (
              <div className={`${styles.captionItem} ${styles.currentCaptionItem}`}>
                <span className={styles.speakerName}>{speaker}</span>
                <p className={styles.currentText}>{currentText}</p>
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

      <div className={styles.bottomBar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
        {/* Audio Language */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <Globe size={18} color="var(--vacfa-red-light)" />
             <span style={{ fontSize: '1rem', color: 'var(--cream)', fontWeight: 500 }}>Audio</span>
          </div>
          <button 
            onClick={onChangeLanguage}
            style={{ 
              backgroundColor: 'var(--surface-primary)', 
              padding: '0.6rem 1.25rem', 
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--white)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            {language.nativeName}
          </button>
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
                  padding: '0.6rem 1.25rem', 
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--white)',
                  fontSize: '1rem',
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
