/**
 * VACFA Translate — Session Store & Meeting Integration Manager
 * 
 * Manages persistent state for conferences, symposiums, and virtual meeting rooms.
 * Synchronizes built-in demo sessions with dynamic administrator-created sessions
 * stored in browser LocalStorage.
 */

import { SESSIONS, LANGUAGES } from './demo-data';
import type { Session, MeetingIntegration, Language } from './types';

const STORAGE_KEY = 'vacfa_custom_sessions';

/**
 * Default core African conference languages (English source, French, Portuguese, Swahili interpretation).
 */
export const CORE_LANGUAGES: Language[] = LANGUAGES.filter((l) =>
  ['en', 'fr', 'pt', 'sw'].includes(l.code)
);

/**
 * Initial sample sessions enriched with Teams, Zoom, and Direct meeting configurations.
 */
const DEFAULT_ENRICHED_SESSIONS: Session[] = SESSIONS.map((session, index) => {
  if (index === 0) {
    return {
      ...session,
      meetingIntegration: {
        platform: 'teams',
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_NzY1Zj.../0?context=%7b%22Tid%22%3a%22vacfa-summit%22%7d',
        meetingId: '482 916 301',
        passcode: 'VACFA2026',
        botEnabled: true,
        botName: 'VACFA AI Interpreter',
        botStatus: 'connected',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'pt', 'sw'],
        audioCaptureMode: 'screen_audio',
        lastStatusMessage: 'Active in Teams meeting. Audio stream connected at 48kHz.',
        connectedAt: '10:00 AM',
      },
    };
  }
  if (index === 1) {
    return {
      ...session,
      meetingIntegration: {
        platform: 'zoom',
        meetingUrl: 'https://zoom.us/j/7310584421?pwd=VACFAWorkshop2026',
        meetingId: '731 058 4421',
        passcode: '891043',
        botEnabled: true,
        botName: 'VACFA AI Interpreter',
        botStatus: 'idle',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'yo'],
        audioCaptureMode: 'simulated_relay',
        lastStatusMessage: 'Bot ready to join Zoom meeting.',
      },
    };
  }
  if (index === 3) {
    return {
      ...session,
      meetingIntegration: {
        platform: 'meet',
        meetingUrl: 'https://meet.google.com/nitag-strength-2026',
        meetingId: 'nitag-strength-2026',
        botEnabled: false,
        botName: 'VACFA AI Interpreter',
        botStatus: 'idle',
        sourceLanguage: 'en',
        targetLanguages: ['fr', 'sw', 'am'],
        lastStatusMessage: 'Bot not dispatched.',
      },
    };
  }
  return session;
});

/**
 * Retrieves all sessions, merging LocalStorage customized sessions with initial defaults.
 * 
 * @returns Array of all active, upcoming, and historic sessions.
 */
export function getAllSessions(): Session[] {
  if (typeof window === 'undefined') {
    return DEFAULT_ENRICHED_SESSIONS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ENRICHED_SESSIONS));
      return DEFAULT_ENRICHED_SESSIONS;
    }
    const parsed: Session[] = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ENRICHED_SESSIONS;
  } catch {
    return DEFAULT_ENRICHED_SESSIONS;
  }
}

/**
 * Saves the session collection back to LocalStorage and notifies listeners.
 */
function persistSessions(sessions: Session[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    // Dispatch storage event for other components on the same page
    window.dispatchEvent(new Event('vacfa_sessions_updated'));
  } catch {
    // Gracefully handle storage quota exceptions
  }
}

/**
 * Finds a specific session by its internal unique identifier.
 * 
 * @param id The session ID to look up (e.g. "session-001").
 * @returns The matching session or undefined if not found.
 */
export function getSessionById(id: string): Session | undefined {
  const all = getAllSessions();
  return all.find((s) => s.id === id);
}

/**
 * Finds a session by its 6-digit public access code.
 * 
 * @param code The 6-digit session code (e.g. "482916").
 * @returns The matching session or undefined.
 */
export function getSessionByCode(code: string): Session | undefined {
  const clean = code.trim().replace(/\s+/g, '');
  const all = getAllSessions();
  return all.find((s) => s.sessionCode.replace(/\s+/g, '') === clean);
}

/**
 * Generates a distinct 6-digit numeric session code not currently in use.
 */
function generateUniqueSessionCode(existing: Session[]): string {
  const codes = new Set(existing.map((s) => s.sessionCode.replace(/\s+/g, '')));
  let attempts = 0;
  while (attempts < 1000) {
    const rand = Math.floor(100000 + Math.random() * 900000).toString();
    if (!codes.has(rand)) return rand;
    attempts++;
  }
  return `${Date.now()}`.slice(-6);
}

/**
 * Allocates a route-safe ID compatible with Next.js static export slots.
 */
function allocateSessionId(existing: Session[]): string {
  const existingIds = new Set(existing.map((s) => s.id));
  for (let i = 1; i <= 30; i++) {
    const candidate = `session-${String(i).padStart(3, '0')}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `session-${Date.now()}`;
}

export interface CreateSessionInput {
  name: string;
  organiser: string;
  date: string;
  time: string;
  description?: string;
  languages?: Language[];
  meetingIntegration?: {
    platform: 'teams' | 'zoom' | 'meet' | 'direct';
    meetingUrl?: string;
    meetingId?: string;
    passcode?: string;
    botEnabled?: boolean;
    botName?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
  };
}

/**
 * Creates and persists a brand-new conference session with optional meeting integration.
 * Defaults to core African languages (English, French, Portuguese, Swahili).
 * 
 * @param input Session parameters submitted by the administrator.
 * @returns The newly created and saved Session.
 */
export function createSession(input: CreateSessionInput): Session {
  const all = getAllSessions();
  const id = allocateSessionId(all);
  const sessionCode = generateUniqueSessionCode(all);

  const targetLanguages = input.meetingIntegration?.targetLanguages || ['fr', 'pt', 'sw'];
  const assignedLanguages = input.languages && input.languages.length > 0
    ? input.languages
    : CORE_LANGUAGES;

  const meetingIntegration: MeetingIntegration | undefined = input.meetingIntegration
    ? {
        platform: input.meetingIntegration.platform,
        meetingUrl: input.meetingIntegration.meetingUrl || '',
        meetingId: input.meetingIntegration.meetingId || '',
        passcode: input.meetingIntegration.passcode || '',
        botEnabled: Boolean(input.meetingIntegration.botEnabled),
        botName: input.meetingIntegration.botName || 'VACFA AI Interpreter',
        botStatus: input.meetingIntegration.botEnabled ? 'idle' : 'disconnected',
        sourceLanguage: input.meetingIntegration.sourceLanguage || 'en',
        targetLanguages: targetLanguages,
        lastStatusMessage: input.meetingIntegration.botEnabled
          ? 'Bot configured and ready to dispatch to meeting.'
          : 'Direct stage without virtual meeting bot.',
      }
    : undefined;

  const newSession: Session = {
    id,
    name: input.name.trim(),
    organiser: input.organiser.trim() || 'VACFA Secretariat',
    date: input.date || new Date().toISOString().split('T')[0],
    time: input.time || '10:00',
    sessionCode,
    languages: assignedLanguages,
    status: 'upcoming',
    delegateCount: 0,
    description: input.description?.trim() || '',
    meetingIntegration,
  };

  const updated = [newSession, ...all];
  persistSessions(updated);
  return newSession;
}

/**
 * Updates an existing session's properties (status, delegate count, meeting parameters).
 * 
 * @param id The ID of the session to update.
 * @param updates Partial properties to apply.
 * @returns The updated Session or null if not found.
 */
export function updateSession(id: string, updates: Partial<Session>): Session | null {
  const all = getAllSessions();
  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const updatedSession = { ...all[index], ...updates };
  all[index] = updatedSession;
  persistSessions(all);
  return updatedSession;
}

/**
 * Updates meeting integration status and bot state for a specific session.
 * 
 * @param sessionId Target session ID.
 * @param integration Partial meeting integration updates.
 * @returns The updated session or null.
 */
export function updateMeetingIntegration(
  sessionId: string,
  integration: Partial<MeetingIntegration>
): Session | null {
  const all = getAllSessions();
  const index = all.findIndex((s) => s.id === sessionId);
  if (index === -1) return null;

  const current = all[index].meetingIntegration || {
    platform: 'teams',
    botEnabled: true,
    botName: 'VACFA AI Interpreter',
    botStatus: 'idle',
    sourceLanguage: 'en',
    targetLanguages: ['fr', 'pt', 'sw'],
  };

  const updatedMeeting: MeetingIntegration = {
    ...current,
    ...integration,
  };

  const updatedSession: Session = {
    ...all[index],
    meetingIntegration: updatedMeeting,
  };

  all[index] = updatedSession;
  persistSessions(all);
  return updatedSession;
}

/**
 * Permanently removes a session from local storage.
 * 
 * @param id Session ID to remove.
 * @returns Boolean indicating whether deletion was successful.
 */
export function deleteSession(id: string): boolean {
  const all = getAllSessions();
  const filtered = all.filter((s) => s.id !== id);
  if (filtered.length === all.length) return false;
  persistSessions(filtered);
  return true;
}
