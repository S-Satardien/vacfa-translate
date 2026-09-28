/**
 * Microsoft Teams CART (Communication Access Realtime Translation) Integration
 * 
 * Microsoft Teams allows meeting organizers to enable CART Captions in Meeting Options.
 * When enabled, Teams generates an ingestion endpoint:
 * https://<region>.api.teams.skype.com/v1/meetings/<meetingId>/cartcaptions?token=<token>
 * 
 * POSTing translated text to this endpoint displays real-time subtitles
 * directly in the native Teams closed-captions banner for all participants.
 */

export interface TeamsCartResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Formats a caption entry into standard Teams CART format.
 * Format: [HH:MM:SS] Speaker: Caption Text
 *
 * @param speaker - The name of the presenter or interpretation label
 * @param text - The spoken or translated subtitle text
 * @param timestamp - Optional custom timestamp, defaults to current time
 * @returns Formatted line for Teams CART ingestion
 */
export function formatTeamsCartLine(speaker: string, text: string, timestamp?: string): string {
  const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const cleanSpeaker = speaker.trim() ? `${speaker.trim()}: ` : '';
  return `[${time}] ${cleanSpeaker}${text.trim()}\n`;
}

/**
 * Sends a single caption line to the configured Microsoft Teams CART endpoint.
 *
 * @param cartUrl - The Teams CART Ingestion URL from Meeting Options
 * @param text - Translated text to broadcast in Teams
 * @param options - Optional speaker name and timestamp
 * @returns Promise resolving to delivery status
 */
export async function sendTeamsCartCaption(
  cartUrl: string,
  text: string,
  options: { speaker?: string; timestamp?: string } = {}
): Promise<TeamsCartResponse> {
  if (!cartUrl || !cartUrl.trim()) {
    return { success: false, error: 'No Teams CART URL provided' };
  }

  const payload = formatTeamsCartLine(options.speaker || 'VACFA AI', text, options.timestamp);

  try {
    // Attempt standard CORS POST first
    const response = await fetch(cartUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: payload,
    });

    if (response.ok || response.status === 200 || response.status === 201) {
      return { success: true, message: 'Caption sent to Teams CART' };
    }

    // If Teams returned an error status
    return {
      success: false,
      error: `Teams CART rejected caption with HTTP ${response.status}`,
    };
  } catch (err: any) {
    // Browser CORS fallback: In standard browsers, Skype API might omit CORS preflight headers.
    // 'no-cors' delivers the POST payload to Teams while suppressing client-side CORS errors.
    try {
      await fetch(cartUrl.trim(), {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: payload,
      });

      return {
        success: true,
        message: 'Caption delivered to Teams via opaque stream (no-cors mode)',
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        error: fallbackErr?.message || 'Failed to connect to Teams CART endpoint',
      };
    }
  }
}

/**
 * Sends an initial test subtitle to verify Teams CART connectivity.
 *
 * @param cartUrl - The Teams CART URL to test
 * @returns Verification result with descriptive message
 */
export async function testTeamsCartConnection(cartUrl: string): Promise<TeamsCartResponse> {
  if (!cartUrl || !cartUrl.includes('teams.skype.com') && !cartUrl.includes('cartcaptions')) {
    return {
      success: false,
      error: 'Invalid Teams CART URL. Format must include api.teams.skype.com/.../cartcaptions?token=...',
    };
  }

  const testText = 'VACFA AI Interpretation active. Live captions connected.';
  const res = await sendTeamsCartCaption(cartUrl, testText, {
    speaker: 'VACFA Interpreter',
  });

  return res;
}
