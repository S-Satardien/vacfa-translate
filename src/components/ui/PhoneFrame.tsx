'use client';

import React from 'react';
import styles from './PhoneFrame.module.css';

interface PhoneFrameProps {
  children: React.ReactNode;
}

/**
 * A phone bezel simulator that wraps mobile app screens.
 */
export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children }) => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.bezel} id="phone-frame-bezel">
        <div className={styles.notch}>
          <div className={styles.camera} />
        </div>
        <div className={styles.statusBar}>
          <div className={styles.time}>9:41</div>
          <div className={styles.icons}>
            <span className={styles.signal}>📶</span>
            <span className={styles.battery}>🔋</span>
          </div>
        </div>
        <div className={styles.screen}>
          {children}
        </div>
      </div>
    </div>
  );
};
