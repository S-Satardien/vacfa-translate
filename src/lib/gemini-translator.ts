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
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export interface TranslationResult {
  originalText: string;
  sourceLang: string;
  translations: Record<string, string>; // language code -> translated text
  glossaryTerms: string[];
  provider: 'gemini' | 'smart-fallback';
}

// In-memory LRU cache to deliver instantaneous 0ms responses for repeated or common conference phrases
const translationCache = new Map<string, Record<string, string>>();

/**
 * Retrieves the stored Gemini API key from browser local storage, URL param, or environment variable.
 */
export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

  // Check if key was passed in URL query param (?geminiKey=... or ?key=...)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramKey = urlParams.get('geminiKey') || urlParams.get('key');
    if (paramKey && paramKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, paramKey.trim());
      // Clean query parameter from URL without page reload
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      return paramKey.trim();
    }
  } catch {
    // Ignore URL parse error in restricted sandbox environments
  }

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
 * Automatically migrates deprecated models (3.5, 2.5) to the current active 3.8 Flash model.
 */
export function getStoredModel(): string {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const stored = localStorage.getItem(MODEL_NAME_STORAGE_KEY);
  if (stored && (stored.includes('2.0') || stored.includes('1.5') || stored.includes('tts') || stored.includes('2.5') || stored.includes('3.5'))) {
    localStorage.setItem(MODEL_NAME_STORAGE_KEY, DEFAULT_GEMINI_MODEL);
    return DEFAULT_GEMINI_MODEL;
  }
  return stored || process.env.NEXT_PUBLIC_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/**
 * Sets the preferred Gemini model name.
 */
export function setStoredModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MODEL_NAME_STORAGE_KEY, model);
}

/**
 * Detects the probable language of the input text based on frequency analysis and comprehensive lexicon matching.
 * Accurately differentiates French, Portuguese, Swahili, and English.
 * 
 * @param text The input text string.
 * @returns Probable language code ('en', 'fr', 'pt', or 'sw')
 */
export function detectLanguage(text: string): 'en' | 'fr' | 'pt' | 'sw' {
  if (!text || !text.trim()) return 'en';
  const clean = ' ' + text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ') + ' ';

  let frScore = 0;
  let ptScore = 0;
  let swScore = 0;
  let enScore = 0;

  // French markers & core vocabulary
  const frPatterns = [
    /\b(je|j|tu|il|elle|nous|vous|ils|elles)\b/g,
    /\b(le|la|les|un|une|des|du|de|d)\b/g,
    /\b(pour|avec|dans|sur|sous|par|chez|entre|vers)\b/g,
    /\b(est|sont|sommes|etes|avez|ont|etait|ete|sera|seront|faire|dire|aller)\b/g,
    /\b(vaccin|vaccins|vaccination|sante|publique|afrique|question|merci|bonjour|bonsoir|salut|monsieur|madame)\b/g,
    /\b(pourquoi|comment|quand|aussi|tres|bien|notre|votre|leur|cette|ces|cest|ce)\b/g,
    /\b(reunion|conference|presentation|collegue|collegues|epidemie|paludisme|rougeole)\b/g,
  ];

  // Portuguese markers & core vocabulary
  const ptPatterns = [
    /\b(eu|voce|voces|ele|ela|nos|eles|elas)\b/g,
    /\b(o|a|os|as|um|uma|uns|umas|do|da|dos|das)\b/g,
    /\b(para|com|por|sobre|em|no|na|nos|nas)\b/g,
    /\b(e|sao|foi|foram|esta|estao|estamos|temos|tem|fazer|dizer|ir)\b/g,
    /\b(vacina|vacinas|vacinacao|saude|publica|africa|pergunta|obrigado|obrigada|ola|bom dia|boa tarde|boa noite|senhor|senhora)\b/g,
    /\b(porque|como|quando|tambem|muito|bem|nosso|nossa|este|esta|estes|estas|isso|isto|nao)\b/g,
    /\b(reuniao|conferencia|apresentacao|colega|colegas|surto|malaria|sarampo)\b/g,
  ];

  // Swahili markers & core vocabulary
  const swPatterns = [
    /\b(mimi|wewe|yeye|sisi|nyinyi|wao)\b/g,
    /\b(wa|ya|cha|vya|za|kwa|katika|na|ni|si|kama|lakini)\b/g,
    /\b(hapa|pale|huyu|hiki|hawa|hii|hili|yake|yao|yetu|yenu|wote)\b/g,
    /\b(tuna|mna|wana|nina|tuko|wako|kufanya|kusema|kwenda|kuwa)\b/g,
    /\b(chanjo|utoaji|afya|umma|afrika|swali|asante|habari|jambo|karibu|karibuni|leo|kesho|jana)\b/g,
    /\b(kwa nini|vipi|lini|pia|sana|vizuri|daktari|muuguzi|hospitali|dozi|mkutano|uwasilishaji)\b/g,
  ];

  // English markers
  const enPatterns = [
    /\b(the|this|that|these|those)\b/g,
    /\b(is|are|was|were|have|has|had|will|would|can|could|should)\b/g,
    /\b(with|from|about|into|through|between|under|over)\b/g,
    /\b(health|vaccine|vaccines|meeting|conference|presentation|question|thank|welcome|please)\b/g,
  ];

  for (const p of frPatterns) {
    const matches = clean.match(p);
    if (matches) frScore += matches.length;
  }
  for (const p of ptPatterns) {
    const matches = clean.match(p);
    if (matches) ptScore += matches.length;
  }
  for (const p of swPatterns) {
    const matches = clean.match(p);
    if (matches) swScore += matches.length;
  }
  for (const p of enPatterns) {
    const matches = clean.match(p);
    if (matches) enScore += matches.length;
  }

  const max = Math.max(frScore, ptScore, swScore, enScore);
  if (max === 0) return 'en';
  if (max === frScore) return 'fr';
  if (max === ptScore) return 'pt';
  if (max === swScore) return 'sw';
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
        sourceLang: geminiResult.detectedLanguage || detectedSource,
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
): Promise<{ translations: Record<string, string>; glossaryTerms: string[]; detectedLanguage?: 'en' | 'fr' | 'pt' | 'sw' }> {
  const model = getStoredModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Prioritize glossary terms that actually appear in the sentence first, plus top critical medical terms
  const lowerText = text.toLowerCase();
  const matchedTerms = glossary.filter((g) => {
    if (lowerText.includes(g.term.toLowerCase())) return true;
    return Object.values(g.translations).some((t) => t && lowerText.includes(t.toLowerCase()));
  });

  // Combine matched terms with core essential acronyms (up to 14 terms max) to keep prompt token footprint ultra-lean
  const priorityTerms = new Set(matchedTerms.map((m) => m.term));
  const coreTerms = glossary.filter((g) => ['NITAG', 'NISH', 'RITAG', 'AEFI', 'EPI', 'VVM', 'Gavi', 'DALY', 'QALY'].includes(g.term));
  for (const c of coreTerms) {
    if (priorityTerms.size < 14) {
      priorityTerms.add(c.term);
      matchedTerms.push(c);
    }
  }

  const glossarySnippet = matchedTerms
    .map((g) => `${g.term} -> [FR: ${g.translations.fr || g.term}, PT: ${g.translations.pt || g.term}, SW: ${g.translations.sw || g.term}]`)
    .join('\n');

  const systemInstruction = `You are VACFA Translate, an expert real-time conference interpreter for African public health summits.
The speaker may speak in English (en), French (fr), Portuguese (pt), or Swahili (sw).
1. Detect which language the speaker spoke: 'en', 'fr', 'pt', or 'sw'.
2. Provide the cleaned, normalized text in the speaker's language.
3. Provide high-accuracy, fluent, synchronous translations into all the other languages.
Always preserve and strictly apply these approved Medical Glossary terms:
${glossarySnippet}

Respond ONLY with valid JSON matching this schema:
{
  "detectedLanguage": "en|fr|pt|sw",
  "translations": {
    "en": "English text (spoken or translated)",
    "fr": "French text (spoken or translated)",
    "pt": "Portuguese text (spoken or translated)",
    "sw": "Swahili text (spoken or translated)"
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
          parts: [{ text: `Input speech from conference: "${text}" (Floor hint: ${sourceLang})` }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
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
  const detected = (parsed.detectedLanguage as 'en' | 'fr' | 'pt' | 'sw') || (sourceLang as 'en' | 'fr' | 'pt' | 'sw');

  return {
    detectedLanguage: detected,
    translations: {
      en: parsed.translations?.en || (detected === 'en' ? text : ''),
      fr: parsed.translations?.fr || (detected === 'fr' ? text : ''),
      pt: parsed.translations?.pt || (detected === 'pt' ? text : ''),
      sw: parsed.translations?.sw || (detected === 'sw' ? text : ''),
    },
    glossaryTerms: parsed.detectedGlossaryTerms || [],
  };
}

/**
 * Translates text into target languages using the public translation API.
 * Includes in-memory caching and strict 2.2s timeout to prevent lag on medical acronyms.
 */
async function translateWithPublicApi(
  text: string,
  sourceLang: string
): Promise<Record<string, string>> {
  const cacheKey = `${sourceLang}:${text.trim().toLowerCase()}`;
  if (translationCache.has(cacheKey)) {
    return { ...translationCache.get(cacheKey)! };
  }

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s allows reliable public internet roundtrip
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${target}&de=vacfa@uct.ac.za`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const translated = data?.responseData?.translatedText;
        if (
          translated &&
          !translated.toUpperCase().includes('MYMEMORY WARNING') &&
          !translated.toUpperCase().includes('IS AN INVALID')
        ) {
          results[target] = translated;
          return;
        }
      }
    } catch {
      // Abort or network error; seamlessly fall back to instant dictionary
    }

    // Fallback: African conference & medical dictionary if API quota exceeded or timed out
    if (target === 'sw') {
      results[target] = fallbackTranslateToSwahili(text);
    } else if (target === 'fr') {
      results[target] = fallbackTranslateToFrench(text);
    } else if (target === 'pt') {
      results[target] = fallbackTranslateToPortuguese(text);
    }
  });

  await Promise.all(requests);
  translationCache.set(cacheKey, results);
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
    'can everyone hear me': 'kila mtu ananisikia',
    'can you hear me': 'unanisikia',
    'i can hear you': 'nakusikia',
    'loud and clear': 'kwa sauti na wazi',
    'testing audio': 'majaribio ya sauti',
    'good morning': 'habari za asubuhi',
    'good afternoon': 'habari za mchana',
    'good evening': 'habari za jioni',
    'welcome everyone': 'karibuni wote',
    'welcome': 'karibu',
    'thank you very much': 'asante sana',
    'thank you': 'asante',
    'today': 'leo',
    'we will discuss': 'tutajadili',
    'next slide': 'slaidi inayofuata',
    'slide': 'slaidi',
    'presentation': 'uwasilishaji',
    'meeting': 'mkutano',
    'conference': 'mkutano mkuu',
    'important': 'muhimu',
    'question': 'swali',
    'questions': 'maswali',
    'answer': 'jibu',
    'vaccine': 'chanjo',
    'vaccines': 'chanjo',
    'vaccination': 'utoaji wa chanjo',
    'cold chain': 'mfumo wa baridi',
    'immunization': 'kinga ya maradhi',
    'health': 'afya',
    'public health': 'afya ya umma',
    'hospital': 'hospitali',
    'doctor': 'daktari',
    'nurse': 'muuguzi',
    'clinical trial': 'jaribio la kimatibabu',
    'dose': 'dozi',
    'booster dose': 'dozi ya nyongeza',
    'surveillance': 'ufuatiliaji',
    'outbreak': 'mlipuko wa ugonjwa',
    'my name is': 'jina langu ni',
    'the captions': 'maelezo mafupi',
    'talking': 'kuzungumza',
    'africa': 'Afrika',
  };

  let translated = text;
  for (const [en, sw] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi');
    translated = translated.replace(reg, sw);
  }
  return translated;
}

/**
 * Fallback translation helper for French when offline.
 */
function fallbackTranslateToFrench(text: string): string {
  const dictionary: Record<string, string> = {
    'can everyone hear me': 'est-ce que tout le monde m\'entend',
    'can you hear me': 'm\'entendez-vous',
    'i can hear you': 'je vous entends',
    'loud and clear': 'fort et clair',
    'testing audio': 'test audio',
    'good morning': 'bonjour',
    'good afternoon': 'bon après-midi',
    'good evening': 'bonsoir',
    'welcome everyone': 'bienvenue à tous',
    'welcome': 'bienvenue',
    'thank you very much': 'merci beaucoup',
    'thank you': 'merci',
    'today': 'aujourd\'hui',
    'we will discuss': 'nous allons discuter de',
    'next slide': 'diapositive suivante',
    'slide': 'diapositive',
    'presentation': 'présentation',
    'meeting': 'réunion',
    'conference': 'conférence',
    'important': 'important',
    'question': 'question',
    'questions': 'questions',
    'answer': 'réponse',
    'vaccine': 'vaccin',
    'vaccines': 'vaccins',
    'vaccination': 'vaccination',
    'cold chain': 'chaîne du froid',
    'immunization': 'immunisation',
    'health': 'santé',
    'public health': 'santé publique',
    'hospital': 'hôpital',
    'doctor': 'docteur',
    'nurse': 'infirmière',
    'clinical trial': 'essai clinique',
    'dose': 'dose',
    'booster dose': 'dose de rappel',
    'surveillance': 'surveillance épidémiologique',
    'outbreak': 'épidémie',
    'my name is': 'je m\'appelle',
    'the captions': 'les sous-titres',
    'talking': 'en train de parler',
    'africa': 'Afrique',
  };

  let translated = text;
  for (const [en, fr] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi');
    translated = translated.replace(reg, fr);
  }
  return translated;
}

/**
 * Fallback translation helper for Portuguese when offline.
 */
function fallbackTranslateToPortuguese(text: string): string {
  const dictionary: Record<string, string> = {
    'can everyone hear me': 'todos conseguem me ouvir',
    'can you hear me': 'você consegue me ouvir',
    'i can hear you': 'consigo te ouvir',
    'loud and clear': 'alto e em bom som',
    'testing audio': 'teste de áudio',
    'good morning': 'bom dia',
    'good afternoon': 'boa tarde',
    'good evening': 'boa noite',
    'welcome everyone': 'bem-vindos a todos',
    'welcome': 'bem-vindo',
    'thank you very much': 'muito obrigado',
    'thank you': 'obrigado',
    'today': 'hoje',
    'we will discuss': 'vamos discutir',
    'next slide': 'próximo slide',
    'slide': 'slide',
    'presentation': 'apresentação',
    'meeting': 'reunião',
    'conference': 'conferência',
    'important': 'importante',
    'question': 'pergunta',
    'questions': 'perguntas',
    'answer': 'resposta',
    'vaccine': 'vacina',
    'vaccines': 'vacinas',
    'vaccination': 'vacinação',
    'cold chain': 'cadeia de frio',
    'immunization': 'imunização',
    'health': 'saúde',
    'public health': 'saúde pública',
    'hospital': 'hospital',
    'doctor': 'médico',
    'nurse': 'enfermeiro',
    'clinical trial': 'ensaio clínico',
    'dose': 'dose',
    'booster dose': 'dose de reforço',
    'surveillance': 'vigilância epidemiológica',
    'outbreak': 'surto epidêmico',
    'my name is': 'meu nome é',
    'the captions': 'as legendas',
    'talking': 'falando',
    'africa': 'África',
  };

  let translated = text;
  for (const [en, pt] of Object.entries(dictionary)) {
    const reg = new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi');
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
