'use client';

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import styles from './GlassCard.module.css';

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
}

/**
 * A reusable glassmorphism card component.
 */
export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className = '', 
  hover = false, 
  padding = 'md',
  ...props 
}) => {
  const classNames = [
    styles.glassCard,
    styles[`padding-${padding}`],
    hover ? styles.hoverable : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <motion.div 
      className={classNames}
      {...(hover && { whileHover: { y: -2 } })}
      {...props}
    >
      {children}
    </motion.div>
  );
};
