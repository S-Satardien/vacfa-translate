/**
 * VACFA Translate — Zero-Cost Persistent WebSocket Pub/Sub Client (Browser Subscriber)
 *
 * Implements a zero-dependency MQTT 3.1.1 over persistent WSS (`wss://`) subscriber
 * with automatic multi-broker failover (`broker.emqx.io:8084` -> `test.mosquitto.org:8081`),
 * multi-packet frame reassembly, 24s keep-alive pings, and instant retained-history catch-up.
 */

export const REALTIME_WSS_BROKERS: readonly string[] = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

const TOPIC_PREFIX = 'vacfa/rt/9f4a2c7e';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

export interface RealtimeWssSubscriberOptions {
  /** Session slot identifier (e.g. 'session-009'). */
  slot: string;
  /** Invoked whenever a JSON payload arrives on the live or retained history topic. */
  onMessage: (payload: Record<string, unknown>, isRetainedHistory: boolean) => void;
  /** Invoked when persistent WSS connection status changes. */
  onStatusChange?: (connected: boolean, brokerUrl?: string) => void;
}

export interface RealtimeWssSubscriber {
  /** Cleanly closes the persistent WebSocket and stops all reconnect timers. */
  close: () => void;
}

/**
 * Encodes an MQTT 3.1.1 Variable Byte Integer remaining length field.
 */
function encodeRemainingLength(length: number): Uint8Array {
  const bytes: number[] = [];
  let x = length;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encodedByte |= 128;
    bytes.push(encodedByte);
  } while (x > 0);
  return new Uint8Array(bytes);
}

/**
 * Concatenates multiple Uint8Array chunks into a single contiguous buffer.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Encodes a length-prefixed UTF-8 string per MQTT 3.1.1 specification.
 */
function encodeUtf8String(value: string): Uint8Array {
  const encoded = textEncoder.encode(value);
  return concatBytes(new Uint8Array([(encoded.length >> 8) & 0xff, encoded.length & 0xff]), encoded);
}

/**
 * Builds an MQTT 3.1.1 CONNECT packet (Clean Session, 30s Keep-Alive).
 */
function buildConnectPacket(clientId: string): Uint8Array {
  const variableHeader = new Uint8Array([
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
    0x04, // Level 4 (3.1.1)
    0x02, // Clean Session
    0x00, 0x1e, // Keep Alive 30s
  ]);
  const payload = encodeUtf8String(clientId);
  return concatBytes(new Uint8Array([0x10]), encodeRemainingLength(variableHeader.length + payload.length), variableHeader, payload);
}

/**
 * Builds an MQTT 3.1.1 SUBSCRIBE packet for multiple QoS-0 topics.
 */
function buildSubscribePacket(packetId: number, topics: string[]): Uint8Array {
  const variableHeader = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicParts = topics.map((t) => concatBytes(encodeUtf8String(t), new Uint8Array([0x00])));
  const payload = concatBytes(...topicParts);
  return concatBytes(new Uint8Array([0x82]), encodeRemainingLength(variableHeader.length + payload.length), variableHeader, payload);
}

const PINGREQ_PACKET = new Uint8Array([0xc0, 0x00]);

/**
 * Opens a zero-cost persistent WebSocket subscription to the live VACFA translation stream
 * with automatic failover across redundant public WSS brokers.
 */
export function createRealtimeWssSubscriber({
  slot,
  onMessage,
  onStatusChange,
}: RealtimeWssSubscriberOptions): RealtimeWssSubscriber {
  const safeSlot = (slot || 'session-009').replace(/[^a-zA-Z0-9_-]/g, '');
  const liveTopic = `${TOPIC_PREFIX}/${safeSlot}/live`;
  const historyTopic = `${TOPIC_PREFIX}/${safeSlot}/history`;

  let closed = false;
  let brokerIndex = 0;
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let connectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let rxBuffer: Uint8Array = new Uint8Array(0);

  const clearTimers = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const processRxBuffer = (brokerUrl: string) => {
    let offset = 0;
    while (offset + 2 <= rxBuffer.length) {
      const headerByte = rxBuffer[offset];
      const packetType = headerByte >> 4;

      // Decode Variable Byte Integer Remaining Length
      let multiplier = 1;
      let remainingLength = 0;
      let lenIdx = offset + 1;
      let lengthComplete = false;

      while (lenIdx < rxBuffer.length) {
        const encodedByte = rxBuffer[lenIdx++];
        remainingLength += (encodedByte & 0x7f) * multiplier;
        if ((encodedByte & 0x80) === 0) {
          lengthComplete = true;
          break;
        }
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) break;
      }

      if (!lengthComplete) break;
      const packetEnd = lenIdx + remainingLength;
      if (packetEnd > rxBuffer.length) break; // Wait for more bytes

      if (packetType === 2) {
        // CONNACK: subscribe to both live stream and retained catch-up history
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(buildSubscribePacket(1, [liveTopic, historyTopic]));
          onStatusChange?.(true, brokerUrl);

          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(PINGREQ_PACKET);
              } catch {}
            }
          }, 24000);
        }
      } else if (packetType === 3) {
        // PUBLISH packet
        const qos = (headerByte & 0x06) >> 1;
        if (lenIdx + 2 <= packetEnd) {
          const topicLen = (rxBuffer[lenIdx] << 8) | rxBuffer[lenIdx + 1];
          const topicStart = lenIdx + 2;
          const topicEnd = topicStart + topicLen;
          if (topicEnd <= packetEnd) {
            const topic = textDecoder.decode(rxBuffer.subarray(topicStart, topicEnd));
            const payloadStart = topicEnd + (qos > 0 ? 2 : 0);
            if (payloadStart <= packetEnd) {
              const payloadStr = textDecoder.decode(rxBuffer.subarray(payloadStart, packetEnd));
              try {
                const parsed = JSON.parse(payloadStr) as Record<string, unknown>;
                onMessage(parsed, topic === historyTopic);
              } catch {
                // Ignore non-JSON broker frames
              }
            }
          }
        }
      }

      offset = packetEnd;
    }

    rxBuffer = offset > 0 ? rxBuffer.slice(offset) : rxBuffer;
  };

  const connectNext = () => {
    if (closed) return;
    clearTimers();
    rxBuffer = new Uint8Array(0);

    const brokerUrl = REALTIME_WSS_BROKERS[brokerIndex % REALTIME_WSS_BROKERS.length];
    brokerIndex++;

    try {
      const socket = new WebSocket(brokerUrl, ['mqtt']);
      socket.binaryType = 'arraybuffer';
      ws = socket;

      // Fast-failover to next broker if CONNACK doesn't complete within 4s
      connectTimeout = setTimeout(() => {
        if (ws === socket) {
          try {
            socket.close();
          } catch {}
        }
      }, 4000);

      socket.onopen = () => {
        if (closed || ws !== socket) return;
        const clientId = `vacfa-sub-${safeSlot}-${Math.random().toString(36).slice(2, 9)}`;
        socket.send(buildConnectPacket(clientId));
      };

      socket.onmessage = (event) => {
        if (closed || ws !== socket) return;
        const chunk =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : textEncoder.encode(String(event.data));
        rxBuffer = concatBytes(rxBuffer, chunk);
        processRxBuffer(brokerUrl);
      };

      socket.onclose = () => {
        if (ws !== socket) return;
        clearTimers();
        ws = null;
        onStatusChange?.(false);
        if (!closed) {
          reconnectTimer = setTimeout(connectNext, 2000);
        }
      };

      socket.onerror = () => {
        // onclose handles immediate failover to secondary broker
      };
    } catch {
      onStatusChange?.(false);
      if (!closed) {
        reconnectTimer = setTimeout(connectNext, 2500);
      }
    }
  };

  connectNext();

  return {
    close() {
      closed = true;
      clearTimers();
      if (ws) {
        try {
          ws.close();
        } catch {}
        ws = null;
      }
    },
  };
}
