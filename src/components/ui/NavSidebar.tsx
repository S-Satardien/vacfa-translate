'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Home, Mic, BookOpen, Users, Settings, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import styles from './NavSidebar.module.css';
import { NavItem } from '@/lib/types';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface NavSidebarProps {
  items: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  home: <Home size={20} />,
  mic: <Mic size={20} />,
  'book-open': <BookOpen size={20} />,
  users: <Users size={20} />,
  settings: <Settings size={20} />,
};

/**
 * Collapsible sidebar navigation for the web portal.
 */
export const NavSidebar: React.FC<NavSidebarProps> = ({
  items,
  activeId,
  onNavigate,
  collapsed = false,
  onToggleCollapse
}) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };
  return (
    <motion.aside 
      className={styles.sidebar}
      animate={{ width: collapsed ? 80 : 260 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      id="main-nav-sidebar"
    >
      <div className={styles.logoContainer}>
        <div className={styles.logo}>
          <Image 
            src="/assets/vacfa-logo.png" 
            alt="VACFA Logo" 
            width={120} 
            height={40} 
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>
      </div>

      <nav className={styles.nav}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`nav-item-${item.id}`}
            className={`${styles.navItem} ${activeId === item.id ? styles.active : ''}`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.navIcon}>{item.icon && iconMap[item.icon]}</span>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className={styles.navLabel}
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </nav>

      <div className={styles.footer} style={{ flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch', gap: '16px' }}>
        <div className={styles.userSection} style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div className={styles.avatar}>U</div>
          {!collapsed && (
            <motion.div 
              className={styles.userInfo}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className={styles.userName}>User</span>
              <span className={styles.userRole}>Admin</span>
            </motion.div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {mounted && (
            <button 
              className={styles.toggleBtn} 
              onClick={toggleTheme}
              title="Toggle Theme"
              style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}

          {onToggleCollapse && (
            <button 
              className={styles.toggleBtn} 
              onClick={onToggleCollapse}
              id="sidebar-toggle-btn"
              style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
            >
              {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
};
