'use client';

import React from 'react';
import { LANGUAGES } from '@/lib/demo-data';
import styles from './LanguageTicker.module.css';

/**
 * Continuous scrolling ticker displaying supported languages
 */
export default function LanguageTicker() {
  // Duplicate the array to create a seamless infinite scroll effect
  const tickerItems = [...LANGUAGES, ...LANGUAGES];

  return (
    <div className={styles.tickerContainer} id="language-ticker">
      <div className={styles.overlayLeft}></div>
      <div className={styles.overlayRight}></div>
      
      <div className={styles.tickerTrack}>
        {tickerItems.map((lang, index) => (
          <div key={`${lang.code}-${index}`} className={styles.tickerItem}>
            {lang.nativeName}
          </div>
        ))}
      </div>
    </div>
  );
}
