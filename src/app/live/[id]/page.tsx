import { SESSIONS } from '@/lib/demo-data';
import LiveSessionClient from './LiveSessionClient';

export function generateStaticParams() {
  return SESSIONS.map((s) => ({ id: s.id }));
}

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = SESSIONS.find(s => s.id === resolvedParams.id) || SESSIONS[0];
  
  return <LiveSessionClient session={session} />;
}
