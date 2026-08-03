'use client';

import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  variant?: 'live' | 'active' | 'upcoming' | 'ended' | 'category';
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
  id?: string;
}

/**
 * Status badge component.
 */
export const Badge: React.FC<BadgeProps> = ({ 
  variant = 'active', 
  children, 
  pulse = false,
  className = '',
  id
}) => {
  const classNames = [
    styles.badge,
    styles[`variant-${variant}`],
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} id={id}>
      {variant === 'live' && pulse && <span className={styles.pulseDot} />}
      {children}
    </span>
  );
};
