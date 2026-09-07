/**
 * VACFA Translate — Real-Time Live Session Synchronizer
 * 
 * Uses BroadcastChannel and LocalStorage to synchronize live captions, speaker audio state,
 * and dynamically added glossary terms across multiple browser tabs, windows, and devices.
 */

import type { CaptionEntry, GlossaryTerm } from './types';
import { GLOSSARY_TERMS } from './demo-data';

export type LiveSyncMessage =
  | { type: 'CAPTION_FINAL'; payload: CaptionEntry }
  | { type: 'CAPTION_INTERIM'; payload: { speaker: string; text: string } }
  | { type: 'MIC_STATUS'; payload: { isLive: boolean; speaker: string; audioLevel: number } }
  | { type: 'GLOSSARY_ADDED'; payload: GlossaryTerm }
  | { type: 'SESSION_RESET'; payload: { sessionId: string } };

export interface LiveSyncListener {
  onCaptionFinal?: (caption: CaptionEntry) => void;
  onCaptionInterim?: (data: { speaker: string; text: string }) => void;
  onMicStatus?: (data: { isLive: boolean; speaker: string; audioLevel: number }) => void;
  onGlossaryAdded?: (term: GlossaryTerm) => void;
  onSessionReset?: () => void;
}

const CHANNEL_NAME = 'vacfa_live_session_channel';
const GLOSSARY_STORAGE_KEY = 'vacfa_session_glossary_terms';

let channel: BroadcastChannel | null = null;
const listeners = new Set<LiveSyncListener>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<LiveSyncMessage>) => {
      const msg = event.data;
      if (!msg) return;

      listeners.forEach((listener) => {
        switch (msg.type) {
          case 'CAPTION_FINAL':
            listener.onCaptionFinal?.(msg.payload);
            break;
          case 'CAPTION_INTERIM':
            listener.onCaptionInterim?.(msg.payload);
            break;
          case 'MIC_STATUS':
            listener.onMicStatus?.(msg.payload);
            break;
          case 'GLOSSARY_ADDED':
            listener.onGlossaryAdded?.(msg.payload);
            break;
          case 'SESSION_RESET':
            listener.onSessionReset?.();
            break;
        }
      });
    };
  }
  return channel;
}

/**
 * Subscribes a component to real-time session events.
 * 
 * @param listener Callback object.
 * @returns Unsubscribe function.
 */
export function subscribeToLiveSync(listener: LiveSyncListener): () => void {
  getChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Broadcasts a finalized caption entry to all listeners.
 * 
 * @param caption The finalized caption entry with all language translations.
 */
export function broadcastCaptionFinal(caption: CaptionEntry): void {
  const ch = getChannel();
  ch?.postMessage({ type: 'CAPTION_FINAL', payload: caption });
}

/**
 * Broadcasts interim typing text while the presenter is actively speaking.
 * 
 * @param speaker Name of current speaker.
 * @param text Interim transcription text.
 */
export function broadcastCaptionInterim(speaker: string, text: string): void {
  const ch = getChannel();
  ch?.postMessage({ type: 'CAPTION_INTERIM', payload: { speaker, text } });
}

/**
 * Broadcasts microphone active state and live volume levels.
 */
export function broadcastMicStatus(isLive: boolean, speaker: string, audioLevel: number): void {
  const ch = getChannel();
  ch?.postMessage({ type: 'MIC_STATUS', payload: { isLive, speaker, audioLevel } });
}

/**
 * Broadcasts a newly contributed glossary term and persists it to session storage.
 * 
 * @param term The new GlossaryTerm object.
 */
export function broadcastGlossaryAdded(term: GlossaryTerm): void {
  const current = getActiveSessionGlossary();
  const updated = [term, ...current];
  if (typeof window !== 'undefined') {
    localStorage.setItem(GLOSSARY_STORAGE_KEY, JSON.stringify(updated));
  }

  const ch = getChannel();
  ch?.postMessage({ type: 'GLOSSARY_ADDED', payload: term });
}

/**
 * Retrieves the full list of active glossary terms (base terms + delegate contributions).
 */
export function getActiveSessionGlossary(): GlossaryTerm[] {
  if (typeof window === 'undefined') return GLOSSARY_TERMS;
  try {
    const raw = localStorage.getItem(GLOSSARY_STORAGE_KEY);
    if (!raw) return GLOSSARY_TERMS;
    const custom: GlossaryTerm[] = JSON.parse(raw);
    const existingIds = new Set(custom.map((c) => c.id));
    const merged = [...custom, ...GLOSSARY_TERMS.filter((g) => !existingIds.has(g.id))];
    return merged;
  } catch {
    return GLOSSARY_TERMS;
  }
}
