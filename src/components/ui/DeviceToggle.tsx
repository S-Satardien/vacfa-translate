'use client';

import React from 'react';
import { motion } from 'framer-motion';
import styles from './DeviceToggle.module.css';
import { DeviceMode } from '@/lib/types';

interface DeviceToggleProps {
  mode: DeviceMode;
  onToggle: (mode: DeviceMode) => void;
}

/**
 * Floating toggle to switch between web portal and mobile app views.
 */
export const DeviceToggle: React.FC<DeviceToggleProps> = ({ mode, onToggle }) => {
  return (
    <div className={styles.container} id="device-toggle-container">
      <button
        id="device-toggle-web"
        className={`${styles.option} ${mode === 'web' ? styles.active : ''}`}
        onClick={() => onToggle('web')}
      >
        {mode === 'web' && (
          <motion.div
            layoutId="active-pill"
            className={styles.activePill}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <span className={styles.label}>🖥 Web Portal</span>
      </button>
      <button
        id="device-toggle-mobile"
        className={`${styles.option} ${mode === 'mobile' ? styles.active : ''}`}
        onClick={() => onToggle('mobile')}
      >
        {mode === 'mobile' && (
          <motion.div
            layoutId="active-pill"
            className={styles.activePill}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <span className={styles.label}>📱 Mobile App</span>
      </button>
    </div>
  );
};
