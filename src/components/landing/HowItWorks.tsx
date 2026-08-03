'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Cpu, Headphones } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import styles from './HowItWorks.module.css';

/**
 * How It Works section displaying the 3-step process
 */
export default function HowItWorks() {
  const steps = [
    {
      id: 'step-1',
      icon: <Mic className={styles.icon} size={32} />,
      title: 'Speaker Presents',
      description: 'The presenter speaks naturally in their preferred language.'
    },
    {
      id: 'step-2',
      icon: <Cpu className={styles.icon} size={32} />,
      title: 'VACFA Engine Processes',
      description: 'Real-time AI interpretation tuned for African languages and accents.'
    },
    {
      id: 'step-3',
      icon: <Headphones className={styles.icon} size={32} />,
      title: 'Delegates Listen',
      description: 'Attendees hear and read the translated content on their devices.'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  } as any;

  const arrowVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } }
  } as any;

  return (
    <section className={styles.section} id="how-it-works">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className={styles.header}
        >
          <h2 className={styles.title}>How It Works</h2>
        </motion.div>

        <motion.div 
          className={styles.grid}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <motion.div variants={cardVariants} className={styles.cardWrapper}>
                <GlassCard className={styles.card} hover>
                  <div className={styles.iconWrapper}>{step.icon}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDesc}>{step.description}</p>
                </GlassCard>
              </motion.div>
              {index < steps.length - 1 && (
                <div className={styles.connector}>
                  <div className={styles.line}></div>
                </div>
              )}
            </React.Fragment>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
