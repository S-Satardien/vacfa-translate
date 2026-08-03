// User roles
export type UserRole = 'admin' | 'organiser' | 'listener';

// Language definition
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  listenerCount?: number;
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
