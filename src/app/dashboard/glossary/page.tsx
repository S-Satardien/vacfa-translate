'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Modal } from '@/components/ui/Modal';
import { GLOSSARY_TERMS } from '@/lib/demo-data';
import { Plus, Info } from 'lucide-react';
import styles from './page.module.css';

/**
 * Glossary Manager Page
 */
export default function GlossaryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredTerms = GLOSSARY_TERMS.filter((item) =>
    item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.context?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Vaccine Glossary</h1>
          <p className={styles.subtitle}>
            Terms are globally accessible to the AI engine to improve translation accuracy of medical jargon.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
          Add Term
        </Button>
      </header>

      <div className={styles.toolbar}>
        <SearchInput
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          placeholder="Search glossary terms..."
        />
      </div>

      <div className={styles.grid}>
        {filteredTerms.map((item) => (
          <GlassCard key={item.id} className={styles.termCard}>
            <div className={styles.termHeader}>
              <div>
                <h3 className={styles.term}>{item.term}</h3>
                {item.phonetic && <div className={styles.phonetic}>/{item.phonetic}/</div>}
              </div>
              <Badge variant="category">
                {item.category}
              </Badge>
            </div>
            
            <div className={styles.context}>
              {item.context}
            </div>

            <div className={styles.translations}>
              {Object.entries(item.translations).map(([lang, text]) => (
                <div key={lang} className={styles.translationItem}>
                  <span className={styles.lang}>{lang}:</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <div className={styles.footer}>
              <Info size={12} />
              <span>Added by {item.contributor === 'vacfa' ? 'VACFA' : item.contributorName || 'Organiser'}</span>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Add Glossary Term"
      >
        <div className={styles.modalContent}>
          <p style={{ color: 'var(--grey-400)', fontSize: '0.9rem' }}>
            Form placeholder. In a real app, this would contain fields for the term, phonetic spelling, category, definition, and translations.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Save Term</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
