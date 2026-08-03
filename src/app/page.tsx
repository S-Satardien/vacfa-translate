'use client';

import { useState } from 'react';
import { DeviceToggle } from '@/components/ui/DeviceToggle';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { DeviceMode } from '@/lib/types';

/**
 * Root page — renders either the web portal landing or mobile app simulator
 * based on the device toggle state.
 */
export default function Home() {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('web');

  return (
    <main>
      <DeviceToggle mode={deviceMode} onToggle={setDeviceMode} />

      {deviceMode === 'web' ? (
        <WebPortalShell />
      ) : (
        <MobileAppShell />
      )}
    </main>
  );
}

import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import LanguageTicker from '@/components/landing/LanguageTicker';
import FeatureCards from '@/components/landing/FeatureCards';

/** Web portal landing page */
function WebPortalShell() {
  return (
    <div style={{ paddingBottom: '4rem' }}>
      <Hero />
      <LanguageTicker />
      <HowItWorks />
      <FeatureCards />
    </div>
  );
}

import { MobileSimulator } from '@/components/mobile/MobileSimulator';

/** Mobile app shell — renders the simulator in the phone frame */
function MobileAppShell() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <PhoneFrame>
        <MobileSimulator />
      </PhoneFrame>
    </div>
  );
}
