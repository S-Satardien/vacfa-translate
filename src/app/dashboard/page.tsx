'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DASHBOARD_STATS, ACTIVITY_FEED } from '@/lib/demo-data';
import { getAllSessions } from '@/lib/session-store';
import type { Session } from '@/lib/types';
import { 
  Mic, Users, Languages, BookOpen, 
  Calendar, Clock, Activity, Video, Bot,
  PlayCircle, Edit, CheckCircle, PlusCircle, ArrowRight
} from 'lucide-react';
import styles from './page.module.css';

/**
 * Dashboard Overview Page
 * 
 * High-level administrative pulse showing active symposiums, delegate engagement,
 * connected AI meeting bots, and recent activity logs.
 */
export default function DashboardOverview() {
  const [sessions, setSessions] = useState<Session[]>([]);

  const loadSessions = () => {
    setSessions(getAllSessions());
  };

  useEffect(() => {
    loadSessions();

    const handleUpdate = () => loadSessions();
    window.addEventListener('vacfa_sessions_updated', handleUpdate);
    return () => {
      window.removeEventListener('vacfa_sessions_updated', handleUpdate);
    };
  }, []);

  const activeAndUpcoming = sessions.filter(s => s.status !== 'ended').slice(0, 4);
  const activeSessionsCount = sessions.filter(s => s.status === 'live').length;
  const botCount = sessions.filter(s => s.meetingIntegration?.botEnabled).length;
  const totalDelegates = sessions.reduce((acc, curr) => acc + (curr.delegateCount || 0), 0);

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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'session_started': return <PlayCircle size={16} color="var(--vacfa-red-light)" />;
      case 'session_ended': return <CheckCircle size={16} color="var(--grey-400)" />;
      case 'glossary_updated': return <Edit size={16} color="var(--warning)" />;
      case 'session_created': return <Calendar size={16} color="var(--success)" />;
      case 'organiser_added': return <Users size={16} color="var(--success)" />;
      default: return <Activity size={16} />;
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Overview</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--grey-400)', fontSize: '0.95rem' }}>
            VACFA real-time simultaneous interpretation & meeting intelligence hub.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/dashboard/integrations">
            <Button variant="ghost" icon={<Bot size={16} />}>
              Meeting Bots ({botCount})
            </Button>
          </Link>
          <Link href="/dashboard/sessions">
            <Button variant="primary" icon={<PlusCircle size={16} />}>
              Manage Sessions
            </Button>
          </Link>
        </div>
      </header>

      {/* Stats Section */}
      <section className={styles.statsGrid}>
        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <Mic size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Active Sessions</span>
            <span className={styles.statValue}>{activeSessionsCount || DASHBOARD_STATS.activeSessions}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon} style={{ background: 'rgba(84, 91, 199, 0.15)', color: '#8E96F7' }}>
            <Bot size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>AI Meeting Bots</span>
            <span className={styles.statValue}>{botCount}</span>
          </div>
        </GlassCard>
        
        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <Users size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Delegates</span>
            <span className={styles.statValue}>{totalDelegates || DASHBOARD_STATS.totalDelegates}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <BookOpen size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Glossary Terms</span>
            <span className={styles.statValue}>{DASHBOARD_STATS.glossaryTerms}</span>
          </div>
        </GlassCard>
      </section>

      <div className={styles.contentGrid}>
        {/* Sessions Section */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Active & Upcoming Sessions</h2>
            <Link href="/dashboard/sessions" style={{ fontSize: '0.85rem', color: 'var(--vacfa-red-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div className={styles.sessionsList}>
            {activeAndUpcoming.map(session => (
              <GlassCard key={session.id} className={styles.sessionCard} hover padding="lg">
                <div className={styles.sessionHeader}>
                  <div>
                    <h3 className={styles.sessionName}>{session.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      {session.meetingIntegration?.botEnabled && (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: '#8E96F7', 
                          background: 'rgba(84, 91, 199, 0.15)', 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          textTransform: 'capitalize'
                        }}>
                          <Video size={10} /> {session.meetingIntegration.platform}
                        </span>
                      )}
                      <span className={styles.sessionCode}>Code: {session.sessionCode}</span>
                    </div>
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
              </GlassCard>
            ))}
          </div>
        </section>

        {/* Activity Section */}
        <section>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <GlassCard padding="lg">
            <div className={styles.activityList}>
              {ACTIVITY_FEED.map(activity => (
                <div key={activity.id} className={styles.activityItem}>
                  <div className={styles.activityIcon}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className={styles.activityContent}>
                    <p className={styles.activityDesc}>{activity.description}</p>
                    <div className={styles.activityMeta}>
                      <span>{formatDate(activity.timestamp)}</span>
                      <span>•</span>
                      <span>{activity.user}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </section>
      </div>
    </div>
  );
}
