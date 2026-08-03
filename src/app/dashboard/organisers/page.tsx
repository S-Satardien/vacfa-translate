'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SESSIONS } from '@/lib/demo-data';
import { UserPlus, Mail } from 'lucide-react';
import styles from './page.module.css';

/**
 * Organisers Page
 */
export default function OrganisersPage() {
  // Extract unique organisers and count their sessions
  const organisersMap = SESSIONS.reduce((acc, session) => {
    if (!acc[session.organiser]) {
      acc[session.organiser] = {
        name: session.organiser,
        email: `${session.organiser.toLowerCase().replace(/[^a-z]/g, '')}@vacfa.org`,
        sessions: 0,
      };
    }
    acc[session.organiser].sessions += 1;
    return acc;
  }, {} as Record<string, { name: string; email: string; sessions: number }>);

  const organisersList = Object.values(organisersMap);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Organisers</h1>
        <Button variant="primary" icon={<UserPlus size={18} />}>
          Invite Organiser
        </Button>
      </header>

      <div className={styles.list}>
        {organisersList.map((org) => (
          <GlassCard key={org.name} className={styles.organiserCard}>
            <div className={styles.info}>
              <span className={styles.name}>{org.name}</span>
              <span className={styles.email}>
                <Mail size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                {org.email}
              </span>
            </div>
            <div className={styles.stats}>
              <span>Sessions Hosted:</span>
              <span className={styles.statNumber}>{org.sessions}</span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
