'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquareText, Radio, BookOpen, Wifi } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import styles from './FeatureCards.module.css';

/**
 * Grid of feature highlights for the platform
 */
export default function FeatureCards() {
  const features = [
    {
      id: 'feature-captions',
      icon: <MessageSquareText size={28} />,
      title: 'Real-time Captions',
      description: 'Low latency, high accuracy text captions synchronized with the speaker.'
    },
    {
      id: 'feature-audio',
      icon: <Radio size={28} />,
      title: 'Audio Translation',
      description: 'Synthesized voices naturally tuned for regional accents and dialects.'
    },
    {
      id: 'feature-glossary',
      icon: <BookOpen size={28} />,
      title: 'Custom Vaccine Glossary',
      description: 'Ensures technical jargon like \'seroconversion\' is translated correctly.'
    },
    {
      id: 'feature-bandwidth',
      icon: <Wifi size={28} />,
      title: 'Low-bandwidth Mode',
      description: 'Optimized delivery that works reliably even on slower 3G mobile networks.'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  } as any;

  return (
    <section className={styles.section} id="features-section">
      <div className="container">
        <motion.div 
          className={styles.header}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className={styles.title}>Engineered for Impact</h2>
          <p className={styles.subtitle}>Purpose-built features for medical conferences across Africa.</p>
        </motion.div>

        <motion.div 
          className={styles.grid}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {features.map(feature => (
            <motion.div key={feature.id} variants={itemVariants} className={styles.cardWrapper}>
              <GlassCard className={styles.card} hover>
                <div className={styles.iconWrap}>
                  {feature.icon}
                </div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDesc}>{feature.description}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
