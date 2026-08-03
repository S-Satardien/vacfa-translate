'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import styles from './Hero.module.css';

/**
 * Hero section for the landing page
 */
export default function Hero() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  } as any;

  return (
    <section className={styles.hero} id="hero-section">
      <div className="container">
        <motion.div 
          className={styles.content}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className={styles.logoWrap}>
            <Image 
              src="/assets/vacfa-logo.png" 
              alt="VACFA Logo" 
              width={200} 
              height={66} 
              style={{ objectFit: 'contain', margin: '0 auto' }}
              priority
            />
          </motion.div>
          
          <motion.h1 variants={itemVariants} className={styles.headline}>
            Every Voice Understood.<br/>Every Delegate Included.
          </motion.h1>
          
          <motion.p variants={itemVariants} className={styles.subheadline}>
            Real-time AI interpretation tuned for African languages and accents. <br className={styles.hideMobile} />
            Conference-grade accuracy, zero friction.
          </motion.p>
          
          <motion.div variants={itemVariants} className={styles.actions}>
            <Link href="/join" passHref legacyBehavior>
              <Button variant="primary" size="lg">Connect to a Session</Button>
            </Link>
            <Button variant="ghost" size="lg" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              Learn More
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
