import { SESSIONS } from '@/lib/demo-data';
import LiveSessionClient from './LiveSessionClient';

/**
 * Pre-renders static route parameters for GitHub Pages hosting.
 * Pre-allocates slots session-001 through session-025 so custom administrator-created
 * sessions load with dedicated static HTML pages.
 */
export function generateStaticParams() {
  const existingIds = SESSIONS.map((s) => s.id);
  const slots = Array.from({ length: 25 }, (_, i) => `session-${String(i + 1).padStart(3, '0')}`);
  const combined = Array.from(new Set([...existingIds, ...slots]));
  return combined.map((id) => ({ id }));
}

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const initialSession = SESSIONS.find(s => s.id === resolvedParams.id) || SESSIONS[0];
  
  return <LiveSessionClient session={initialSession} sessionId={resolvedParams.id} />;
}
