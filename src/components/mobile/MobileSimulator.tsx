'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import styles from './MobileSimulator.module.css';

import { SplashScreen } from './screens/SplashScreen';
import { JoinScreen } from './screens/JoinScreen';
import { LanguageScreen } from './screens/LanguageScreen';
import { MobileLiveView } from './screens/MobileLiveView';
import type { Language } from '@/lib/types';

type ScreenType = 'splash' | 'join' | 'language' | 'live';

/**
 * Mobile App Simulator for Phase 5
 * Acts as the container and state manager for the mobile mock flow
 */
export function MobileSimulator() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('splash');
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
  const [captionLanguage, setCaptionLanguage] = useState<Language | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  return (
    <div className={styles.simulatorWrapper} style={{ position: 'relative' }}>
      {mounted && (
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 100,
            background: 'var(--surface-elevated)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--cream)',
            cursor: 'pointer'
          }}
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      )}
      <AnimatePresence mode="wait">
        {currentScreen === 'splash' && (
          <SplashScreen key="splash" onComplete={() => setCurrentScreen('join')} />
        )}
        
        {currentScreen === 'join' && (
          <JoinScreen key="join" onJoin={() => setCurrentScreen('language')} />
        )}
        
        {currentScreen === 'language' && (
          <LanguageScreen 
            key="language" 
            onSelectLanguage={(lang, capLang, showCap) => {
              setSelectedLanguage(lang);
              setCaptionLanguage(capLang);
              setShowCaptions(showCap);
              setCurrentScreen('live');
            }} 
            initialLanguage={selectedLanguage}
            initialCaptionLanguage={captionLanguage}
            initialShowCaptions={showCaptions}
          />
        )}
        
        {currentScreen === 'live' && selectedLanguage && (
          <MobileLiveView 
            key="live" 
            language={selectedLanguage}
            captionLanguage={captionLanguage || selectedLanguage}
            showCaptions={showCaptions}
            onChangeLanguage={() => setCurrentScreen('language')}
            onLeave={() => setCurrentScreen('join')}
            onToggleCaptions={() => setShowCaptions(!showCaptions)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
