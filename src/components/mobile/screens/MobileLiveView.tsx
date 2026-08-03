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
                  {captionLanguage.code === 'en' ? cap.originalText : (cap.translatedText || cap.originalText)}
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

      <div className={styles.bottomBar} style={{ flexDirection: 'column', gap: '0.75rem', padding: '1rem', alignItems: 'stretch' }}>
        {/* Audio Language */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--grey-400)' }}>Audio</span>
          <button 
            onClick={onChangeLanguage}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              backgroundColor: 'var(--surface-elevated)', 
              padding: '0.4rem 0.75rem', 
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--cream)',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            <Globe size={14} />
            <span>{language.nativeName}</span>
          </button>
        </div>

        {/* Captions Toggle & Language */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--grey-400)' }}>Captions</span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {showCaptions && (
              <button 
                onClick={onChangeLanguage}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  backgroundColor: 'var(--surface-elevated)', 
                  padding: '0.4rem 0.75rem', 
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--cream)',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <span>{captionLanguage.nativeName}</span>
              </button>
            )}
            
            <button
              onClick={onToggleCaptions}
              style={{
                width: '40px',
                height: '24px',
                borderRadius: '12px',
                backgroundColor: showCaptions ? 'var(--vacfa-red)' : 'var(--surface-elevated)',
                border: 'none',
                position: 'relative',
                transition: 'background-color 0.2s',
                cursor: 'pointer'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: showCaptions ? '18px' : '2px',
                width: '20px',
                height: '20px',
                borderRadius: '10px',
                backgroundColor: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
