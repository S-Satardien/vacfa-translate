'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Check } from 'lucide-react';
import { SESSIONS } from '@/lib/demo-data';
import styles from './LanguageScreen.module.css';
import type { Language } from '@/lib/types';

interface LanguageScreenProps {
  onSelectLanguage: (lang: Language, capLang: Language, showCap: boolean) => void;
  initialLanguage: Language | null;
  initialCaptionLanguage: Language | null;
  initialShowCaptions: boolean;
}

export function LanguageScreen({ 
  onSelectLanguage, 
  initialLanguage, 
  initialCaptionLanguage, 
  initialShowCaptions 
}: LanguageScreenProps) {
  const languages = SESSIONS[0].languages;
  
  const [audioLang, setAudioLang] = useState<Language>(initialLanguage || languages[0]);
  const [capLang, setCapLang] = useState<Language>(initialCaptionLanguage || initialLanguage || languages[0]);
  const [showCaps, setShowCaps] = useState<boolean>(initialShowCaptions);

  const handleContinue = () => {
    onSelectLanguage(audioLang, capLang, showCaps);
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Language Setup</h2>
        <p className={styles.subtitle}>Select your preferred language to listen in</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Audio Language Selection */}
        <div>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--grey-400)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Audio Language
          </h3>
          <div className={styles.list} style={{ gap: '0.5rem' }}>
            {languages.map((lang) => (
              <button
                key={`audio-${lang.code}`}
                className={styles.languageBtn}
                style={{ 
                  borderColor: audioLang.code === lang.code ? 'var(--vacfa-red)' : 'var(--surface-elevated)',
                  backgroundColor: audioLang.code === lang.code ? 'rgba(196, 30, 58, 0.1)' : 'var(--surface-primary)'
                }}
                onClick={() => setAudioLang(lang)}
              >
                <div className={styles.languageInfo}>
                  <span className={styles.nativeName}>{lang.nativeName}</span>
                  <span className={styles.englishName}>{lang.name}</span>
                </div>
                {audioLang.code === lang.code && <Check size={20} color="var(--vacfa-red)" />}
              </button>
            ))}
          </div>
        </div>

        {/* Captions Toggle & Selection */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--grey-400)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Live Captions
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem' }}>
              <input 
                type="checkbox" 
                checked={showCaps} 
                onChange={(e) => setShowCaps(e.target.checked)} 
                style={{ accentColor: 'var(--vacfa-red)', width: '1.25rem', height: '1.25rem' }} 
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--cream)' }}>{showCaps ? 'ON' : 'OFF'}</span>
            </label>
          </div>

          {showCaps && (
            <div className={styles.list} style={{ gap: '0.5rem' }}>
              {languages.map((lang) => (
                <button
                  key={`cap-${lang.code}`}
                  className={styles.languageBtn}
                  style={{ 
                    borderColor: capLang.code === lang.code ? 'var(--vacfa-red)' : 'var(--surface-elevated)',
                    backgroundColor: capLang.code === lang.code ? 'rgba(196, 30, 58, 0.1)' : 'var(--surface-primary)'
                  }}
                  onClick={() => setCapLang(lang)}
                >
                  <div className={styles.languageInfo}>
                    <span className={styles.nativeName}>{lang.nativeName}</span>
                    <span className={styles.englishName}>{lang.name}</span>
                  </div>
                  {capLang.code === lang.code && <Check size={20} color="var(--vacfa-red)" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button 
          onClick={handleContinue}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: 'var(--vacfa-red)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Join Session
        </button>
      </div>
    </motion.div>
  );
}
