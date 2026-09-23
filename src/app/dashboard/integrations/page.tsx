'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { 
  Bot, Video, Radio, Activity, Zap, 
  ExternalLink, Play, CheckCircle2, ShieldCheck, Headphones 
} from 'lucide-react';
import { getAllSessions, createSession } from '@/lib/session-store';
import type { Session, MeetingPlatform } from '@/lib/types';
import { MeetingBotConsoleModal } from '@/components/admin/MeetingBotConsoleModal';
import styles from './page.module.css';

/**
 * Dedicated Meeting Bots & Integrations Hub
 * 
 * Provides centralized telemetry and dispatch control for virtual AI attendees
 * participating in Microsoft Teams, Zoom, and Google Meet conferences.
 */
export default function IntegrationsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeConsoleSession, setActiveConsoleSession] = useState<Session | null>(null);

  // Quick dispatch state
  const [quickPlatform, setQuickPlatform] = useState<MeetingPlatform>('teams');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickName, setQuickName] = useState('');

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

  const meetingSessions = sessions.filter((s) => s.meetingIntegration?.botEnabled);

  const handleQuickDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;

    const sessionName = quickName.trim() || `Virtual ${quickPlatform.toUpperCase()} Meeting`;
    const newSession = createSession({
      name: sessionName,
      organiser: 'Admin / Live Dispatch',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      description: `Rapid dispatch for ${quickPlatform.toUpperCase()} call`,
      meetingIntegration: {
        platform: quickPlatform,
        meetingUrl: quickUrl.trim(),
        botEnabled: true,
        botName: 'VACFA AI Interpreter',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'pt', 'sw'],
      },
    });

    setQuickUrl('');
    setQuickName('');
    loadSessions();
    setActiveConsoleSession(newSession);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>AI Meeting Bots & Integrations</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--grey-400)', fontSize: '0.95rem' }}>
            Dispatch virtual interpreter bots to Microsoft Teams and Zoom calls with simultaneous audio routing.
          </p>
        </div>
      </header>

      {/* Global Telemetry Metrics */}
      <section className={styles.metricsGrid}>
        <GlassCard className={styles.metricCard} hover>
          <div className={styles.metricIcon} style={{ background: 'rgba(84, 91, 199, 0.15)', color: '#8E96F7' }}>
            <Bot size={24} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Configured Bots</span>
            <span className={styles.metricValue}>{meetingSessions.length}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.metricCard} hover>
          <div className={styles.metricIcon} style={{ background: 'rgba(76, 175, 80, 0.15)', color: 'var(--success)' }}>
            <Radio size={24} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Active Audio Streams</span>
            <span className={styles.metricValue}>
              {meetingSessions.filter((s) => s.meetingIntegration?.botStatus === 'streaming').length}
            </span>
          </div>
        </GlassCard>

        <GlassCard className={styles.metricCard} hover>
          <div className={styles.metricIcon} style={{ background: 'rgba(255, 152, 0, 0.15)', color: 'var(--warning)' }}>
            <Zap size={24} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Average Latency</span>
            <span className={styles.metricValue}>~340 ms</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.metricCard} hover>
          <div className={styles.metricIcon} style={{ background: 'rgba(196, 30, 58, 0.15)', color: 'var(--vacfa-red-light)' }}>
            <Activity size={24} />
          </div>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>Supported Platforms</span>
            <span className={styles.metricValue}>Teams • Zoom • Meet</span>
          </div>
        </GlassCard>
      </section>

      {/* Instant Meeting Bot Dispatch Card */}
      <section className={styles.instantDispatchCard}>
        <div className={styles.cardHeader}>
          <Bot size={22} color="var(--vacfa-red-light)" />
          <h2 className={styles.cardTitle}>Instant AI Meeting Bot Dispatch</h2>
        </div>
        <p style={{ margin: 0, color: 'var(--grey-400)', fontSize: '0.85rem' }}>
          Paste a Microsoft Teams or Zoom meeting join link to instantly dispatch the VACFA AI Interpreter and bridge simultaneous interpretation channels.
        </p>

        <form onSubmit={handleQuickDispatch} className={styles.dispatchForm}>
          <div className={styles.inputRow}>
            <select
              className={styles.platformSelect}
              value={quickPlatform}
              onChange={(e) => setQuickPlatform(e.target.value as MeetingPlatform)}
            >
              <option value="teams">MS Teams</option>
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
            </select>

            <input
              type="url"
              required
              className={styles.urlInput}
              placeholder={quickPlatform === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/...' : 'https://zoom.us/j/...'}
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
            />

            <Button variant="primary" type="submit" icon={<Play size={16} />}>
              Dispatch Bot
            </Button>
          </div>
        </form>
      </section>

      {/* Configured Meeting Bots Table */}
      <GlassCard className={styles.botTableCard}>
        <div className={styles.cardHeader}>
          <Video size={20} color="var(--cream)" />
          <h2 className={styles.cardTitle}>Connected Virtual Attendees</h2>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.botTable}>
            <thead>
              <tr>
                <th>Session Name</th>
                <th>Platform</th>
                <th>Bot Name</th>
                <th>Status</th>
                <th>Channels</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetingSessions.map((session) => {
                const meeting = session.meetingIntegration!;
                return (
                  <tr key={session.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--white)' }}>{session.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--grey-400)', fontFamily: 'monospace' }}>
                        Code: {session.sessionCode}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.platformBadge}`} style={{
                        background: meeting.platform === 'teams' ? 'rgba(84, 91, 199, 0.2)' : 'rgba(45, 140, 255, 0.2)',
                        color: meeting.platform === 'teams' ? '#8E96F7' : '#63AEFF',
                      }}>
                        {meeting.platform}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Bot size={14} color="var(--vacfa-red-light)" />
                        <span>{meeting.botName}</span>
                      </div>
                    </td>
                    <td>
                      <Badge 
                        variant={meeting.botStatus === 'streaming' ? 'live' : meeting.botStatus === 'connected' ? 'active' : 'upcoming'}
                        pulse={meeting.botStatus === 'streaming'}
                      >
                        {meeting.botStatus.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {session.languages.filter((l) => l.code !== 'en').map((lang) => (
                          <span 
                            key={lang.code}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {lang.code.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Bot size={14} />}
                        onClick={() => setActiveConsoleSession(session)}
                      >
                        Bot Console
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {meetingSessions.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--grey-400)', padding: '2rem' }}>
                    No virtual meeting bots dispatched yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Technical Architecture Overview Cards */}
      <section className={styles.archExplainer}>
        <div className={styles.archCard}>
          <h3 className={styles.archTitle}><Headphones size={18} color="var(--vacfa-red-light)" /> Audio Ingestion</h3>
          <p className={styles.archText}>
            Admins capture live Teams or Zoom meeting audio with 48kHz fidelity via browser screen sharing or automated virtual relays with zero desktop plugin requirements.
          </p>
        </div>

        <div className={styles.archCard}>
          <h3 className={styles.archTitle}><Zap size={18} color="var(--warning)" /> Sub-Second AI Translation</h3>
          <p className={styles.archText}>
            Meeting speech is ingested into Gemini 3.5 Flash alongside the VACFA Medical Glossary, translating complex vaccine acronyms (NITAG, NISH, AEFI) in ~340ms.
          </p>
        </div>

        <div className={styles.archCard}>
          <h3 className={styles.archTitle}><ShieldCheck size={18} color="var(--success)" /> Delegate Channel Distribution</h3>
          <p className={styles.archText}>
            Simultaneous interpretation is routed into dedicated French, Portuguese (Lusophone), and Swahili neural audio channels accessible on phones and browsers.
          </p>
        </div>
      </section>

      {/* AI Meeting Bot Management Console Modal */}
      <MeetingBotConsoleModal
        session={activeConsoleSession}
        isOpen={Boolean(activeConsoleSession)}
        onClose={() => setActiveConsoleSession(null)}
        onSessionUpdated={loadSessions}
      />
    </div>
  );
}
