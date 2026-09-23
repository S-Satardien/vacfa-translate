'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Modal } from '@/components/ui/Modal';
import { LANGUAGES } from '@/lib/demo-data';
import { 
  getAllSessions, 
  createSession, 
  deleteSession, 
  CORE_LANGUAGES 
} from '@/lib/session-store';
import type { Session, MeetingPlatform, Language } from '@/lib/types';
import { MeetingBotConsoleModal } from '@/components/admin/MeetingBotConsoleModal';
import { 
  Calendar, Clock, Users, Plus, Bot, Video, 
  ExternalLink, Copy, Check, Trash2, Radio 
} from 'lucide-react';
import styles from './page.module.css';

/**
 * Sessions Manager Page
 * 
 * Provides an administrative console to orchestrate multilingual symposiums,
 * launch dynamic sessions, manage virtual meeting bots (Teams & Zoom),
 * and route simultaneous interpretation channels.
 */
export default function SessionsManager() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | MeetingPlatform>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeConsoleSession, setActiveConsoleSession] = useState<Session | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Form state for creating a new session
  const [formName, setFormName] = useState('');
  const [formOrganiser, setFormOrganiser] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPlatform, setFormPlatform] = useState<MeetingPlatform>('teams');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formMeetingId, setFormMeetingId] = useState('');
  const [formPasscode, setFormPasscode] = useState('');
  const [formBotEnabled, setFormBotEnabled] = useState(true);
  const [formBotName, setFormBotName] = useState('VACFA AI Interpreter');
  const [selectedLangCodes, setSelectedLangCodes] = useState<string[]>(['en', 'fr', 'pt', 'sw']);

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

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const chosenLanguages = LANGUAGES.filter((l) => selectedLangCodes.includes(l.code));
    const targetLangs = selectedLangCodes.filter((c) => c !== 'en');

    const created = createSession({
      name: formName,
      organiser: formOrganiser || 'VACFA Secretariat',
      date: formDate || new Date().toISOString().split('T')[0],
      time: formTime || '10:00',
      description: formDescription,
      languages: chosenLanguages.length > 0 ? chosenLanguages : CORE_LANGUAGES,
      meetingIntegration: {
        platform: formPlatform,
        meetingUrl: formMeetingUrl,
        meetingId: formMeetingId,
        passcode: formPasscode,
        botEnabled: formBotEnabled,
        botName: formBotName,
        sourceLanguage: 'en',
        targetLanguages: targetLangs.length > 0 ? targetLangs : ['fr', 'pt', 'sw'],
      },
    });

    setIsCreateModalOpen(false);
    resetForm();
    loadSessions();

    // Automatically open AI Bot Console for the newly created meeting session
    setActiveConsoleSession(created);
  };

  const resetForm = () => {
    setFormName('');
    setFormOrganiser('');
    setFormDate('');
    setFormTime('');
    setFormDescription('');
    setFormPlatform('teams');
    setFormMeetingUrl('');
    setFormMeetingId('');
    setFormPasscode('');
    setFormBotEnabled(true);
    setFormBotName('VACFA AI Interpreter');
    setSelectedLangCodes(['en', 'fr', 'pt', 'sw']);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this session?')) {
      deleteSession(id);
      loadSessions();
    }
  };

  const handleCopyCode = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    const attendeeUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/join?code=${session.sessionCode}`
      : `https://s-satardien.github.io/vacfa-translate/join?code=${session.sessionCode}`;

    navigator.clipboard.writeText(attendeeUrl);
    setCopiedCodeId(session.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const toggleLanguageSelection = (code: string) => {
    if (code === 'en') return; // Source language remains selected
    setSelectedLangCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const filteredSessions = sessions.filter((session) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      session.name.toLowerCase().includes(query) ||
      session.sessionCode.toLowerCase().includes(query) ||
      session.organiser.toLowerCase().includes(query);

    if (!matchesQuery) return false;

    if (platformFilter === 'all') return true;
    const platform = session.meetingIntegration?.platform || 'direct';
    return platform === platformFilter;
  });

  // Calculate high-level admin metrics
  const totalSessions = sessions.length;
  const liveCount = sessions.filter((s) => s.status === 'live').length;
  const botIntegratedCount = sessions.filter((s) => s.meetingIntegration?.botEnabled).length;
  const totalDelegates = sessions.reduce((acc, curr) => acc + (curr.delegateCount || 0), 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Session Orchestration</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--grey-400)', fontSize: '0.95rem' }}>
            Manage symposiums, dispatch virtual meeting bots, and route simultaneous interpretation.
          </p>
        </div>
        <Button 
          variant="primary" 
          icon={<Plus size={18} />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Create Session
        </Button>
      </header>

      {/* Admin KPI Stats */}
      <section className={styles.statsRow}>
        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}><Calendar size={20} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Sessions</span>
            <span className={styles.statValue}>{totalSessions}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon} style={{ background: 'rgba(76, 175, 80, 0.15)', color: 'var(--success)' }}>
            <Radio size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Live Now</span>
            <span className={styles.statValue}>{liveCount}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon} style={{ background: 'rgba(84, 91, 199, 0.15)', color: '#8E96F7' }}>
            <Bot size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>AI Meeting Bots</span>
            <span className={styles.statValue}>{botIntegratedCount}</span>
          </div>
        </GlassCard>

        <GlassCard className={styles.statCard} hover>
          <div className={styles.statIcon}><Users size={20} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Delegates</span>
            <span className={styles.statValue}>{totalDelegates}</span>
          </div>
        </GlassCard>
      </section>

      {/* Search and Platform Filter Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.searchContainer}>
          <SearchInput
            placeholder="Search by title, organiser, or code..."
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
          />
        </div>

        <div className={styles.platformFilters}>
          <button
            className={`${styles.filterBtn} ${platformFilter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setPlatformFilter('all')}
          >
            All Platforms
          </button>
          <button
            className={`${styles.filterBtn} ${platformFilter === 'teams' ? styles.filterBtnActive : ''}`}
            onClick={() => setPlatformFilter('teams')}
          >
            Microsoft Teams
          </button>
          <button
            className={`${styles.filterBtn} ${platformFilter === 'zoom' ? styles.filterBtnActive : ''}`}
            onClick={() => setPlatformFilter('zoom')}
          >
            Zoom Meetings
          </button>
          <button
            className={`${styles.filterBtn} ${platformFilter === 'meet' ? styles.filterBtnActive : ''}`}
            onClick={() => setPlatformFilter('meet')}
          >
            Google Meet
          </button>
          <button
            className={`${styles.filterBtn} ${platformFilter === 'direct' ? styles.filterBtnActive : ''}`}
            onClick={() => setPlatformFilter('direct')}
          >
            Direct Stage
          </button>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className={styles.sessionsGrid}>
        {filteredSessions.map((session) => {
          const platform = session.meetingIntegration?.platform || 'direct';
          const platformPillClass = {
            teams: styles.teamsPill,
            zoom: styles.zoomPill,
            meet: styles.meetPill,
            direct: styles.directPill,
          }[platform];

          const isCopied = copiedCodeId === session.id;

          return (
            <GlassCard key={session.id} className={styles.sessionCard} hover padding="lg">
              <div className={styles.sessionHeader}>
                <div>
                  <h3 className={styles.sessionName}>{session.name}</h3>
                  <div className={styles.sessionMetaHeader}>
                    <span className={`${styles.platformPill} ${platformPillClass}`}>
                      <Video size={12} /> {platform}
                    </span>
                    <span className={styles.sessionCode}>Code: {session.sessionCode}</span>
                  </div>
                </div>
                {getStatusBadge(session.status)}
              </div>

              {/* Bot Status Strip */}
              {session.meetingIntegration?.botEnabled && (
                <div className={styles.botStatusRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bot size={14} color="var(--vacfa-red-light)" />
                    <span style={{ color: 'var(--cream)', fontWeight: 500 }}>
                      {session.meetingIntegration.botName}
                    </span>
                  </div>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: session.meetingIntegration.botStatus === 'connected' || session.meetingIntegration.botStatus === 'streaming'
                      ? 'var(--success)'
                      : 'var(--grey-400)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {session.meetingIntegration.botStatus}
                  </span>
                </div>
              )}
              
              <div className={styles.sessionDetails}>
                <div className={styles.detailItem}>
                  <Calendar size={15} />
                  <span>{session.date}</span>
                </div>
                <div className={styles.detailItem}>
                  <Clock size={15} />
                  <span>{session.time}</span>
                </div>
                <div className={styles.detailItem}>
                  <Users size={15} />
                  <span>{session.delegateCount} Delegates</span>
                </div>
              </div>

              {/* Interpretation Channels Badges */}
              <div className={styles.sessionLanguages}>
                {session.languages.map((lang) => (
                  <Badge key={lang.code} variant={lang.code === 'en' ? 'category' : 'active'}>
                    {lang.code.toUpperCase()}: {lang.name}
                  </Badge>
                ))}
              </div>

              {/* Card Action Buttons */}
              <div className={styles.cardFooter}>
                <button
                  onClick={(e) => handleCopyCode(session, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isCopied ? 'var(--success)' : 'var(--grey-400)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                  }}
                  title="Copy attendee join link"
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{isCopied ? 'Copied' : 'Invite'}</span>
                </button>

                <div className={styles.cardActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Bot size={15} />}
                    onClick={() => setActiveConsoleSession(session)}
                  >
                    AI Bot Console
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ExternalLink size={14} />}
                    onClick={() => router.push(`/live/${session.id}`)}
                  >
                    Live Stage
                  </Button>

                  {session.id.startsWith('session-0') && Number(session.id.slice(8)) > 5 && (
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--grey-400)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Remove custom session"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          );
        })}
        {filteredSessions.length === 0 && (
          <p style={{ color: 'var(--grey-400)', gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 0' }}>
            No sessions found matching your criteria.
          </p>
        )}
      </div>

      {/* Comprehensive Create Session Wizard Modal */}
      <Modal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        title="Create New Multilingual Session"
        size="lg"
      >
        <form onSubmit={handleCreateSession}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Session Name *</label>
            <input 
              type="text" 
              required
              className={styles.formInput} 
              placeholder="e.g. WHO African Immunization Assembly 2026" 
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Organiser / Host</label>
              <input 
                type="text" 
                className={styles.formInput} 
                placeholder="e.g. Dr. Amina Osei / VACFA" 
                value={formOrganiser}
                onChange={(e) => setFormOrganiser(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Date & Time</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="date" 
                  className={styles.formInput} 
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input 
                  type="time" 
                  className={styles.formInput} 
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          {/* Meeting Platform Selection */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <Video size={16} /> Meeting Platform Integration
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {(['teams', 'zoom', 'meet', 'direct'] as MeetingPlatform[]).map((plt) => (
                <button
                  key={plt}
                  type="button"
                  onClick={() => setFormPlatform(plt)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: `1px solid ${formPlatform === plt ? 'var(--vacfa-red)' : 'var(--surface-elevated)'}`,
                    background: formPlatform === plt ? 'rgba(196, 30, 58, 0.15)' : 'var(--surface-primary)',
                    color: formPlatform === plt ? 'var(--white)' : 'var(--grey-400)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {plt === 'direct' ? 'In-Person' : plt}
                </button>
              ))}
            </div>
          </div>

          {formPlatform !== 'direct' && (
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Meeting URL / Join Link</label>
                <input 
                  type="url" 
                  className={styles.formInput} 
                  placeholder={formPlatform === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/...' : 'https://zoom.us/j/...'} 
                  value={formMeetingUrl}
                  onChange={(e) => setFormMeetingUrl(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Meeting ID & Passcode</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className={styles.formInput} 
                    placeholder="Meeting ID" 
                    value={formMeetingId}
                    onChange={(e) => setFormMeetingId(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input 
                    type="text" 
                    className={styles.formInput} 
                    placeholder="Passcode" 
                    value={formPasscode}
                    onChange={(e) => setFormPasscode(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Virtual AI Meeting Bot Options */}
          {formPlatform !== 'direct' && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={formBotEnabled}
                  onChange={(e) => setFormBotEnabled(e.target.checked)}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--cream)' }}>
                  Invite AI Meeting Bot to join this meeting
                </span>
              </label>

              {formBotEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--grey-400)' }}>Bot Attendee Name:</span>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formBotName}
                    onChange={(e) => setFormBotName(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '0.8rem', width: '220px' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Target Simultaneous Interpretation Channels */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <Radio size={15} /> Active Interpretation Channels (Default Core Languages)
            </label>
            <span className={styles.formHelper}>
              English is the primary source; selected languages will have live neural audio channels and synchronized captions.
            </span>

            <div className={styles.languageCheckboxes}>
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLangCodes.includes(lang.code);
                const isSource = lang.code === 'en';

                return (
                  <label
                    key={lang.code}
                    className={`${styles.checkboxLabel} ${isSelected ? styles.checkboxLabelSelected : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isSource}
                      onChange={() => toggleLanguageSelection(lang.code)}
                    />
                    <span>
                      {lang.name} {isSource && '(Source)'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className={styles.modalFooter}>
            <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create & Open Bot Console
            </Button>
          </div>
        </form>
      </Modal>

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
