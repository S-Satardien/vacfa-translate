'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavSidebar } from '@/components/ui/NavSidebar';
import type { NavItem } from '@/lib/types';

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: 'home', href: '/dashboard' },
  { id: 'sessions', label: 'Sessions', icon: 'mic', href: '/dashboard/sessions', badge: 1 },
  { id: 'glossary', label: 'Glossary', icon: 'bookOpen', href: '/dashboard/glossary' },
  { id: 'organisers', label: 'Organisers', icon: 'users', href: '/dashboard/organisers' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/dashboard/settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  // Determine active ID based on pathname
  const activeId = ADMIN_NAV_ITEMS.find(item => 
    item.href === pathname || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  )?.id || 'dashboard';

  const handleNavigate = (id: string) => {
    const item = ADMIN_NAV_ITEMS.find(i => i.id === id);
    if (item) {
      router.push(item.href);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--surface-primary)' }}>
      <NavSidebar
        items={ADMIN_NAV_ITEMS}
        activeId={activeId}
        onNavigate={handleNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      
      <main style={{ 
        flex: 1, 
        padding: '2rem', 
        marginLeft: collapsed ? '80px' : '260px',
        transition: 'margin-left 0.3s ease',
        maxWidth: '1200px',
      }}>
        {children}
      </main>
    </div>
  );
}
