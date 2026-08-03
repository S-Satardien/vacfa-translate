'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { DASHBOARD_STATS, SESSIONS, ACTIVITY_FEED } from '@/lib/demo-data';
import { 
  Mic, Users, Languages, BookOpen, 
  Calendar, Clock, Activity, 
  PlayCircle, Edit, CheckCircle, PlusCircle, AlertCircle
} from 'lucide-react';
import styles from './page.module.css';

/**
 * Dashboard Overview Page
 */
export default function DashboardOverview() {
  const activeAndUpcoming = SESSIONS.filter(s => s.status !== 'ended').slice(0, 3);

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
        <h1 className={styles.title}>Overview</h1>
      </header>

      {/* Stats Section */}
      <section className={styles.statsGrid}>
        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <Mic size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Active Sessions</span>
            <span className={styles.statValue}>{DASHBOARD_STATS.activeSessions}</span>
          </div>
        </GlassCard>
        
        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <Users size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Delegates</span>
            <span className={styles.statValue}>{DASHBOARD_STATS.totalDelegates}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}>
            <Languages size={24} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Active Languages</span>
            <span className={styles.statValue}>{DASHBOARD_STATS.activeLanguages}</span>
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
          <h2 className={styles.sectionTitle}>Active & Upcoming Sessions</h2>
          <div className={styles.sessionsList}>
            {activeAndUpcoming.map(session => (
              <GlassCard key={session.id} className={styles.sessionCard} hover padding="lg">
                <div className={styles.sessionHeader}>
                  <div>
                    <h3 className={styles.sessionName}>{session.name}</h3>
                    <span className={styles.sessionCode}>Code: {session.sessionCode}</span>
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
