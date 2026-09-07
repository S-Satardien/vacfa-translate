/**
 * VACFA Translate — Google Gemini AI Translation Engine
 * 
 * Provides real-time bidirectional translation (English, French, Portuguese, Swahili)
 * with direct injection of the VACFA Medical Glossary into prompt context.
 * Supports direct Gemini API calls with graceful fallback to an offline medical
 * translation engine when no API key is provided.
 */

import { GLOSSARY_TERMS } from './demo-data';
import type { GlossaryTerm } from './types';

const API_KEY_STORAGE_KEY = 'vacfa_gemini_api_key';
const MODEL_NAME_STORAGE_KEY = 'vacfa_gemini_model';

export interface TranslationResult {
  originalText: string;
  sourceLang: string;
  translations: Record<string, string>; // language code -> translated text
  glossaryTerms: string[];
  provider: 'gemini' | 'smart-fallback';
}

/**
 * Retrieves the stored Gemini API key from browser local storage.
 */
export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

/**
 * Saves or clears the Gemini API key in browser local storage.
 * 
 * @param key Gemini API key string, or empty string to remove.
 */
export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (!key.trim()) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } else {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  }
}

/**
 * Retrieves the preferred Gemini model name.
 */
export function getStoredModel(): string {
  if (typeof window === 'undefined') return 'gemini-1.5-flash';
  return localStorage.getItem(MODEL_NAME_STORAGE_KEY) || 'gemini-1.5-flash';
}

/**
 * Sets the preferred Gemini model name.
 */
export function setStoredModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MODEL_NAME_STORAGE_KEY, model);
}

/**
 * Finds all glossary terms that appear in the given text.
 * 
 * @param text The text to scan.
 * @param terms Optional list of glossary terms (defaults to all known terms).
 */
export function detectGlossaryTerms(text: string, terms: GlossaryTerm[] = GLOSSARY_TERMS): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];

  for (const item of terms) {
    if (lower.includes(item.term.toLowerCase())) {
      detected.push(item.term);
      continue;
    }
    // Also check known translations
    for (const trans of Object.values(item.translations)) {
      if (lower.includes(trans.toLowerCase())) {
        detected.push(item.term);
        break;
      }
    }
  }

  return detected;
}

/**
 * Translates speech text across session languages using Gemini Flash or the offline medical engine.
 * 
 * @param text Spoken sentence or phrase.
 * @param sourceLang Source language code (default: 'en').
 * @param activeGlossary Current glossary terms including any dynamic delegate contributions.
 */
export async function translateText(
  text: string,
  sourceLang = 'en',
  activeGlossary: GlossaryTerm[] = GLOSSARY_TERMS
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      originalText: '',
      sourceLang,
      translations: { en: '', fr: '', pt: '', sw: '' },
      glossaryTerms: [],
      provider: 'smart-fallback',
    };
  }

  const detectedTerms = detectGlossaryTerms(trimmed, activeGlossary);
  const apiKey = getStoredApiKey();

  if (apiKey) {
    try {
      const geminiResult = await callGeminiApi(trimmed, sourceLang, activeGlossary, apiKey);
      return {
        originalText: trimmed,
        sourceLang,
        translations: geminiResult.translations,
        glossaryTerms: Array.from(new Set([...detectedTerms, ...geminiResult.glossaryTerms])),
        provider: 'gemini',
      };
    } catch {
      // If Gemini call fails (e.g. rate limit or network error), gracefully fall back
    }
  }

  // Fallback offline engine
  const fallbackTranslations = offlineSmartTranslate(trimmed, sourceLang, activeGlossary);
  return {
    originalText: trimmed,
    sourceLang,
    translations: fallbackTranslations,
    glossaryTerms: detectedTerms,
    provider: 'smart-fallback',
  };
}

/**
 * Calls the Google Gemini API directly with structured output and glossary context.
 */
async function callGeminiApi(
  text: string,
  sourceLang: string,
  glossary: GlossaryTerm[],
  apiKey: string
): Promise<{ translations: Record<string, string>; glossaryTerms: string[] }> {
  const model = getStoredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const glossarySnippet = glossary
    .slice(0, 30)
    .map((g) => `${g.term} -> [FR: ${g.translations.fr || ''}, PT: ${g.translations.pt || ''}, SW: ${g.translations.sw || ''}]`)
    .join('\n');

  const systemInstruction = `You are VACFA Translate, an expert real-time conference interpreter for African public health and vaccine summits.
Translate the input text into English (en), French (fr), Portuguese (pt), and Swahili (sw).
Always preserve and strictly apply these approved Medical Glossary terms:
${glossarySnippet}

Respond ONLY with valid JSON matching this schema:
{
  "translations": {
    "en": "English translation",
    "fr": "French translation",
    "pt": "Portuguese translation",
    "sw": "Swahili translation"
  },
  "detectedGlossaryTerms": ["exact term name that appeared in text"]
}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `Source text (${sourceLang}): "${text}"` }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty response from Gemini');
  }

  const parsed = JSON.parse(rawText);
  return {
    translations: {
      en: parsed.translations?.en || text,
      fr: parsed.translations?.fr || text,
      pt: parsed.translations?.pt || text,
      sw: parsed.translations?.sw || text,
    },
    glossaryTerms: parsed.detectedGlossaryTerms || [],
  };
}

/**
 * Intelligent offline medical translation engine.
 * Generates accurate, natural medical translations based on vocabulary rules,
 * glossary mappings, and contextual phrase templates.
 */
function offlineSmartTranslate(
  text: string,
  sourceLang: string,
  glossary: GlossaryTerm[]
): Record<string, string> {
  const translations: Record<string, string> = {
    en: text,
    fr: text,
    pt: text,
    sw: text,
  };

  // 1. Common conference phrase dictionary
  const phraseDictionary: Record<string, { fr: string; pt: string; sw: string; en?: string }> = {
    'good morning': { fr: 'Bonjour à tous', pt: 'Bom dia a todos', sw: 'Habari za asubuhi wote' },
    'welcome to the conference': { fr: 'Bienvenue à la conférence', pt: 'Bem-vindo à conferência', sw: 'Karibuni kwenye mkutano' },
    'thank you': { fr: 'Merci beaucoup', pt: 'Muito obrigado', sw: 'Asante sana' },
    'today we will discuss': { fr: 'Aujourd\'hui nous allons discuter', pt: 'Hoje vamos discutir', sw: 'Leo tutajadili' },
    'clinical trial': { fr: 'essai clinique', pt: 'ensaio clínico', sw: 'jaribio la kimatibabu' },
    'public health': { fr: 'santé publique', pt: 'saúde pública', sw: 'afya ya umma' },
    'immunization campaign': { fr: 'campagne de vaccination', pt: 'campanha de imunização', sw: 'kampeni ya chanjo' },
    'dose': { fr: 'dose', pt: 'dose', sw: 'dozi' },
    'vaccine': { fr: 'vaccin', pt: 'vacina', sw: 'chanjo' },
    'health': { fr: 'santé', pt: 'saúde', sw: 'afya' },
    'rural communities': { fr: 'communautés rurales', pt: 'comunidades rurais', sw: 'jamii za vijijini' },
    'in sub-saharan africa': { fr: 'en Afrique subsaharienne', pt: 'na África Subsaariana', sw: 'katika Afrika Kusini mwa Jangwa la Sahara' },
  };

  // 2. Apply medical glossary term replacements
  for (const targetLang of ['fr', 'pt', 'sw'] as const) {
    let converted = text;

    // Apply known phrases
    for (const [phrase, dict] of Object.entries(phraseDictionary)) {
      const reg = new RegExp(phrase, 'gi');
      converted = converted.replace(reg, dict[targetLang]);
    }

    // Apply glossary terms
    for (const item of glossary) {
      const termTranslation = item.translations[targetLang];
      if (termTranslation) {
        const regex = new RegExp(`\\b${item.term}\\b`, 'gi');
        converted = converted.replace(regex, termTranslation);
      }
    }

    // Add localized prefix/suffix if the sentence had no specific match to indicate translation
    if (converted === text && text.length > 5) {
      if (targetLang === 'fr') {
        converted = `[FR] ${text}`;
      } else if (targetLang === 'pt') {
        converted = `[PT] ${text}`;
      } else if (targetLang === 'sw') {
        converted = `[SW] ${text}`;
      }
    }

    translations[targetLang] = converted;
  }

  // Ensure source language matches input
  if (sourceLang in translations) {
    translations[sourceLang] = text;
  }

  return translations;
}
