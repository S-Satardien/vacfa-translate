'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import styles from './JoinScreen.module.css';

/**
 * Props for JoinScreen
 */
interface JoinScreenProps {
  onJoin: (code: string) => void;
}

import { QrCode } from 'lucide-react';

/**
 * Join screen where user enters the 6-digit session code
 */
export function JoinScreen({ onJoin }: JoinScreenProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      onJoin(code);
    }
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Join Session</h2>
        <p className={styles.subtitle}>Enter the 6-digit code provided by the organizer</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <label htmlFor="session-code" className={styles.label}>Session Code</label>
          <input
            id="session-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            className={styles.input}
            placeholder="123456"
            autoComplete="off"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            type="submit" 
            className={styles.button}
            disabled={code.length !== 6}
          >
            Join Session
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--grey-400)', fontSize: '0.875rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--surface-elevated)' }} />
            <span>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--surface-elevated)' }} />
          </div>

          <button 
            type="button" 
            className={`${styles.button} btn-ghost`}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '0.5rem',
              border: '1px solid var(--surface-elevated)',
              backgroundColor: 'transparent'
            }}
            onClick={() => alert('QR Scanner opening...')}
          >
            <QrCode size={20} />
            Scan QR Code
          </button>
        </div>
      </form>
    </motion.div>
  );
}
