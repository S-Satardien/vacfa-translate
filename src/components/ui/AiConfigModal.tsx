'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Sparkles, Key, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey, getStoredModel, setStoredModel } from '@/lib/gemini-translator';

interface AiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

/**
 * Modal to configure Google Gemini API integration and model settings.
 */
export const AiConfigModal: React.FC<AiConfigModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setModel(getStoredModel());
      setTestStatus('idle');
      setErrorMessage('');
    }
  }, [isOpen]);

  const handleSave = () => {
    setStoredApiKey(apiKey);
    setStoredModel(model);
    onConfigSaved?.();
    onClose();
  };

  const handleClear = () => {
    setApiKey('');
    setStoredApiKey('');
    setTestStatus('idle');
    setErrorMessage('');
    onConfigSaved?.();
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestStatus('error');
      setErrorMessage('Please enter an API key first.');
      return;
    }

    setTestStatus('testing');
    setErrorMessage('');

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hello, respond with the single word: OK' }] }],
        }),
      });

      if (!res.ok) {
        throw new Error(`Invalid API key or model unavailable (HTTP ${res.status})`);
      }

      setTestStatus('success');
    } catch (err: any) {
      setTestStatus('error');
      setErrorMessage(err?.message || 'Connection failed.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Engine Configuration" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem',
          borderRadius: '12px',
          background: 'rgba(196, 30, 58, 0.08)',
          border: '1px solid rgba(196, 30, 58, 0.2)'
        }}>
          <Sparkles size={22} color="var(--vacfa-red-light)" />
          <div style={{ fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--cream)' }}>
            <strong>VACFA AI Engine:</strong> Powered by Google Gemini Flash with live African vaccine glossary context.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--grey-400)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Key size={14} /> Google Gemini API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestStatus('idle');
            }}
            placeholder="AIzaSy..."
            style={{
              width: '100%',
              background: 'var(--surface-primary)',
              border: '1px solid var(--surface-elevated)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              color: 'var(--cream)',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--grey-400)' }}>
            Get a free key from Google AI Studio (aistudio.google.com). Leave blank to use the built-in offline smart medical engine.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--grey-400)' }}>Gemini Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--surface-primary)',
              border: '1px solid var(--surface-elevated)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              color: 'var(--cream)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          >
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (State-of-the-Art Multilingual)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-flash-latest">Gemini Flash (Latest)</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          </select>
        </div>

        {testStatus === 'testing' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cream)', fontSize: '0.85rem' }}>
            <RefreshCw size={16} className="animate-spin" /> Testing connection to Gemini API...
          </div>
        )}

        {testStatus === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.85rem' }}>
            <CheckCircle size={16} /> API Key is valid and connected to Gemini!
          </div>
        )}

        {testStatus === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--vacfa-red-light)', fontSize: '0.85rem' }}>
            <AlertCircle size={16} /> {errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestKey}
              disabled={testStatus === 'testing' || !apiKey.trim()}
            >
              Test Key
            </Button>
            {apiKey && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Reset to Demo
              </Button>
            )}
          </div>

          <Button variant="primary" size="md" onClick={handleSave}>
            Save Configuration
          </Button>
        </div>
      </div>
    </Modal>
  );
};
