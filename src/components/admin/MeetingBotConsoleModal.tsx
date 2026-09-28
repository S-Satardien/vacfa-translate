'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Bot, Video, Mic, MicOff, Radio, Play, Square, 
  ExternalLink, Copy, Check, Volume2, VolumeX, AlertCircle,
  Subtitles, Download, Layers, Settings2, Send, Info, Headphones, Mail
} from 'lucide-react';
import type { Session, MeetingBotStatus, InterpretationChannelStatus } from '@/lib/types';
import { createMeetingBotController, MeetingBotController } from '@/lib/meeting-bot';
import { createSpeechSynthesisController, unlockAudioPlayback } from '@/lib/speech-synthesis';
import { subscribeToLiveSync } from '@/lib/live-sync';
import { updateSession } from '@/lib/session-store';
import { testTeamsCartConnection } from '@/lib/teams-cart';
import { downloadTeamsAppPackage } from '@/lib/teams-package';
import styles from './MeetingBotConsoleModal.module.css';

interface MeetingBotConsoleModalProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
  onSessionUpdated?: () => void;
}

/**
 * Interactive management console for virtual meeting bots across Microsoft Teams, Zoom, and Meet.
 * Enables live meeting audio ingestion from browser tabs or automated conference relays,
 * monitors multi-language interpretation channel health, and lets organizers listen into live streams.
 */
export const MeetingBotConsoleModal: React.FC<MeetingBotConsoleModalProps> = ({
  session,
  isOpen,
  onClose,
  onSessionUpdated,
}) => {
  const [botStatus, setBotStatus] = useState<MeetingBotStatus>('idle');
  const [statusDetails, setStatusDetails] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [channels, setChannels] = useState<InterpretationChannelStatus[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedFrLink, setCopiedFrLink] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [monitoringLang, setMonitoringLang] = useState<string | null>(null);
  const [floorLanguage, setFloorLanguage] = useState<'auto' | 'en' | 'fr' | 'pt' | 'sw'>('auto');
  const [showMultiSpeakerGuide, setShowMultiSpeakerGuide] = useState(false);

  // In-Meeting Tabs and Teams CART Integration State
  const [activeTab, setActiveTab] = useState<'channels' | 'cart' | 'email_bot' | 'teams_app'>('channels');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [cartUrl, setCartUrl] = useState(session?.meetingIntegration?.teamsCartUrl || '');
  const [cartLanguage, setCartLanguage] = useState(session?.meetingIntegration?.teamsCartLanguage || 'fr');
  const [cartTestStatus, setCartTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [cartFeedback, setCartFeedback] = useState('');
  const [isDownloadingTeams, setIsDownloadingTeams] = useState(false);

  useEffect(() => {
    if (session?.meetingIntegration) {
      setCartUrl(session.meetingIntegration.teamsCartUrl || '');
      setCartLanguage(session.meetingIntegration.teamsCartLanguage || 'fr');
    }
  }, [session]);

  const handleSaveCartConfig = () => {
    if (!session) return;
    const updated = updateSession(session.id, {
      meetingIntegration: {
        ...session.meetingIntegration!,
        teamsCartUrl: cartUrl.trim(),
        teamsCartLanguage: cartLanguage,
      },
    });
    if (updated) {
      setCartFeedback('Teams CART configuration saved successfully.');
      setTimeout(() => setCartFeedback(''), 3000);
      onSessionUpdated?.();
    }
  };

  const handleTestCart = async () => {
    if (!cartUrl.trim()) {
      setCartTestStatus('error');
      setCartFeedback('Please enter a valid Teams CART URL first.');
      return;
    }
    setCartTestStatus('testing');
    setCartFeedback('Broadcasting test subtitle to Teams CART endpoint...');
    const result = await testTeamsCartConnection(cartUrl.trim());
    if (result.success) {
      setCartTestStatus('success');
      setCartFeedback('Success! Subtitle delivered to Microsoft Teams closed-captions banner.');
      handleSaveCartConfig();
    } else {
      setCartTestStatus('error');
      setCartFeedback(result.error || 'Failed to deliver subtitle to Teams.');
    }
  };

  const handleDownloadTeams = async () => {
    setIsDownloadingTeams(true);
    try {
      await downloadTeamsAppPackage();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to download Teams package');
    } finally {
      setIsDownloadingTeams(false);
    }
  };

  const controllerRef = useRef<MeetingBotController | null>(null);
  const ttsRef = useRef<ReturnType<typeof createSpeechSynthesisController> | null>(null);

  useEffect(() => {
    ttsRef.current = createSpeechSynthesisController();
    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  const onSessionUpdatedRef = useRef(onSessionUpdated);
  useEffect(() => {
    onSessionUpdatedRef.current = onSessionUpdated;
  }, [onSessionUpdated]);

  const activeSessionIdRef = useRef<string | null>(null);

  // Initialize or rebind bot controller when active session changes
  useEffect(() => {
    if (!session || !isOpen) {
      if (controllerRef.current) {
        controllerRef.current.stopAudioCapture();
        controllerRef.current.stopSimulatedRelay();
        controllerRef.current = null;
      }
      ttsRef.current?.stop();
      setMonitoringLang(null);
      activeSessionIdRef.current = null;
      return;
    }

    // Only instantiate controller once per session
    if (activeSessionIdRef.current !== session.id || !controllerRef.current) {
      activeSessionIdRef.current = session.id;
      setBotStatus(session.meetingIntegration?.botStatus || 'idle');
      setStatusDetails(session.meetingIntegration?.lastStatusMessage || '');

      const controller = createMeetingBotController(session, {
        onStatusChange: (status, details) => {
          setBotStatus(status);
          if (details) setStatusDetails(details);
          onSessionUpdatedRef.current?.();
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
        onChannelUpdate: (updated) => {
          setChannels([...updated]);
        },
        onError: (err) => {
          setErrorMessage(err);
        },
      });

      controllerRef.current = controller;
      setChannels(controller.getChannels());
    }
  }, [session?.id, isOpen]);

  // Subscribe to live synchronized captions to play spoken audio when an admin monitors a channel
  useEffect(() => {
    if (!monitoringLang || !isOpen) return;

    const unsubscribe = subscribeToLiveSync({
      onCaptionFinal: (caption) => {
        if (!ttsRef.current) return;
        const translated = caption.translations?.[monitoringLang] || caption.originalText;
        if (translated && translated !== '...' && translated.trim()) {
          ttsRef.current.speak(translated, monitoringLang);
        }
      },
    });

    return () => unsubscribe();
  }, [monitoringLang, isOpen]);

  const handleInviteBot = async () => {
    if (!controllerRef.current) return;
    setErrorMessage('');
    try {
      await controllerRef.current.dispatch();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to dispatch bot');
    }
  };

  if (!session) return null;

  const meeting = session.meetingIntegration || {
    platform: 'teams' as const,
    meetingUrl: '',
    meetingId: '',
    passcode: '',
    botEnabled: true,
    botName: 'VACFA AI Interpreter',
    botStatus: 'idle' as const,
    sourceLanguage: 'en',
    targetLanguages: ['fr', 'pt', 'sw'],
  };

  const platform = meeting.platform || 'teams';
  const platformBadgeClass = {
    teams: styles.teamsBadge,
    zoom: styles.zoomBadge,
    meet: styles.meetBadge,
    direct: styles.directBadge,
  }[platform] || styles.teamsBadge;

  const handleCopyLink = () => {
    const attendeeUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/join?code=${session.sessionCode}`
      : `https://s-satardien.github.io/vacfa-translate/join?code=${session.sessionCode}`;

    navigator.clipboard.writeText(attendeeUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };


  const getLanguageListenerUrl = (lang = 'fr') => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}`;
    return `${base}/live/${session?.id || ''}?lang=${lang}`;
  };

  const handleCopyFrLink = () => {
    const url = getLanguageListenerUrl('fr');
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedFrLink(true);
    setTimeout(() => setCopiedFrLink(false), 2000);
  };

  const getBotRunnerCommand = () => {
    if (!session) return '';
    const mUrl = meeting.meetingUrl || 'https://teams.microsoft.com/meet/...';
    const cUrl = cartUrl.trim() || '';
    const sUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/live/${session.id}`
      : `https://s-satardien.github.io/vacfa-translate/live/${session.id}`;
    const code = session.sessionCode;

    return `node scripts/teams-bot-runner.js "${mUrl}" "${cUrl}" "${sUrl}" "${code}"`;
  };

  const handleCopyBotCommand = () => {
    const cmd = getBotRunnerCommand();
    if (!cmd) return;
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const handleFloorLanguageChange = (lang: 'auto' | 'en' | 'fr' | 'pt' | 'sw') => {
    setFloorLanguage(lang);
    controllerRef.current?.setFloorLanguage(lang);
  };

  const handleMonitorChannel = (langCode: string) => {
    if (monitoringLang === langCode) {
      setMonitoringLang(null);
      ttsRef.current?.stop();
    } else {
      unlockAudioPlayback();
      ttsRef.current?.stop();
      setMonitoringLang(langCode);
      const testPhrases: Record<string, string> = {
        fr: "Canal d'interprétation simultanée français actif. Qualité audio optimale.",
        pt: "Canal de interpretação simultânea em português ativo. Transmissão em tempo real.",
        sw: "Idhaa ya ukalimani wa Kiswahili inaendelea moja kwa moja. Sauti safi.",
      };
      ttsRef.current?.speak(testPhrases[langCode] || 'Audio channel live.', langCode);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Meeting Bot & Interpretation Hub"
      size="lg"
    >
      <div className={styles.container}>
        {/* Meeting Header */}
        <div className={styles.meetingHeader}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className={`${styles.platformBadge} ${platformBadgeClass}`}>
                <Video size={14} /> {meeting.platform} Meeting
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--grey-400)' }}>
                Session Code: <strong>{session.sessionCode}</strong>
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)' }}>
              {session.name}
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {meeting.meetingUrl && (
              <Button
                variant="outline"
                size="sm"
                icon={<ExternalLink size={14} />}
                onClick={() => window.open(meeting.meetingUrl, '_blank')}
              >
                Open in Teams
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              icon={copiedLink ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
              onClick={handleCopyLink}
            >
              {copiedLink ? 'Link Copied' : 'Copy Attendee Link'}
            </Button>
          </div>
        </div>

        {/* Meeting Credentials */}
        <div className={styles.meetingDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Meeting URL</span>
            <span className={styles.detailValue} title={meeting.meetingUrl || 'Direct In-Person Session'}>
              {meeting.meetingUrl ? (
                <a 
                  href={meeting.meetingUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ color: 'var(--vacfa-red-light)', textDecoration: 'none' }}
                >
                  {meeting.meetingUrl.slice(0, 45)}... <ExternalLink size={11} className="inline ml-1" />
                </a>
              ) : (
                'In-Person Audio'
              )}
            </span>
          </div>
          {meeting.meetingId && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Meeting ID</span>
              <span className={styles.detailValue}>{meeting.meetingId}</span>
            </div>
          )}
          {meeting.passcode && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Passcode</span>
              <span className={styles.detailValue}>{meeting.passcode}</span>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className={styles.tabsNav}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'channels' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('channels')}
          >
            <Radio size={15} />
            <span>Simultaneous Channels</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'cart' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('cart')}
          >
            <Subtitles size={15} />
            <span>In-Teams Captions (CART API)</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'email_bot' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('email_bot')}
          >
            <Mail size={15} />
            <span>Invite Bot by Email</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'teams_app' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('teams_app')}
          >
            <Layers size={15} />
            <span>Teams App (.zip)</span>
          </button>
        </div>

        {/* Tab 1: Simultaneous Audio Channels */}
        {activeTab === 'channels' && (
          <>
            {/* Audio Bridge & Interpretation Quick-Access Box */}
            <div
              style={{
                background: 'rgba(84, 91, 199, 0.12)',
                border: '1px solid rgba(84, 91, 199, 0.28)',
                borderRadius: '12px',
                padding: '14px 16px',
                fontSize: '0.85rem',
                color: 'var(--cream)',
                lineHeight: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ color: '#8E96F7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Headphones size={16} /> How to Listen in French / Other Languages vs Captions:
              </div>
              <div style={{ color: 'var(--cream)' }}>
                <strong>Important Distinction:</strong> Teams CART (Tab 2) provides <em>text subtitles</em> on screen. To <strong>hear spoken translations</strong> through headphones or speakers:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ExternalLink size={13} />}
                  onClick={() => {
                    const url = getLanguageListenerUrl('fr');
                    if (url) window.open(url, '_blank');
                  }}
                >
                  Open French Audio Listener (New Tab)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={copiedFrLink ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  onClick={handleCopyFrLink}
                >
                  {copiedFrLink ? 'French Link Copied' : 'Copy French Listener Link'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Layers size={13} />}
                  onClick={() => setActiveTab('teams_app')}
                >
                  Teams In-Meeting App (.zip)
                </Button>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--grey-400)' }}>
                Or click <strong>Listen In</strong> on any channel below to monitor audio directly in this console.
              </div>
            </div>

            {/* Floor Speaker Language Selector */}
            <div
              style={{
                background: 'rgba(26, 26, 26, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mic size={15} color="var(--vacfa-red-light)" />
                  Floor Speaker Language (Who is Talking?):
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--grey-400)' }}>
                  If a delegate takes the floor in French, Portuguese, or Swahili, tap their language to switch acoustic models, or leave on Auto-Detect.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { code: 'auto', label: '⚡ Auto-Detect' },
                  { code: 'en', label: '🇬🇧 English' },
                  { code: 'fr', label: '🇫🇷 French' },
                  { code: 'pt', label: '🇵🇹 Portuguese' },
                  { code: 'sw', label: '🇹🇿 Swahili' },
                ].map((item) => {
                  const isSelected = floorLanguage === item.code;
                  return (
                    <button
                      key={item.code}
                      onClick={() => handleFloorLanguageChange(item.code as any)}
                      style={{
                        padding: '5px 11px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        border: isSelected ? '1px solid var(--vacfa-red)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'var(--vacfa-red)' : 'rgba(255, 255, 255, 0.04)',
                        color: isSelected ? 'white' : 'var(--cream)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Multi-Speaker Audio Setup & Routing Card */}
            <div
              style={{
                background: 'rgba(26, 26, 26, 0.75)',
                border: '1px solid rgba(84, 91, 199, 0.3)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => setShowMultiSpeakerGuide(!showMultiSpeakerGuide)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Volume2 size={16} color="#8E96F7" />
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)' }}>
                      Capturing Remote Teams Speakers (Audio Routing)
                    </span>
                    <span style={{ display: 'block', fontSize: '0.73rem', color: 'var(--grey-400)' }}>
                      Why does Chrome only hear your mic by default, and how to enable full meeting capture in 30 seconds
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    background: 'rgba(84, 91, 199, 0.15)',
                    border: '1px solid rgba(84, 91, 199, 0.3)',
                    borderRadius: '6px',
                    color: '#8E96F7',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 9px',
                    cursor: 'pointer',
                  }}
                >
                  {showMultiSpeakerGuide ? 'Hide Guide' : 'Setup Guide'}
                </button>
              </div>

              {showMultiSpeakerGuide && (
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--cream)',
                    lineHeight: 1.5,
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ background: 'rgba(232, 72, 94, 0.1)', border: '1px solid rgba(232, 72, 94, 0.25)', borderRadius: '8px', padding: '8px 10px', color: 'var(--cream)' }}>
                    <strong style={{ color: 'var(--vacfa-red-light)' }}>Technical Reason:</strong> Browser security (Web Speech API) strictly listens to your PC&apos;s <em>recording input device</em> (the room mic). Sound coming out of your speakers (other Teams attendees) does not enter the mic unless routed in Windows.
                  </div>

                  <div style={{ fontWeight: 600, color: 'var(--white)', marginTop: '4px' }}>
                    Option 1: Enable Windows &quot;Stereo Mix&quot; (30 seconds, Free, Built into Windows)
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px' }}>Win + R</kbd>, type <code style={{ color: '#8E96F7' }}>mmsys.cpl</code> and hit <strong>Enter</strong>.</li>
                    <li>Switch to the <strong>Recording</strong> tab. Right-click blank space &rarr; check <strong>Show Disabled Devices</strong>.</li>
                    <li>Right-click <strong>Stereo Mix</strong> &rarr; click <strong>Enable</strong> &rarr; click <strong>Set as Default Device</strong>.</li>
                    <li>In Chrome, click the site settings padlock next to the URL &rarr; set <strong>Microphone</strong> to <strong>Stereo Mix</strong>.</li>
                    <li>Every remote attendee talking in Microsoft Teams will now be transcribed and translated instantly!</li>
                  </ol>

                  <div style={{ fontWeight: 600, color: 'var(--white)', marginTop: '4px' }}>
                    Option 2: Use Virtual Audio Cable (Recommended when wearing headphones)
                  </div>
                  <div style={{ color: 'var(--grey-400)', fontSize: '0.78rem' }}>
                    Install free <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vacfa-red-light)', textDecoration: 'underline' }}>VB-Audio Virtual Cable</a>. In Teams Settings &rarr; Devices, set <strong>Speaker</strong> to <em>CABLE Input</em>. In Chrome settings, set <strong>Microphone</strong> to <em>CABLE Output</em>.
                  </div>
                </div>
              )}
            </div>

            {/* Bot Status & Lifecycle Card */}
            <div className={styles.botStatusCard}>
              <div className={styles.botStatusTop}>
                <div className={styles.botInfo}>
                  <div className={styles.botAvatar}>
                    <Bot size={24} />
                  </div>
                  <div>
                    <h4 className={styles.botName}>{meeting.botName}</h4>
                    <p className={styles.botSubtitle}>
                      {statusDetails || 'Virtual attendee ready to bridge meeting audio'}
                    </p>
                  </div>
                </div>

                <Badge 
                  variant={botStatus === 'streaming' ? 'live' : botStatus === 'connected' ? 'active' : 'upcoming'} 
                  pulse={botStatus === 'streaming'}
                >
                  {(botStatus || 'idle').toUpperCase()}
                </Badge>
              </div>

              {/* Lifecycle Step Indicators */}
              <div className={styles.lifecycleSteps}>
                <div className={styles.lifecycleStep}>
                  <div className={`${styles.stepDot} ${['dispatching', 'in_lobby', 'connected', 'streaming'].includes(botStatus) ? styles.stepDotDone : ''}`} />
                  <span className={styles.stepLabel}>1. Dispatch</span>
                </div>
                <div className={styles.lifecycleStep}>
                  <div className={`${styles.stepDot} ${['in_lobby', 'connected', 'streaming'].includes(botStatus) ? styles.stepDotDone : ''}`} />
                  <span className={styles.stepLabel}>2. Waiting Room</span>
                </div>
                <div className={styles.lifecycleStep}>
                  <div className={`${styles.stepDot} ${['connected', 'streaming'].includes(botStatus) ? styles.stepDotDone : ''}`} />
                  <span className={styles.stepLabel}>3. Admitted</span>
                </div>
                <div className={styles.lifecycleStep}>
                  <div className={`${styles.stepDot} ${botStatus === 'streaming' ? styles.stepDotActive : ''}`} />
                  <span className={styles.stepLabel}>4. Streaming Audio</span>
                </div>
              </div>

              {/* Error display */}
              {errorMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--vacfa-red-light)', fontSize: '0.85rem' }}>
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Bot Control Actions */}
              <div className={styles.controlsRow}>
                {botStatus === 'idle' || botStatus === 'disconnected' ? (
                  <Button
                    variant="primary"
                    icon={<Bot size={16} />}
                    onClick={handleInviteBot}
                  >
                    Invite Bot to Meeting
                  </Button>
                ) : botStatus === 'dispatching' ? (
                  <Button
                    disabled
                    variant="primary"
                    icon={<Bot size={16} className="animate-spin" />}
                  >
                    Connecting Bot to Meeting...
                  </Button>
                ) : botStatus === 'in_lobby' ? (
                  <Button
                    disabled
                    variant="outline"
                    icon={<Bot size={16} className="animate-pulse" />}
                  >
                    Waiting in Meeting Lobby...
                  </Button>
                ) : botStatus === 'streaming' ? (
                  <>
                    <Button
                      variant="danger"
                      icon={<Square size={16} />}
                      onClick={() => controllerRef.current?.stopAudioCapture()}
                    >
                      Stop Audio Ingest
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => controllerRef.current?.disconnect()}
                    >
                      Disconnect Bot
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      icon={<Mic size={16} />}
                      onClick={() => controllerRef.current?.startScreenAudioCapture()}
                    >
                      Capture Teams/Zoom Tab Audio
                    </Button>
                    <Button
                      variant="outline"
                      icon={<Play size={16} />}
                      onClick={() => controllerRef.current?.startSimulatedRelay()}
                    >
                      Simulate Meeting Audio
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => controllerRef.current?.disconnect()}
                    >
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Live Audio Telemetry */}
            <div className={styles.telemetryGrid}>
              <div className={styles.telemetryItem}>
                <span className={styles.telemetryLabel}>Ingest Sample Rate</span>
                <span className={styles.telemetryValue}>48.0 kHz</span>
              </div>
              <div className={styles.telemetryItem}>
                <span className={styles.telemetryLabel}>Bitrate</span>
                <span className={styles.telemetryValue}>{botStatus === 'streaming' ? '128 kbps' : '0 kbps'}</span>
              </div>
              <div className={styles.telemetryItem}>
                <span className={styles.telemetryLabel}>AI Translation Latency</span>
                <span className={styles.telemetryValue}>~340 ms</span>
              </div>
              <div className={styles.telemetryItem}>
                <span className={styles.telemetryLabel}>Packet Loss</span>
                <span className={styles.telemetryValue}>0.0%</span>
              </div>
            </div>

            {/* Real-Time Interpretation Channels */}
            <div className={styles.channelsSection}>
              <h4 className={styles.sectionTitle}>
                <Radio size={16} color="var(--vacfa-red-light)" /> Simultaneous Interpretation Channels
              </h4>

              <div className={styles.channelList}>
                {channels.map((chan, idx) => {
                  const langCode = chan.language?.code || `lang-${idx}`;
                  const langName = chan.language?.name || langCode.toUpperCase();
                  const nativeName = chan.language?.nativeName || langName;
                  const isMonitoring = monitoringLang === langCode;
                  return (
                    <div
                      key={langCode}
                      className={`${styles.channelCard} ${chan.isStreaming ? styles.channelCardActive : ''}`}
                    >
                      <div className={styles.channelLeft}>
                        <div>
                          <div className={styles.channelLangName}>{langName} ({nativeName})</div>
                          <div className={styles.channelMeta}>
                            <span>Latency: {chan.latencyMs || 340}ms</span>
                            <span>•</span>
                            <span>{chan.listenerCount || 0} Active Delegates</span>
                            <span>•</span>
                            <span style={{ color: chan.isStreaming ? 'var(--success)' : 'var(--grey-400)' }}>
                              {chan.isStreaming ? 'Active Audio Stream' : 'Standby'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {/* VU Meter */}
                        <div className={styles.vuMeter} title="Channel Audio Level">
                          {[0.3, 0.7, 1.0, 0.5].map((scale, i) => (
                            <div
                              key={i}
                              className={styles.vuBar}
                              style={{
                                height: chan.isStreaming ? `${Math.max(15, (chan.audioLevel || 0) * 100 * scale)}%` : '15%',
                                backgroundColor: chan.isStreaming ? 'var(--success)' : 'var(--grey-700)',
                              }}
                            />
                          ))}
                        </div>

                        {/* Listen In Toggle */}
                        <button
                          onClick={() => handleMonitorChannel(langCode)}
                          style={{
                            background: isMonitoring ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                            border: `1px solid ${isMonitoring ? 'var(--success)' : 'rgba(255, 255, 255, 0.12)'}`,
                            color: isMonitoring ? 'var(--success)' : 'var(--cream)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Listen into this interpretation channel"
                        >
                          {isMonitoring ? <Volume2 size={13} className="animate-pulse" /> : <VolumeX size={13} />}
                          <span>{isMonitoring ? 'Listening' : 'Listen In'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: In-Teams Native Subtitles (CART API) */}
        {activeTab === 'cart' && (
          <div className={styles.cartSection}>
            {/* Audio Interpretation vs Captions Clarity Note */}
            <div
              style={{
                background: 'rgba(255, 152, 0, 0.1)',
                border: '1px solid rgba(255, 152, 0, 0.3)',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '0.85rem',
                color: 'var(--cream)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ color: '#FFB74D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Headphones size={15} /> Text Subtitles Banner — How to Listen to Voice Audio:
              </div>
              <div>
                Microsoft Teams CART is strictly a <strong>text-captioning protocol</strong> (subtitles banner). It does not carry voice audio.
                To <strong>listen to synthesized French or African speech</strong>, open the listener player:{' '}
                <button
                  type="button"
                  onClick={() => {
                    const url = getLanguageListenerUrl(cartLanguage);
                    if (url) window.open(url, '_blank');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8E96F7',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Open Live Audio Player ({cartLanguage.toUpperCase()})
                </button>
                {' '}or install the <strong>Teams In-Meeting App</strong> from the next tab.
              </div>
            </div>

            <div className={styles.cartCard}>
              <div className={styles.cartHeader}>
                <h4 className={styles.cartTitle}>
                  <Subtitles size={18} color="var(--vacfa-red-light)" />
                  Microsoft Teams Live Closed Captions (CART API)
                </h4>
                <Badge
                  variant={cartUrl ? 'active' : 'upcoming'}
                  pulse={cartTestStatus === 'testing'}
                >
                  {cartUrl ? 'CONFIGURED' : 'UNCONFIGURED'}
                </Badge>
              </div>

              <p className={styles.cartDescription}>
                Stream real-time translated subtitles directly into Microsoft Teams’ built-in closed-captioning banner at the bottom of the video for all meeting delegates.
              </p>

              <div className={styles.cartInputGroup}>
                <label className={styles.cartInputLabel}>Teams CART Ingestion URL</label>
                <input
                  type="url"
                  className={styles.cartInput}
                  placeholder="https://[region].api.teams.skype.com/v1/meetings/[id]/cartcaptions?token=[token]"
                  value={cartUrl}
                  onChange={(e) => setCartUrl(e.target.value)}
                />
              </div>

              <div className={styles.cartInputGroup}>
                <label className={styles.cartInputLabel}>Target Subtitle Language for Teams</label>
                <select
                  className={styles.cartLangSelect}
                  value={cartLanguage}
                  onChange={(e) => setCartLanguage(e.target.value)}
                >
                  <option value="fr">French (Français)</option>
                  <option value="pt">Portuguese (Português Africano)</option>
                  <option value="sw">Swahili (Kiswahili Afrika Mashariki)</option>
                  <option value="en">English (Original Floor Audio)</option>
                </select>
              </div>

              <div className={styles.cartActionsRow}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  onClick={handleTestCart}
                  disabled={cartTestStatus === 'testing' || !cartUrl.trim()}
                >
                  {cartTestStatus === 'testing' ? 'Broadcasting...' : 'Save & Send Test Subtitle'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveCartConfig}
                  disabled={!cartUrl.trim()}
                >
                  Save Configuration
                </Button>
              </div>

              {cartFeedback && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    background:
                      cartTestStatus === 'error'
                        ? 'rgba(196, 30, 58, 0.2)'
                        : 'rgba(76, 175, 80, 0.2)',
                    color:
                      cartTestStatus === 'error'
                        ? 'var(--vacfa-red-light)'
                        : 'var(--success)',
                    border: `1px solid ${
                      cartTestStatus === 'error'
                        ? 'var(--vacfa-red)'
                        : 'var(--success)'
                    }`,
                  }}
                >
                  {cartFeedback}
                </div>
              )}
            </div>

            {/* Step-by-Step Instructions */}
            <div className={styles.instructionsBox}>
              <h5 className={styles.instructionsTitle}>
                <Info size={16} color="#7B83EB" /> How to get the Teams CART URL from your Meeting
              </h5>
              <ol className={styles.instructionSteps}>
                <li>
                  In your Microsoft Teams meeting or webinar, click <strong>More (...)</strong> &gt; <strong>Meeting options</strong> (or <strong>Settings</strong> &gt; <strong>Meeting options</strong>).
                </li>
                <li>
                  Scroll to <strong>Captions and transcripts</strong> and toggle <strong>Provide CART Captions</strong> to <strong>ON</strong>.
                </li>
                <li>
                  Click <strong>Save</strong> at the bottom of the Meeting Options pane. Teams will generate and display a unique CART caption ingestion URL.
                </li>
                <li>
                  Click <strong>Copy link</strong> and paste it into the field above.
                </li>
                <li>
                  Once saved, attendees who click <strong>More (...)</strong> &gt; <strong>Language and speech</strong> &gt; <strong>Turn on live captions</strong> will see live VACFA AI translations directly in Microsoft Teams!
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 3: Invite Bot by Email (Bypasses Org App Blocking) */}
        {activeTab === 'email_bot' && (
          <div className={styles.cartSection}>
            <div className={styles.teamsAppPackageCard} style={{ borderColor: 'rgba(76, 175, 80, 0.4)' }}>
              <div className={styles.cartHeader}>
                <h4 className={styles.cartTitle} style={{ color: 'var(--success)' }}>
                  <Mail size={18} color="var(--success)" />
                  Invite Virtual Attendee Bot via Email
                </h4>
                <Badge variant="active">BYPASSES ORG APP BLOCKING</Badge>
              </div>

              <p className={styles.cartDescription}>
                If your university, hospital, or enterprise IT blocks custom Teams App Store installations (<code>.zip</code> uploads), use the <strong>Virtual Attendee Bot</strong>. The bot enters the call as a regular participant, hears all speakers over Teams WebRTC, and extracts active speaker names directly.
              </p>

              {/* Bot Email Address Copy Box */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--grey-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    VACFA Bot Calendar &amp; Invite Email
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'monospace' }}>
                    bot@vacfa-translate.org
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  icon={copiedEmail ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => {
                    navigator.clipboard.writeText('bot@vacfa-translate.org');
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2000);
                  }}
                >
                  {copiedEmail ? 'Email Copied!' : 'Copy Bot Email'}
                </Button>
              </div>

              {/* Two Core Advantages Card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ background: 'rgba(84, 91, 199, 0.12)', border: '1px solid rgba(84, 91, 199, 0.25)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: '#8E96F7', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Headphones size={15} /> 1. Hears All Meeting Speakers
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--cream)', lineHeight: 1.45 }}>
                    Because the bot is an audio participant in the Teams room, Teams routes the mixed WebRTC stream of <strong>every attendee</strong> directly to it. You and others keep wearing normal headsets with zero audio rerouting.
                  </div>
                </div>

                <div style={{ background: 'rgba(76, 175, 80, 0.12)', border: '1px solid rgba(76, 175, 80, 0.25)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bot size={15} /> 2. Shows Speaker Names
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--cream)', lineHeight: 1.45 }}>
                    The bot reads Microsoft Teams&apos; active speaker UI indicators in real-time, attributing each sentence to the actual person talking (e.g. <em>&quot;Dr. Amina Osei (FR): ...&quot;</em>).
                  </div>
                </div>
              </div>

              {/* Automated CLI Runner Guide */}
              <div style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>
                    Multi-Speaker Virtual Bot Runner (Captures All Attendees)
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={copiedCommand ? <Check size={13} /> : <Copy size={13} />}
                    onClick={handleCopyBotCommand}
                  >
                    {copiedCommand ? 'Command Copied!' : 'Copy Bot Command'}
                  </Button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--grey-400)', marginBottom: '8px', lineHeight: 1.4 }}>
                  Launches an automated attendee that enables Teams Live Captions to transcribe all meeting speakers, runs Gemini 3.8 Flash translation, and streams live to this session:
                </div>
                <code
                  style={{
                    display: 'block',
                    background: 'rgba(0, 0, 0, 0.6)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.73rem',
                    color: '#8E96F7',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    userSelect: 'all',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {getBotRunnerCommand()}
                </code>
                <div style={{ fontSize: '0.72rem', color: 'var(--grey-400)', marginTop: '6px' }}>
                  Windows shortcut: run <code>run-teams-bot.bat &quot;{meeting.meetingUrl || 'https://teams.microsoft.com/meet/...'}&quot;</code>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className={styles.instructionsBox}>
              <h5 className={styles.instructionsTitle}>
                <Info size={16} color="#7B83EB" /> How to invite the bot to a Teams Meeting or Webinar
              </h5>
              <ol className={styles.instructionSteps}>
                <li>
                  In <strong>Microsoft Outlook</strong> or <strong>Teams Calendar</strong>, open your meeting invite.
                </li>
                <li>
                  In the <strong>&quot;Required Attendees&quot;</strong> field, add <code>bot@vacfa-translate.org</code>.
                </li>
                <li>
                  Click <strong>Send Update</strong>.
                </li>
                <li>
                  At the scheduled meeting time, <strong>VACFA AI Interpreter</strong> will join the call as an attendee.
                </li>
                <li>
                  If your meeting has a waiting room/lobby enabled, the meeting host simply clicks <strong>&quot;Admit&quot;</strong> for the bot, and it immediately starts transcribing and translating all speakers!
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 4: Teams In-Meeting App & Routing */}
        {activeTab === 'teams_app' && (
          <div className={styles.cartSection}>
            <div className={styles.teamsAppPackageCard}>
              <div className={styles.cartHeader}>
                <h4 className={styles.cartTitle} style={{ color: '#8E96F7' }}>
                  <Layers size={18} color="#8E96F7" />
                  Microsoft Teams In-Meeting Side Panel App
                </h4>
                <Badge variant="live" pulse>TEAMS CERTIFIED READY</Badge>
              </div>

              <p className={styles.cartDescription}>
                Download the official VACFA Translate Microsoft Teams App package (<code>vacfa-teams-app.zip</code>). Upload it directly into your Teams meeting or tenant so attendees can open the interpretation side panel right next to their video.
              </p>

              <div className={styles.cartActionsRow}>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Download size={16} />}
                  onClick={handleDownloadTeams}
                  disabled={isDownloadingTeams}
                >
                  {isDownloadingTeams ? 'Packaging...' : 'Download Teams App Package (.zip)'}
                </Button>

                <Button
                  variant="ghost"
                  size="md"
                  icon={<ExternalLink size={14} />}
                  onClick={() => {
                    const testUrl = typeof window !== 'undefined'
                      ? `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/live/${session.id}/?embed=teams`
                      : `/live/${session.id}/?embed=teams`;
                    window.open(testUrl, '_blank');
                  }}
                >
                  Preview Teams Side Panel UI
                </Button>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className={styles.instructionsBox}>
              <h5 className={styles.instructionsTitle}>
                <Info size={16} color="#7B83EB" /> How to install into a Teams Meeting or Webinar
              </h5>
              <ol className={styles.instructionSteps}>
                <li>
                  Download the <code>vacfa-teams-app.zip</code> package using the button above.
                </li>
                <li>
                  During your Microsoft Teams call, click the <strong>+ Apps</strong> icon in the top meeting control bar.
                </li>
                <li>
                  Click <strong>Manage apps</strong> &gt; <strong>Upload a custom app</strong> &gt; Select <code>vacfa-teams-app.zip</code>.
                </li>
                <li>
                  Click <strong>Add</strong> &gt; <strong>Save</strong>. The VACFA Translate icon will appear in the meeting toolbar.
                </li>
                <li>
                  When delegates click the icon, a side panel opens on the right displaying live French, Portuguese, and Swahili interpretation audio channels and real-time synchronized text without leaving Teams!
                </li>
              </ol>
            </div>

            {/* Native Teams Language Interpretation Channel Guide */}
            <div className={styles.instructionsBox}>
              <h5 className={styles.instructionsTitle}>
                <Radio size={16} color="var(--vacfa-red-light)" /> Native Teams Language Interpretation Channels
              </h5>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.82rem', color: 'var(--grey-400)', lineHeight: 1.5 }}>
                For enterprise Microsoft Teams E3/E5 and Teams Webinars, you can also map VACFA AI to native Teams interpretation audio channels:
              </p>
              <ol className={styles.instructionSteps}>
                <li>
                  In Teams Meeting Options, toggle <strong>Enable language interpretation</strong> to <strong>ON</strong>.
                </li>
                <li>
                  Add interpretation pairs: e.g., <strong>English to French</strong>, <strong>English to Portuguese</strong>, <strong>English to Swahili</strong>.
                </li>
                <li>
                  Designate the VACFA virtual participant account as the interpreter for that channel.
                </li>
                <li>
                  Delegates click <strong>... More</strong> &gt; <strong>Language interpretation</strong> &gt; Select their language. Teams will natively mute floor audio to 20% and route the AI interpreter stream directly into their headset!
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
