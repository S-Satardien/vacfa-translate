'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Modal } from '@/components/ui/Modal';
import { SESSIONS } from '@/lib/demo-data';
import { Calendar, Clock, Users, Plus, Settings2 } from 'lucide-react';
import styles from './page.module.css';

/**
 * Sessions Manager Page
 */
export default function SessionsManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <Badge variant="live" pulse>LIVE</Badge>;
      case 'upcoming':
        return <Badge variant="upcoming">Upcoming</Badge>;
      case 'ended':
        return <Badge variant="ended">Ended</Badge>;
      default:
        return null;
    }
  };

  const filteredSessions = SESSIONS.filter(session => {
    const query = searchQuery.toLowerCase();
    return (
      session.name.toLowerCase().includes(query) ||
      session.sessionCode.toLowerCase().includes(query)
    );
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Sessions</h1>
        <Button 
          variant="primary" 
          icon={<Plus size={18} />}
          onClick={() => setIsModalOpen(true)}
        >
          Create Session
        </Button>
      </header>

      <div className={styles.searchContainer}>
        <SearchInput
          placeholder="Search by name or code..."
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      </div>

      <div className={styles.sessionsGrid}>
        {filteredSessions.map(session => (
          <GlassCard key={session.id} className={styles.sessionCard} hover padding="lg">
            <div className={styles.sessionHeader}>
              <div>
                <h3 className={styles.sessionName}>{session.name}</h3>
                <span className={styles.sessionCode}>Session Code: {session.sessionCode}</span>
              </div>
              {getStatusBadge(session.status)}
            </div>
            
            <div className={styles.sessionDetails}>
              <div className={styles.detailItem}>
                <Calendar size={16} />
                <span>{session.date}</span>
              </div>
              <div className={styles.detailItem}>
                <Clock size={16} />
                <span>{session.time}</span>
              </div>
              <div className={styles.detailItem}>
                <Users size={16} />
                <span>{session.delegateCount} Delegates</span>
              </div>
            </div>

            <div className={styles.sessionLanguages}>
              {session.languages.map(lang => (
                <Badge key={lang.code} variant="active">{lang.name}</Badge>
              ))}
            </div>

            <div className={styles.cardFooter}>
              <Button variant="ghost" size="sm" icon={<Settings2 size={16} />}>
                Manage
              </Button>
            </div>
          </GlassCard>
        ))}
        {filteredSessions.length === 0 && (
          <p style={{ color: 'var(--grey-400)', gridColumn: '1 / -1' }}>No sessions found.</p>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Create New Session"
      >
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Session Name</label>
          <input type="text" className={styles.formInput} placeholder="e.g. Immunization Summit 2026" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Date</label>
          <input type="date" className={styles.formInput} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Time</label>
          <input type="time" className={styles.formInput} />
        </div>
        
        <div className={styles.modalFooter}>
          <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setIsModalOpen(false)}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
