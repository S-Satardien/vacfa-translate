// User roles
export type UserRole = 'admin' | 'organiser' | 'listener';

// Language definition
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  listenerCount?: number;
}

// Meeting Platforms supported
export type MeetingPlatform = 'teams' | 'zoom' | 'meet' | 'direct';

// Meeting Bot lifecycle states
export type MeetingBotStatus = 'idle' | 'dispatching' | 'in_lobby' | 'connected' | 'streaming' | 'error' | 'disconnected';

// Meeting Integration configuration for sessions
export interface MeetingIntegration {
  platform: MeetingPlatform;
  meetingUrl?: string;
  meetingId?: string;
  passcode?: string;
  botEnabled: boolean;
  botName: string;
  botStatus: MeetingBotStatus;
  sourceLanguage: string;
  targetLanguages: string[]; // language codes for interpretation channels
  audioCaptureMode?: 'screen_audio' | 'simulated_relay' | 'mic_relay';
  lastStatusMessage?: string;
  connectedAt?: string;
}

// Real-time Interpretation Channel Status
export interface InterpretationChannelStatus {
  language: Language;
  isStreaming: boolean;
  latencyMs: number;
  audioLevel: number;
  activeSpeaker?: string;
  listenerCount: number;
}

// Session
export interface Session {
  id: string;
  name: string;
  organiser: string;
  date: string;
  time: string;
  sessionCode: string;
  languages: Language[];
  status: 'upcoming' | 'live' | 'ended';
  delegateCount: number;
  description?: string;
  meetingIntegration?: MeetingIntegration;
}

// Glossary term
export interface GlossaryTerm {
  id: string;
  term: string;
  category: 'immunology' | 'epidemiology' | 'logistics' | 'policy';
  translations: Record<string, string>; // language code -> translation
  phonetic?: string;
  context?: string;
  contributor: 'vacfa' | 'organiser';
  contributorName?: string;
}

// Caption entry
export interface CaptionEntry {
  id: string;
  speaker: string;
  timestamp: string;
  originalText: string;
  translations: Record<string, string>; // language code -> translation
  glossaryTerms?: string[]; // terms that appear in this caption
}

// Translation channel
export interface TranslationChannel {
  language: Language;
  listenerCount: number;
  health: 'healthy' | 'degraded' | 'offline';
  latencyMs: number;
}

// Dashboard stats
export interface DashboardStats {
  activeSessions: number;
  totalDelegates: number;
  activeLanguages: number;
  glossaryTerms: number;
}

// Activity log entry
export interface ActivityEntry {
  id: string;
  type: 'session_created' | 'session_started' | 'session_ended' | 'glossary_updated' | 'organiser_added';
  description: string;
  timestamp: string;
  user: string;
}

// Navigation item
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: string | number;
}

// Mobile screen state
export type MobileScreen = 'splash' | 'onboarding' | 'join' | 'language' | 'live' | 'settings';

// Device mode for the toggle
export type DeviceMode = 'web' | 'mobile';
