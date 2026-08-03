'use client';

import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import styles from './Button.module.css';

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
}

/**
 * Button component with variants and Framer Motion tap animations.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  className = '',
  disabled,
  onClick,
  type = 'button',
  id,
}, ref) => {
  const classNames = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    fullWidth ? styles.fullWidth : '',
    disabled ? styles.disabled : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <motion.button
      ref={ref}
      id={id}
      type={type}
      className={classNames}
      disabled={disabled}
      onClick={onClick}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </motion.button>
  );
});

Button.displayName = 'Button';
