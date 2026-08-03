/**
 * VACFA Translate — Demo Data
 * 
 * Mock data used across all prototype screens.
 * This simulates what would come from a real backend.
 */

import type {
  Language,
  Session,
  GlossaryTerm,
  CaptionEntry,
  TranslationChannel,
  DashboardStats,
  ActivityEntry,
  NavItem,
} from './types';

/** Supported languages in the VACFA Translate platform */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', listenerCount: 124 },
  { code: 'fr', name: 'French', nativeName: 'Français', listenerCount: 89 },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', listenerCount: 47 },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', listenerCount: 63 },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', listenerCount: 31 },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', listenerCount: 22 },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', listenerCount: 18 },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', listenerCount: 27 },
  { code: 'wo', name: 'Wolof', nativeName: 'Wolof', listenerCount: 14 },
  { code: 'ln', name: 'Lingala', nativeName: 'Lingála', listenerCount: 11 },
];

/** Mock sessions for the dashboard */
export const SESSIONS: Session[] = [
  {
    id: 'session-001',
    name: 'GAVI Immunization Summit 2026',
    organiser: 'Dr. Amina Osei',
    date: '2026-08-15',
    time: '09:00',
    sessionCode: '482916',
    languages: [LANGUAGES[0], LANGUAGES[1], LANGUAGES[2], LANGUAGES[3]],
    status: 'live',
    delegateCount: 347,
    description: 'Annual summit discussing immunization strategies across Sub-Saharan Africa.',
  },
  {
    id: 'session-002',
    name: 'Cold Chain Logistics Workshop',
    organiser: 'Prof. Kwame Asante',
    date: '2026-08-16',
    time: '14:00',
    sessionCode: '731058',
    languages: [LANGUAGES[0], LANGUAGES[1], LANGUAGES[4]],
    status: 'upcoming',
    delegateCount: 0,
    description: 'Workshop on maintaining cold chain integrity in tropical climates.',
  },
  {
    id: 'session-003',
    name: 'mRNA Vaccine Rollout: Lessons from Africa',
    organiser: 'Dr. Fatima Diallo',
    date: '2026-08-14',
    time: '10:00',
    sessionCode: '295647',
    languages: [LANGUAGES[0], LANGUAGES[1], LANGUAGES[2]],
    status: 'ended',
    delegateCount: 218,
    description: 'Review of mRNA vaccine deployment challenges and successes across the continent.',
  },
  {
    id: 'session-004',
    name: 'NITAG Strengthening Forum',
    organiser: 'Dr. Amina Osei',
    date: '2026-08-20',
    time: '11:00',
    sessionCode: '618243',
    languages: [LANGUAGES[0], LANGUAGES[1], LANGUAGES[3], LANGUAGES[6]],
    status: 'upcoming',
    delegateCount: 0,
    description: 'Forum on strengthening National Immunization Technical Advisory Groups across Africa.',
  },
  {
    id: 'session-005',
    name: 'Pharmacovigilance Best Practices',
    organiser: 'Prof. Kwame Asante',
    date: '2026-08-22',
    time: '15:00',
    sessionCode: '504791',
    languages: [LANGUAGES[0], LANGUAGES[1], LANGUAGES[7]],
    status: 'upcoming',
    delegateCount: 0,
    description: 'Best practices for adverse event monitoring and vaccine safety surveillance.',
  },
];

/** Mock glossary terms — vaccine/health terminology */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: 'term-001',
    term: 'mRNA vaccine',
    category: 'immunology',
    translations: {
      fr: 'vaccin à ARNm',
      pt: 'vacina de mRNA',
      sw: 'chanjo ya mRNA',
      yo: 'àjẹsára mRNA',
      am: 'የmRNA ክትባት',
    },
    phonetic: 'em-ar-en-ay vak-seen',
    context: 'A type of vaccine that uses messenger RNA to instruct cells to produce a protein that triggers an immune response.',
    contributor: 'vacfa',
  },
  {
    id: 'term-002',
    term: 'Cold chain',
    category: 'logistics',
    translations: {
      fr: 'chaîne du froid',
      pt: 'cadeia de frio',
      sw: 'mfumo wa baridi',
      yo: 'ẹ̀wọ̀n ìtútù',
      am: 'የቀዝቃዛ ሰንሰለት',
    },
    phonetic: 'kohld chayn',
    context: 'Temperature-controlled supply chain for storing and transporting vaccines.',
    contributor: 'vacfa',
  },
  {
    id: 'term-003',
    term: 'Herd immunity',
    category: 'epidemiology',
    translations: {
      fr: 'immunité collective',
      pt: 'imunidade de rebanho',
      sw: 'kinga ya jamii',
      yo: 'àjẹ́sára àwùjọ',
      am: 'የመንጋ በሽታ መከላከያ',
    },
    phonetic: 'hurd ih-myoo-nuh-tee',
    context: 'When a sufficient proportion of a population is immune, providing indirect protection.',
    contributor: 'vacfa',
  },
  {
    id: 'term-004',
    term: 'Adjuvant',
    category: 'immunology',
    translations: {
      fr: 'adjuvant',
      pt: 'adjuvante',
      sw: 'kisaidizi cha chanjo',
      yo: 'olùrànlọ́wọ́ àjẹsára',
      am: 'ረዳት',
    },
    phonetic: 'aj-uh-vuhnt',
    context: 'A substance added to a vaccine to enhance the immune response.',
    contributor: 'vacfa',
  },
  {
    id: 'term-005',
    term: 'Seroconversion',
    category: 'immunology',
    translations: {
      fr: 'séroconversion',
      pt: 'soroconversão',
      sw: 'mabadiliko ya seramu',
      yo: 'ìyípadà sẹ́rọ̀',
      am: 'ሴሮኮንቨርሽን',
    },
    phonetic: 'seer-oh-kuhn-vur-zhuhn',
    context: 'The development of detectable antibodies in the blood following vaccination or infection.',
    contributor: 'vacfa',
  },
  {
    id: 'term-006',
    term: 'Booster dose',
    category: 'immunology',
    translations: {
      fr: 'dose de rappel',
      pt: 'dose de reforço',
      sw: 'dozi ya nyongeza',
      yo: 'ìwọ̀n àfikún',
      am: 'ማጠናከሪያ ክትባት',
    },
    phonetic: 'boo-ster dohs',
    context: 'An additional dose of vaccine given after the initial series to maintain immunity.',
    contributor: 'vacfa',
  },
  {
    id: 'term-007',
    term: 'Lyophilized',
    category: 'logistics',
    translations: {
      fr: 'lyophilisé',
      pt: 'liofilizado',
      sw: 'iliyokaushwa kwa baridi',
      yo: 'gbígbẹ ní ìtútù',
      am: 'በቀዝቃዛ የደረቀ',
    },
    phonetic: 'ly-off-uh-lyzd',
    context: 'Freeze-dried vaccine formulation that requires reconstitution before use.',
    contributor: 'vacfa',
  },
  {
    id: 'term-008',
    term: 'Pharmacovigilance',
    category: 'policy',
    translations: {
      fr: 'pharmacovigilance',
      pt: 'farmacovigilância',
      sw: 'uangalifu wa dawa',
      yo: 'ìṣọ́ra oògùn',
      am: 'የመድኃኒት ክትትል',
    },
    phonetic: 'far-muh-koh-vij-uh-luhns',
    context: 'The science of monitoring adverse effects of pharmaceutical products after market release.',
    contributor: 'organiser',
    contributorName: 'Dr. Fatima Diallo',
  },
  {
    id: 'term-009',
    term: 'Antigen',
    category: 'immunology',
    translations: {
      fr: 'antigène',
      pt: 'antígeno',
      sw: 'antijeni',
      yo: 'ohun-àjẹ́sára-ọ̀tá',
      am: 'አንቲጅን',
    },
    phonetic: 'an-tih-jen',
    context: 'A substance that triggers an immune response, especially the production of antibodies.',
    contributor: 'vacfa',
  },
  {
    id: 'term-010',
    term: 'Surveillance',
    category: 'epidemiology',
    translations: {
      fr: 'surveillance',
      pt: 'vigilância',
      sw: 'ufuatiliaji',
      yo: 'àbójútó',
      am: 'ክትትል',
    },
    phonetic: 'ser-vay-luhns',
    context: 'Systematic collection and analysis of health data to monitor disease trends.',
    contributor: 'vacfa',
  },
];

/** Simulated live caption transcript for a vaccine conference */
export const DEMO_CAPTIONS: CaptionEntry[] = [
  {
    id: 'cap-001',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:00:12',
    originalText: 'Good morning, everyone. Welcome to the GAVI Immunization Summit 2026.',
    translatedText: 'Bonjour à tous. Bienvenue au Sommet de Vaccination GAVI 2026.',
    glossaryTerms: [],
  },
  {
    id: 'cap-002',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:00:28',
    originalText: 'Today we will be discussing the latest developments in mRNA vaccine technology and its deployment across Sub-Saharan Africa.',
    translatedText: `Aujourd'hui, nous allons discuter des derniers développements de la technologie des vaccins à ARNm et de son déploiement en Afrique subsaharienne.`,
    translatedPt: `Hoje discutiremos os últimos desenvolvimentos da tecnologia de vacinas de mRNA e sua implantação na África Subsaariana.`,
    glossaryTerms: ['mRNA vaccine'],
  },
  {
    id: 'cap-003',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:00:51',
    originalText: 'As many of you know, maintaining the cold chain has been one of our greatest challenges in reaching rural communities.',
    translatedText: `Comme beaucoup d'entre vous le savent, le maintien de la chaîne du froid a été l'un de nos plus grands défis pour atteindre les communautés rurales.`,
    translatedPt: `Como muitos de vocês sabem, manter a cadeia de frio tem sido um dos nossos maiores desafios para alcançar as comunidades rurais.`,
    glossaryTerms: ['Cold chain'],
  },
  {
    id: 'cap-004',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:01:15',
    originalText: 'Thank you, Dr. Osei. I would like to present our findings on seroconversion rates following the booster dose campaigns in West Africa.',
    translatedText: `Merci, Dr Osei. Je voudrais présenter nos résultats sur les taux de séroconversion suite aux campagnes de dose de rappel en Afrique de l'Ouest.`,
    translatedPt: `Obrigado, Dra. Osei. Gostaria de apresentar nossas descobertas sobre as taxas de soroconversão após as campanhas de dose de reforço na África Ocidental.`,
    glossaryTerms: ['seroconversion', 'booster dose'],
  },
  {
    id: 'cap-005',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:01:38',
    originalText: 'Our data shows that the lyophilized formulations performed exceptionally well in high-temperature environments, reducing dependency on traditional cold chain infrastructure.',
    translatedText: 'Nos données montrent que les formulations lyophilisées ont exceptionnellement bien fonctionné dans des environnements à haute température, réduisant la dépendance aux infrastructures traditionnelles de chaîne du froid.',
    translatedPt: `Nossos dados mostram que as formulações liofilizadas tiveram um desempenho excepcionalmente bom em ambientes de alta temperatura, reduzindo a dependência da infraestrutura tradicional da cadeia de frio.`,
    glossaryTerms: ['lyophilized', 'cold chain'],
  },
  {
    id: 'cap-006',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:02:05',
    originalText: 'The adjuvant we used in the trial significantly enhanced the immune response, particularly in populations with prior exposure.',
    translatedText: `L'adjuvant que nous avons utilisé dans l'essai a considérablement amélioré la réponse immunitaire, en particulier dans les populations avec une exposition antérieure.`,
    translatedPt: `O adjuvante que usamos no ensaio melhorou significativamente a resposta imune, particularmente em populações com exposição prévia.`,
    glossaryTerms: ['adjuvant'],
  },
  {
    id: 'cap-007',
    speaker: 'Dr. Fatima Diallo',
    timestamp: '09:02:30',
    originalText: 'I want to emphasize the importance of pharmacovigilance in these campaigns. We need robust surveillance systems to monitor adverse events.',
    translatedText: `Je veux souligner l'importance de la pharmacovigilance dans ces campagnes. Nous avons besoin de systèmes de surveillance robustes pour surveiller les événements indésirables.`,
    translatedPt: `Quero enfatizar a importância da farmacovigilância nessas campanhas. Precisamos de sistemas de vigilância robustos para monitorar eventos adversos.`,
    glossaryTerms: ['pharmacovigilance', 'surveillance'],
  },
  {
    id: 'cap-008',
    speaker: 'Dr. Fatima Diallo',
    timestamp: '09:02:52',
    originalText: 'The antigen stability data from Mozambique and Angola have been very encouraging for the Portuguese-speaking regions.',
    translatedText: `Les données de stabilité des antigènes du Mozambique et de l'Angola ont été très encourageantes pour les régions lusophones.`,
    translatedPt: `Os dados de estabilidade do antígeno de Moçambique e Angola têm sido muito animadores para as regiões de língua portuguesa.`,
    glossaryTerms: ['antigen'],
  },
  {
    id: 'cap-009',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:03:18',
    originalText: 'Achieving herd immunity across the continent requires coordinated efforts between all national immunization programs.',
    translatedText: `Atteindre l'immunité collective à travers le continent nécessite des efforts coordonnés entre tous les programmes nationaux de vaccination.`,
    translatedPt: `Alcançar a imunidade de rebanho em todo o continente requer esforços coordenados entre todos os programas nacionais de imunização.`,
    glossaryTerms: ['herd immunity'],
  },
  {
    id: 'cap-010',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:03:45',
    originalText: 'Let us now hear from our regional coordinators about the progress in their respective areas.',
    translatedText: 'Écoutons maintenant nos coordinateurs régionaux sur les progrès réalisés dans leurs domaines respectifs.',
    glossaryTerms: [],
  },
];

/** Active translation channels for the live session view */
export const TRANSLATION_CHANNELS: TranslationChannel[] = [
  { language: LANGUAGES[0], listenerCount: 124, health: 'healthy', latencyMs: 145 },
  { language: LANGUAGES[1], listenerCount: 89, health: 'healthy', latencyMs: 180 },
  { language: LANGUAGES[2], listenerCount: 47, health: 'healthy', latencyMs: 210 },
  { language: LANGUAGES[3], listenerCount: 63, health: 'degraded', latencyMs: 450 },
  { language: LANGUAGES[4], listenerCount: 31, health: 'healthy', latencyMs: 195 },
  { language: LANGUAGES[6], listenerCount: 18, health: 'healthy', latencyMs: 220 },
  { language: LANGUAGES[7], listenerCount: 27, health: 'offline', latencyMs: 0 },
];

/** Dashboard statistics */
export const DASHBOARD_STATS: DashboardStats = {
  activeSessions: 1,
  totalDelegates: 347,
  activeLanguages: 6,
  glossaryTerms: GLOSSARY_TERMS.length,
};

/** Activity feed entries */
export const ACTIVITY_FEED: ActivityEntry[] = [
  {
    id: 'act-001',
    type: 'session_started',
    description: 'GAVI Immunization Summit 2026 is now live',
    timestamp: '2026-08-15T09:00:00Z',
    user: 'Dr. Amina Osei',
  },
  {
    id: 'act-002',
    type: 'glossary_updated',
    description: 'Added "Pharmacovigilance" to the glossary',
    timestamp: '2026-08-14T16:30:00Z',
    user: 'Dr. Fatima Diallo',
  },
  {
    id: 'act-003',
    type: 'session_ended',
    description: 'mRNA Vaccine Rollout: Lessons from Africa has ended',
    timestamp: '2026-08-14T12:45:00Z',
    user: 'System',
  },
  {
    id: 'act-004',
    type: 'organiser_added',
    description: 'Prof. Kwame Asante added as organiser',
    timestamp: '2026-08-13T10:00:00Z',
    user: 'Admin',
  },
  {
    id: 'act-005',
    type: 'session_created',
    description: 'NITAG Strengthening Forum scheduled for Aug 20',
    timestamp: '2026-08-12T14:20:00Z',
    user: 'Dr. Amina Osei',
  },
  {
    id: 'act-006',
    type: 'glossary_updated',
    description: 'Updated French translations for 3 terms',
    timestamp: '2026-08-11T09:15:00Z',
    user: 'Admin',
  },
];

/** Sidebar navigation items for the admin dashboard */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'home', href: '/dashboard' },
  { id: 'sessions', label: 'Sessions', icon: 'mic', href: '/dashboard/sessions', badge: '1 Live' },
  { id: 'glossary', label: 'Glossary', icon: 'book-open', href: '/dashboard/glossary', badge: GLOSSARY_TERMS.length },
  { id: 'organisers', label: 'Organisers', icon: 'users', href: '/dashboard/organisers' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/dashboard/settings' },
];

/** Glossary category labels and colors */
export const GLOSSARY_CATEGORIES = {
  immunology: { label: 'Immunology', color: '#C41E3A' },
  epidemiology: { label: 'Epidemiology', color: '#FF9800' },
  logistics: { label: 'Logistics', color: '#4CAF50' },
  policy: { label: 'Policy', color: '#2196F3' },
} as const;
