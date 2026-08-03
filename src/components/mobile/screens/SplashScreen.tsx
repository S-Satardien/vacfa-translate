'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import styles from './SplashScreen.module.css';

/**
 * Props for SplashScreen
 */
interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Animated splash screen for the mobile simulator
 */
export function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      <div className={styles.glowBox} />
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
        <motion.img 
          src="/assets/vacfa-logo.png" 
          alt="VACFA Logo" 
          style={{ width: '140px', height: 'auto', marginBottom: '16px' }}
          initial={{ y: -50, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.2 
          }}
        />
        <motion.p 
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          Translate
        </motion.p>
      </div>

      {/* Floating particles */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: '4px',
            height: '4px',
            backgroundColor: 'var(--vacfa-red)',
            borderRadius: '50%',
            top: `${30 + i * 20}%`,
            left: `${20 + (i % 2) * 60}%`,
          }}
          animate={{
            y: [-20, 20],
            opacity: [0.2, 0.8, 0.2]
          }}
          transition={{
            duration: 2 + i,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          }}
        />
      ))}
    </motion.div>
  );
}
