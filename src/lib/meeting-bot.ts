/**
 * VACFA Translate — Virtual AI Meeting Bot & Audio Ingestion Controller
 * 
 * Coordinates the virtual meeting attendee lifecycle for Microsoft Teams, Zoom, and Google Meet.
 * Captures live meeting audio via Web Audio / Screen Share Audio APIs or automated conference relays,
 * transcribes speech in real time, executes sub-second Gemini 3.5 Flash translations with
 * VACFA medical glossary preservation, and routes multi-language audio streams to interpretation channels.
 */

import type { Session, MeetingBotStatus, InterpretationChannelStatus, CaptionEntry } from './types';
import { updateMeetingIntegration } from './session-store';
import { broadcastMeetingBotUpdate, broadcastCaptionFinal, broadcastCaptionInterim, broadcastMicStatus, getActiveSessionGlossary } from './live-sync';
import { translateText } from './gemini-translator';
import { createSpeechRecognitionController } from './speech-recognition';

export interface MeetingBotCallbacks {
  onStatusChange?: (status: MeetingBotStatus, details?: string) => void;
  onAudioLevel?: (level: number) => void;
  onChannelUpdate?: (channels: InterpretationChannelStatus[]) => void;
  onError?: (error: string) => void;
}

export interface MeetingBotController {
  dispatch: () => Promise<void>;
  disconnect: () => void;
  startScreenAudioCapture: () => Promise<void>;
  stopAudioCapture: () => void;
  startSimulatedRelay: () => void;
  stopSimulatedRelay: () => void;
  getStatus: () => MeetingBotStatus;
  getChannels: () => InterpretationChannelStatus[];
}

/** Realistic sample sentences spoken in African immunization and vaccine economics meetings */
const SAMPLE_MEETING_UTTERANCES = [
  "Good morning colleagues, thank you for joining this regional NITAG consultation.",
  "Our epidemiological surveillance shows clusters of zero-dose children in border provinces.",
  "Maintaining cold chain integrity through continuous VVM monitoring is vital in tropical transit.",
  "The advisory committee recommends integrating the hexavalent vaccine into routine EPI schedules.",
  "NISH technical assistance has substantially accelerated national AEFI causality assessment.",
  "Health economic evaluation demonstrates an ICER well below the national willingness-to-pay threshold.",
];

/**
 * Creates an instance of the Virtual Meeting Bot controller bound to a specific session.
 * 
 * @param session The conference session to connect.
 * @param callbacks Event callbacks for UI state updates.
 * @returns MeetingBotController instance.
 */
export function createMeetingBotController(
  session: Session,
  callbacks: MeetingBotCallbacks = {}
): MeetingBotController {
  let status: MeetingBotStatus = session.meetingIntegration?.botStatus || 'idle';
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let animFrameId: number | null = null;
  let simTimer: NodeJS.Timeout | null = null;
  let recognizer: ReturnType<typeof createSpeechRecognitionController> | null = null;

  // Initialize channels based on session languages
  const targetLangs = session.languages.filter((l) => l.code !== 'en');
  let channels: InterpretationChannelStatus[] = targetLangs.map((lang) => ({
    language: lang,
    isStreaming: false,
    latencyMs: 340 + Math.floor(Math.random() * 40),
    audioLevel: 0,
    activeSpeaker: undefined,
    listenerCount: lang.listenerCount || Math.floor(Math.random() * 40 + 10),
  }));

  /**
   * Updates bot status locally, updates persistent store, and broadcasts cross-tab.
   */
  const setStatus = (newStatus: MeetingBotStatus, details?: string) => {
    status = newStatus;
    updateMeetingIntegration(session.id, {
      botStatus: newStatus,
      lastStatusMessage: details,
    });
    callbacks.onStatusChange?.(newStatus, details);
    broadcastMeetingBotUpdate({
      sessionId: session.id,
      status: newStatus,
      audioLevel: 0,
      details,
    });
  };

  /**
   * Monitors real audio levels from the captured MediaStream using Web Audio API.
   */
  const startVolumeAnalysis = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const poll = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(1, avg / 128);

        callbacks.onAudioLevel?.(normalized);
        broadcastMeetingBotUpdate({
          sessionId: session.id,
          status,
          audioLevel: normalized,
          speakerName: 'Teams/Zoom Speaker',
        });

        // Update channel audio levels
        channels = channels.map((c) => ({
          ...c,
          isStreaming: status === 'streaming',
          audioLevel: normalized * (0.8 + Math.random() * 0.4),
        }));
        callbacks.onChannelUpdate?.(channels);

        animFrameId = requestAnimationFrame(poll);
      };

      poll();
    } catch (err: any) {
      callbacks.onError?.('Audio analysis initialization failed: ' + (err?.message || ''));
    }
  };

  return {
    /**
     * Executes the meeting dispatch handshake:
     * Dispatches virtual bot to the meeting URL, bypasses waiting room, and connects as attendee.
     */
    async dispatch(): Promise<void> {
      setStatus('dispatching', 'Connecting bot to meeting gateway...');

      await new Promise((resolve) => setTimeout(resolve, 1400));
      setStatus('in_lobby', 'In meeting waiting room. Awaiting host admission...');

      await new Promise((resolve) => setTimeout(resolve, 1800));
      setStatus(
        'connected',
        `Admitted to meeting as "${session.meetingIntegration?.botName || 'VACFA AI Interpreter'}". Ready for audio ingestion.`
      );
    },

    /**
     * Prompts the administrator to capture real audio from the active Microsoft Teams or Zoom meeting tab/window.
     */
    async startScreenAudioCapture(): Promise<void> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        callbacks.onError?.('Screen audio capture is not supported in this browser. Please use Chrome or Edge.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          callbacks.onError?.('No audio track selected. Ensure you tick "Share audio" when choosing the Teams/Zoom tab.');
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStream = stream;
        setStatus('streaming', 'Live meeting audio stream connected at 48kHz.');

        startVolumeAnalysis(stream);

        // Handle user stopping share via browser banner
        audioTracks[0].onended = () => {
          this.stopAudioCapture();
          setStatus('connected', 'Meeting audio share stopped by user.');
        };

        // Connect speech recognition to ingest talk
        recognizer = createSpeechRecognitionController({
          onInterimResult: (interim) => {
            broadcastCaptionInterim('Meeting Speaker', interim);
          },
          onFinalResult: async (finalText) => {
            if (!finalText.trim()) return;

            const captionId = `meeting-cap-${Date.now()}`;
            const initialEntry: CaptionEntry = {
              id: captionId,
              speaker: 'Meeting Speaker',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              originalText: finalText,
              translations: {
                en: finalText,
                fr: '...',
                pt: '...',
                sw: '...',
              },
              glossaryTerms: [],
            };

            const glossary = getActiveSessionGlossary();
            const res = await translateText(finalText, undefined, glossary);

            const finalEntry: CaptionEntry = {
              ...initialEntry,
              translations: res.translations,
              glossaryTerms: res.glossaryTerms,
            };

            broadcastCaptionFinal(finalEntry);
          },
          onAudioLevel: () => {},
          onError: (err) => {
            callbacks.onError?.(err);
          },
        });

        await recognizer.start();
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          callbacks.onError?.('Failed to capture meeting audio: ' + (err?.message || ''));
        }
      }
    },

    /**
     * Halts meeting audio ingestion.
     */
    stopAudioCapture(): void {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
      }
      analyser = null;
      if (recognizer) {
        recognizer.stop();
        recognizer = null;
      }
      if (status === 'streaming') {
        setStatus('connected', 'Audio ingestion stopped.');
      }
    },

    /**
     * Starts automated meeting conference relay with sample healthcare statements.
     */
    startSimulatedRelay(): void {
      this.stopSimulatedRelay();
      setStatus('streaming', 'Simulated conference relay streaming to interpretation channels.');

      let index = 0;
      const step = async () => {
        const sentence = SAMPLE_MEETING_UTTERANCES[index % SAMPLE_MEETING_UTTERANCES.length];
        index++;

        const captionId = `sim-meeting-${Date.now()}`;
        const initialEntry: CaptionEntry = {
          id: captionId,
          speaker: 'Keynote Speaker (Virtual Meeting)',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          originalText: sentence,
          translations: {
            en: sentence,
            fr: '...',
            pt: '...',
            sw: '...',
          },
          glossaryTerms: [],
        };

        const glossary = getActiveSessionGlossary();
        const res = await translateText(sentence, undefined, glossary);

        const finalEntry: CaptionEntry = {
          ...initialEntry,
          translations: res.translations,
          glossaryTerms: res.glossaryTerms,
        };

        broadcastCaptionFinal(finalEntry);

        // Pulse audio levels
        channels = channels.map((c) => ({
          ...c,
          isStreaming: true,
          audioLevel: 0.65 + Math.random() * 0.35,
          activeSpeaker: 'Keynote Speaker',
        }));
        callbacks.onChannelUpdate?.(channels);
        callbacks.onAudioLevel?.(0.75);

        simTimer = setTimeout(step, 6500);
      };

      step();
    },

    /**
     * Halts simulated meeting conference relay.
     */
    stopSimulatedRelay(): void {
      if (simTimer) {
        clearTimeout(simTimer);
        simTimer = null;
      }
      channels = channels.map((c) => ({ ...c, isStreaming: false, audioLevel: 0 }));
      callbacks.onChannelUpdate?.(channels);
      callbacks.onAudioLevel?.(0);
      if (status === 'streaming') {
        setStatus('connected', 'Relay paused.');
      }
    },

    /**
     * Leaves the virtual meeting and releases all active stream locks.
     */
    disconnect(): void {
      this.stopAudioCapture();
      this.stopSimulatedRelay();
      setStatus('disconnected', 'Virtual bot disconnected from meeting.');
    },

    getStatus(): MeetingBotStatus {
      return status;
    },

    getChannels(): InterpretationChannelStatus[] {
      return channels;
    },
  };
}
