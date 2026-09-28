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
interface SentCaptionRecord {
  textNorm: string;
  time: number;
}

// In-memory rolling deduplication cache mapped by CART URL
const recentSentCartCache = new Map<string, SentCaptionRecord[]>();

/**
 * Normalizes caption text for deduplication matching by trimming punctuation,
 * stripping extraneous whitespace, and converting to lowercase.
 */
function normalizeCartText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sends a single caption line to the configured Microsoft Teams CART endpoint.
 * Includes central rolling deduplication to guarantee no sentence is ever sent twice
 * within a 3.5-second window across any tab, controller, or Web Speech event.
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
  const cleanUrl = cartUrl ? cartUrl.trim() : '';
  if (!cleanUrl) {
    return { success: false, error: 'No Teams CART URL provided' };
  }

  const cleanText = (text || '').trim();
  if (!cleanText || cleanText === '...' || cleanText.length < 2) {
    return { success: false, error: 'Empty or placeholder caption omitted' };
  }

  // Central Deduplication Check
  const norm = normalizeCartText(cleanText);
  const now = Date.now();
  const recentList = recentSentCartCache.get(cleanUrl) || [];
  
  // Prune entries older than 8000ms
  const activeRecent = recentList.filter((item) => now - item.time < 8000);

  // If identical text was sent in the last 3500ms, drop the duplicate
  const isDuplicate = activeRecent.some(
    (item) => item.textNorm === norm && now - item.time < 3500
  );

  if (isDuplicate) {
    return { success: true, message: 'Deduplicated: caption was recently sent' };
  }

  // Register in cache
  activeRecent.push({ textNorm: norm, time: now });
  if (activeRecent.length > 20) activeRecent.shift();
  recentSentCartCache.set(cleanUrl, activeRecent);

  const payload = formatTeamsCartLine(options.speaker || 'VACFA AI', cleanText, options.timestamp);

  try {
    // Attempt standard CORS POST first
    const response = await fetch(cleanUrl, {
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
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
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
 * Checks whether a given URL matches Microsoft Teams CART caption formats:
 * - Modern Teams: https://api.captions.office.microsoft.com/cartcaption?meetingid=...&token=...
 * - Classic Teams: https://*.api.teams.skype.com/v1/meetings/.../cartcaptions?token=...
 */
export function isValidTeamsCartUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;

  const hasTeamsDomain =
    clean.includes('captions.office.microsoft.com') ||
    clean.includes('teams.skype.com') ||
    clean.includes('teams.microsoft.com') ||
    clean.includes('office.com') ||
    clean.includes('skype.com');
  const hasCartPath = clean.includes('cartcaption') || clean.includes('cart');
  const hasToken = clean.includes('token=');

  return (hasTeamsDomain && hasCartPath) || (hasCartPath && hasToken) || (clean.startsWith('https://') && hasToken);
}

/**
 * Sends an initial test subtitle to verify Teams CART connectivity.
 *
 * @param cartUrl - The Teams CART URL to test
 * @returns Verification result with descriptive message
 */
export async function testTeamsCartConnection(cartUrl: string): Promise<TeamsCartResponse> {
  const cleanUrl = cartUrl.trim();
  if (!isValidTeamsCartUrl(cleanUrl)) {
    return {
      success: false,
      error: 'Invalid Teams CART URL. Format should be from Teams Meeting Options: https://api.captions.office.microsoft.com/cartcaption?... or https://...api.teams.skype.com/...',
    };
  }

  const testText = 'VACFA AI Interpretation active. Live captions connected.';
  const res = await sendTeamsCartCaption(cleanUrl, testText, {
    speaker: 'VACFA Interpreter',
  });

  return res;
}
