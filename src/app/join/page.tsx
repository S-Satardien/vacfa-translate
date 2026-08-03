'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { SESSIONS } from '@/lib/demo-data';
import styles from './join.module.css';

/**
 * Join Session page — delegates enter a 6-digit session code
 * to connect to a live translation session.
 */
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  /** Handle code input — digits only, max 6 */
  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError('');
  };

  /** Look up the session by code and navigate */
  const handleConnect = () => {
    if (code.length !== 6) {
      setError('Please enter a valid 6-digit session code.');
      return;
    }

    const session = SESSIONS.find(s => s.sessionCode === code);
    if (!session) {
      setError('Session not found. Please check the code and try again.');
      return;
    }

    if (session.status === 'ended') {
      setError('This session has already ended.');
      return;
    }

    router.push(`/live/${session.id}`);
  };

  /** Allow Enter key to submit */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  return (
    <div className={styles.container}>
      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className={styles.logo}>
          <Image
            src={`${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/assets/vacfa-logo.png`}
            alt="VACFA Logo"
            width={140}
            height={46}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        <h1 className={styles.title}>Connect to a Session</h1>
        <p className={styles.subtitle}>
          Enter the 6-digit code provided by your session organiser to start listening with real-time translation.
        </p>

        <div className={styles.inputGroup}>
          <input
            id="session-code-input"
            type="text"
            inputMode="numeric"
            className={styles.codeInput}
            placeholder="000000"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={6}
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && (
          <motion.p
            className={styles.error}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.p>
        )}

        <button
          className={styles.connectBtn}
          onClick={handleConnect}
          disabled={code.length !== 6}
          id="connect-session-btn"
        >
          Connect
          <ArrowRight size={18} />
        </button>

        <div className={styles.divider}>or</div>

        <p style={{ color: 'var(--grey-400)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Try a demo session with code <strong style={{ color: 'var(--cream)', cursor: 'pointer' }} onClick={() => handleCodeChange('482916')}>482916</strong>
        </p>

        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={14} />
          Back to home
        </Link>
      </motion.div>
    </div>
  );
}
