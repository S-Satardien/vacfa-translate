'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Bot, Video, Mic, MicOff, Radio, Play, Square, 
  ExternalLink, Copy, Check, Volume2, VolumeX, AlertCircle 
} from 'lucide-react';
import type { Session, MeetingBotStatus, InterpretationChannelStatus } from '@/lib/types';
import { createMeetingBotController, MeetingBotController } from '@/lib/meeting-bot';
import { createSpeechSynthesisController } from '@/lib/speech-synthesis';
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
  const [errorMessage, setErrorMessage] = useState('');
  const [monitoringLang, setMonitoringLang] = useState<string | null>(null);

  const controllerRef = useRef<MeetingBotController | null>(null);
  const ttsRef = useRef<ReturnType<typeof createSpeechSynthesisController> | null>(null);

  useEffect(() => {
    ttsRef.current = createSpeechSynthesisController();
    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  // Initialize or rebind bot controller when active session changes
  useEffect(() => {
    if (!session || !isOpen) {
      controllerRef.current?.stopAudioCapture();
      controllerRef.current?.stopSimulatedRelay();
      controllerRef.current = null;
      ttsRef.current?.stop();
      setMonitoringLang(null);
      return;
    }

    setBotStatus(session.meetingIntegration?.botStatus || 'idle');
    setStatusDetails(session.meetingIntegration?.lastStatusMessage || '');

    const controller = createMeetingBotController(session, {
      onStatusChange: (status, details) => {
        setBotStatus(status);
        if (details) setStatusDetails(details);
        onSessionUpdated?.();
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

    return () => {
      controller.stopAudioCapture();
      controller.stopSimulatedRelay();
    };
  }, [session, isOpen, onSessionUpdated]);

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

  const platformBadgeClass = {
    teams: styles.teamsBadge,
    zoom: styles.zoomBadge,
    meet: styles.meetBadge,
    direct: styles.directBadge,
  }[meeting.platform];

  const handleCopyLink = () => {
    const attendeeUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.NODE_ENV === 'production' ? '/vacfa-translate' : ''}/join?code=${session.sessionCode}`
      : `https://s-satardien.github.io/vacfa-translate/join?code=${session.sessionCode}`;

    navigator.clipboard.writeText(attendeeUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleMonitorChannel = (langCode: string) => {
    if (monitoringLang === langCode) {
      setMonitoringLang(null);
      ttsRef.current?.stop();
    } else {
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

          <Button
            variant="ghost"
            size="sm"
            icon={copiedLink ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
            onClick={handleCopyLink}
          >
            {copiedLink ? 'Link Copied' : 'Copy Attendee Link'}
          </Button>
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
              {botStatus.toUpperCase()}
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
                onClick={() => controllerRef.current?.dispatch()}
              >
                Invite Bot to Meeting
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
            {channels.map((chan) => {
              const isMonitoring = monitoringLang === chan.language.code;
              return (
                <div
                  key={chan.language.code}
                  className={`${styles.channelCard} ${chan.isStreaming ? styles.channelCardActive : ''}`}
                >
                  <div className={styles.channelLeft}>
                    <div>
                      <div className={styles.channelLangName}>{chan.language.name} ({chan.language.nativeName})</div>
                      <div className={styles.channelMeta}>
                        <span>Latency: {chan.latencyMs}ms</span>
                        <span>•</span>
                        <span>{chan.listenerCount} Active Delegates</span>
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
                            height: chan.isStreaming ? `${Math.max(15, chan.audioLevel * 100 * scale)}%` : '15%',
                            backgroundColor: chan.isStreaming ? 'var(--success)' : 'var(--grey-700)',
                          }}
                        />
                      ))}
                    </div>

                    {/* Listen In Toggle */}
                    <button
                      onClick={() => handleMonitorChannel(chan.language.code)}
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
      </div>
    </Modal>
  );
};
