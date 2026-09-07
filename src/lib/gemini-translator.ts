/**
 * VACFA Translate — Real-Time Translation & Medical Glossary Engine
 * 
 * Provides real-time bidirectional translation (English, French, Portuguese, Swahili)
 * with direct injection of the VACFA Medical Glossary into prompt context.
 * Supports direct Gemini API calls when an API key is configured,
 * and automatically utilizes public translation APIs with glossary enforcement
 * when running in zero-setup mode.
 */

import { GLOSSARY_TERMS } from './demo-data';
import type { GlossaryTerm } from './types';
import { normalizeMedicalSpeech } from './speech-recognition';

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
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  const local = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (local) return local;
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
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
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash';
  return localStorage.getItem(MODEL_NAME_STORAGE_KEY) || process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash';
}

/**
 * Sets the preferred Gemini model name.
 */
export function setStoredModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MODEL_NAME_STORAGE_KEY, model);
}

/**
 * Detects the probable language of the input text based on common vocabulary patterns.
 * 
 * @param text The input text string.
 */
export function detectLanguage(text: string): 'en' | 'fr' | 'pt' | 'sw' {
  const t = ' ' + text.toLowerCase() + ' ';
  if (/\b(je|j'|le|la|les|nous|vous|pour|avec|dans|est|sont|vaccin|merci|bonjour|comment|salut)\b/.test(t)) {
    return 'fr';
  }
  if (/\b(eu|voce|você|para|com|em|não|sao|são|vacina|ola|olá|bom|boa|obrigado|muito)\b/.test(t)) {
    return 'pt';
  }
  if (/\b(habari|jina|sasa|kwa|katika|chanjo|wote|yake|asante|karibu|jambo|sana|leo)\b/.test(t)) {
    return 'sw';
  }
  return 'en';
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
      if (trans && lower.includes(trans.toLowerCase())) {
        detected.push(item.term);
        break;
      }
    }
  }

  return detected;
}

/**
 * Translates speech text across all session languages using Gemini Flash or public translation API,
 * strictly enforcing the approved VACFA Medical Glossary.
 * 
 * @param text Spoken sentence or phrase.
 * @param sourceLang Optional source language override. If not specified, auto-detected.
 * @param activeGlossary Current glossary terms including any dynamic delegate contributions.
 */
export async function translateText(
  text: string,
  sourceLang?: string,
  activeGlossary: GlossaryTerm[] = GLOSSARY_TERMS
): Promise<TranslationResult> {
  const normalized = normalizeMedicalSpeech(text.trim());
  if (!normalized) {
    return {
      originalText: '',
      sourceLang: sourceLang || 'en',
      translations: { en: '', fr: '', pt: '', sw: '' },
      glossaryTerms: [],
      provider: 'smart-fallback',
    };
  }

  const detectedSource = sourceLang || detectLanguage(normalized);
  const detectedTerms = detectGlossaryTerms(normalized, activeGlossary);
  const apiKey = getStoredApiKey();

  // 1. Try Google Gemini API if API key is provided
  if (apiKey) {
    try {
      const geminiResult = await callGeminiApi(normalized, detectedSource, activeGlossary, apiKey);
      return {
        originalText: normalized,
        sourceLang: detectedSource,
        translations: geminiResult.translations,
        glossaryTerms: Array.from(new Set([...detectedTerms, ...geminiResult.glossaryTerms])),
        provider: 'gemini',
      };
    } catch {
      // Fall through to public translation engine
    }
  }

  // 2. Real-time translation via public translation API with glossary enforcement
  try {
    const translations = await translateWithPublicApi(normalized, detectedSource);
    const enforcedTranslations = enforceMedicalGlossary(translations, detectedSource, activeGlossary);

    return {
      originalText: normalized,
      sourceLang: detectedSource,
      translations: enforcedTranslations,
      glossaryTerms: detectedTerms,
      provider: 'smart-fallback',
    };
  } catch {
    // 3. Fallback dictionary
    const fallback = offlineDictionaryTranslate(normalized, detectedSource, activeGlossary);
    return {
      originalText: normalized,
      sourceLang: detectedSource,
      translations: fallback,
      glossaryTerms: detectedTerms,
      provider: 'smart-fallback',
    };
  }
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
    .slice(0, 35)
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
 * Translates text into target languages using the public translation API.
 */
async function translateWithPublicApi(
  text: string,
  sourceLang: string
): Promise<Record<string, string>> {
  const targetLangs: Array<'en' | 'fr' | 'pt' | 'sw'> = ['en', 'fr', 'pt', 'sw'];
  const results: Record<string, string> = {
    en: text,
    fr: text,
    pt: text,
    sw: text,
  };

  const requests = targetLangs.map(async (target) => {
    if (target === sourceLang) {
      results[target] = text;
      return;
    }

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${target}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const translated = data?.responseData?.translatedText;
        if (translated && !translated.toUpperCase().includes('MYMEMORY WARNING') && !translated.toUpperCase().includes('IS AN INVALID')) {
          results[target] = translated;
          return;
        }
      }
    } catch {
      // Ignore network error and fall back
    }

    // Fallback: Swahili dictionary if API quota exceeded
    if (target === 'sw') {
      results[target] = fallbackTranslateToSwahili(text);
    } else if (target === 'fr') {
      results[target] = fallbackTranslateToFrench(text);
    } else if (target === 'pt') {
      results[target] = fallbackTranslateToPortuguese(text);
    }
  });

  await Promise.all(requests);
  return results;
}

/**
 * Replaces any detected medical terms in the translated outputs with the official VACFA glossary translations.
 */
function enforceMedicalGlossary(
  translations: Record<string, string>,
  sourceLang: string,
  glossary: GlossaryTerm[]
): Record<string, string> {
  const enforced = { ...translations };

  for (const term of glossary) {
    const sourceWord = term.translations[sourceLang] || term.term;
    const regex = new RegExp(`\\b${escapeRegExp(sourceWord)}\\b`, 'gi');

    for (const [lang, transText] of Object.entries(enforced)) {
      if (lang === sourceLang) continue;
      const targetTerm = term.translations[lang];
      if (targetTerm && transText.toLowerCase().includes(sourceWord.toLowerCase())) {
        enforced[lang] = transText.replace(regex, targetTerm);
      }
    }
  }

  return enforced;
}

/**
 * Escapes special regex characters in search strings.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fallback translation helper for Swahili when offline.
 */
function fallbackTranslateToSwahili(text: string): string {
  const dictionary: Record<string, string> = {
    'good morning': 'habari za asubuhi',
    'good afternoon': 'habari za mchana',
    'welcome': 'karibu',
    'welcome everyone': 'karibuni wote',
    'thank you': 'asante',
    'thank you very much': 'asante sana',
    'today': 'leo',
    'we will discuss': 'tutajadili',
    'vaccine': 'chanjo',
    'vaccines': 'chanjo',
    'cold chain': 'mfumo wa baridi',
    'immunization': 'kinga',
    'health': 'afya',
    'public health': 'afya ya umma',
    'hospital': 'hospitali',
    'doctor': 'daktari',
    'clinical trial': 'jaribio la kimatibabu',
    'dose': 'dozi',
    'booster dose': 'dozi ya nyongeza',
    'surveillance': 'ufuatiliaji',
    'my name is': 'jina langu ni',
    'conference': 'mkutano',
    'the captions': 'maelezo mafupi',
    'talking': 'kuzungumza',
  };

  let translated = text;
  for (const [en, sw] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(reg, sw);
  }
  return translated;
}

/**
 * Fallback translation helper for French when offline.
 */
function fallbackTranslateToFrench(text: string): string {
  const dictionary: Record<string, string> = {
    'good morning': 'bonjour',
    'welcome': 'bienvenue',
    'thank you': 'merci',
    'today': 'aujourd\'hui',
    'vaccine': 'vaccin',
    'vaccines': 'vaccins',
    'cold chain': 'chaîne du froid',
    'immunization': 'immunisation',
    'health': 'santé',
    'public health': 'santé publique',
    'clinical trial': 'essai clinique',
    'dose': 'dose',
    'my name is': 'je m\'appelle',
    'conference': 'conférence',
  };

  let translated = text;
  for (const [en, fr] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(reg, fr);
  }
  return translated;
}

/**
 * Fallback translation helper for Portuguese when offline.
 */
function fallbackTranslateToPortuguese(text: string): string {
  const dictionary: Record<string, string> = {
    'good morning': 'bom dia',
    'welcome': 'bem-vindo',
    'thank you': 'obrigado',
    'today': 'hoje',
    'vaccine': 'vacina',
    'vaccines': 'vacinas',
    'cold chain': 'cadeia de frio',
    'immunization': 'imunização',
    'health': 'saúde',
    'public health': 'saúde pública',
    'clinical trial': 'ensaio clínico',
    'dose': 'dose',
    'my name is': 'meu nome é',
    'conference': 'conferência',
  };

  let translated = text;
  for (const [en, pt] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(reg, pt);
  }
  return translated;
}

/**
 * Offline dictionary translation fallback.
 */
function offlineDictionaryTranslate(
  text: string,
  sourceLang: string,
  glossary: GlossaryTerm[]
): Record<string, string> {
  const translations: Record<string, string> = {
    en: text,
    fr: fallbackTranslateToFrench(text),
    pt: fallbackTranslateToPortuguese(text),
    sw: fallbackTranslateToSwahili(text),
  };

  translations[sourceLang] = text;
  return enforceMedicalGlossary(translations, sourceLang, glossary);
}
