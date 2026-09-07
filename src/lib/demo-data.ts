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
  {
    id: 'term-011',
    term: 'NITAG',
    category: 'policy',
    translations: {
      fr: 'NITAG (Comité consultatif technique national sur la vaccination - GTCV)',
      pt: 'NITAG (Comitê Técnico Assessor Nacional de Imunização)',
      sw: 'NITAG (Kamati ya Kitaifa ya Ushauri wa Kiufundi wa Chanjo)',
    },
    phonetic: 'ny-tag',
    context: 'National Immunization Technical Advisory Groups — independent expert technical groups that advise health ministries on evidence-based vaccine policies.',
    contributor: 'vacfa',
  },
  {
    id: 'term-011b',
    term: 'NISH',
    category: 'policy',
    translations: {
      fr: "NISH (Centre d'appui aux NITAG / Hub d'appui aux GTCV)",
      pt: 'NISH (Centro de Apoio aos NITAG)',
      sw: 'NISH (Kituo cha Usaidizi cha NITAG)',
    },
    phonetic: 'nish',
    context: 'NITAG Support Hub — hosted by VACFA at the University of Cape Town to provide technical assistance, evidence synthesis, and capacity building to National Immunization Technical Advisory Groups across Africa.',
    contributor: 'vacfa',
  },
  {
    id: 'term-012',
    term: 'RITAG',
    category: 'policy',
    translations: {
      fr: 'RITAG (Groupe consultatif technique régional sur la vaccination)',
      pt: 'RITAG (Grupo Consultivo Técnico Regional de Imunização)',
      sw: 'RITAG (Kikundi cha Ushauri wa Kiufundi wa Chanjo cha Kikanda)',
    },
    phonetic: 'ry-tag',
    context: 'Regional Immunization Technical Advisory Group guiding continental strategies for WHO Africa.',
    contributor: 'vacfa',
  },
  {
    id: 'term-013',
    term: 'EPI',
    category: 'policy',
    translations: {
      fr: 'PEV (Programme élargi de vaccination)',
      pt: 'PAV (Programa Alargado de Vacinação)',
      sw: 'EPI (Mpango Uliopanuliwa wa Chanjo)',
    },
    phonetic: 'ee-pee-eye',
    context: 'Expanded Programme on Immunization providing universal access to essential childhood vaccines.',
    contributor: 'vacfa',
  },
  {
    id: 'term-014',
    term: 'Gavi',
    category: 'policy',
    translations: {
      fr: "Gavi (l'Alliance du Vaccin)",
      pt: 'Gavi (Aliança Global de Vacinas)',
      sw: 'Gavi (Muungano wa Chanjo)',
    },
    phonetic: 'gah-vee',
    context: 'Gavi, the Vaccine Alliance — global public-private partnership increasing access to immunization.',
    contributor: 'vacfa',
  },
  {
    id: 'term-015',
    term: 'AEFI',
    category: 'epidemiology',
    translations: {
      fr: 'MAPI (Manifestations post-vaccinales indésirables)',
      pt: 'EAPV (Eventos Adversos Pós-Vacinação)',
      sw: 'AEFI (Matukio Mabaya Baada ya Chanjo)',
    },
    phonetic: 'ay-eff-ee',
    context: 'Adverse Events Following Immunization — any untoward medical occurrence following vaccine administration.',
    contributor: 'vacfa',
  },
  {
    id: 'term-016',
    term: 'Zero-dose children',
    category: 'epidemiology',
    translations: {
      fr: 'enfants zéro-dose',
      pt: 'crianças com dose zero',
      sw: 'watoto wasiopata chanjo yoyote',
    },
    phonetic: 'zee-roh dohs chil-druhn',
    context: 'Children who have not received a single dose of diphtheria-tetanus-pertussis (DTP1) vaccine.',
    contributor: 'vacfa',
  },
  {
    id: 'term-017',
    term: 'Cost-effectiveness analysis',
    category: 'policy',
    translations: {
      fr: 'analyse coût-efficacité (ACE)',
      pt: 'análise de custo-efetividade (ACE)',
      sw: 'uchambuzi wa gharama na ufanisi',
    },
    phonetic: 'kost ih-fek-tiv-nis uh-nal-uh-sis',
    context: 'Economic evaluation comparing the relative costs and outcomes (effects) of vaccine interventions.',
    contributor: 'vacfa',
  },
  {
    id: 'term-018',
    term: 'ICER',
    category: 'policy',
    translations: {
      fr: 'RCED (Ratio coût-efficacité différentiel)',
      pt: 'RCEI (Razão de custo-efetividade incremental)',
      sw: 'ICER (Uwiano wa gharama ya ziada kwa ufanisi)',
    },
    phonetic: 'eye-ser',
    context: 'Incremental Cost-Effectiveness Ratio — the economic summary measure representing economic value of an intervention.',
    contributor: 'vacfa',
  },
  {
    id: 'term-019',
    term: 'DALY',
    category: 'epidemiology',
    translations: {
      fr: "AVCI (Année de vie corrigée de l'incapacité - DALY)",
      pt: 'DALY (Anos de vida ajustados por incapacidade)',
      sw: 'DALY (Miaka ya maisha iliyorekebishwa kwa ulemavu)',
    },
    phonetic: 'dah-lee',
    context: 'Disability-Adjusted Life Year — a measure of overall disease burden expressed as cumulative years lost.',
    contributor: 'vacfa',
  },
  {
    id: 'term-020',
    term: 'VVM',
    category: 'logistics',
    translations: {
      fr: 'PCV (Pastille de contrôle du vaccin - VVM)',
      pt: 'MVV (Monitor de Frasco de Vacina)',
      sw: 'VVM (Kipima joto cha chupa ya chanjo)',
    },
    phonetic: 'vee-vee-em',
    context: 'Vaccine Vial Monitor — a thermal label registered on vaccine vials indicating cumulative heat exposure.',
    contributor: 'vacfa',
  },
  {
    id: 'term-021',
    term: 'Routine immunization',
    category: 'policy',
    translations: {
      fr: 'vaccination de routine',
      pt: 'imunização de rotina',
      sw: 'chanjo ya kawaida',
    },
    phonetic: 'roo-teen im-yuh-ny-zay-shun',
    context: 'Sustainable, scheduled provision of essential vaccines through standard primary health systems.',
    contributor: 'vacfa',
  },
  {
    id: 'term-022',
    term: 'Vaccine hesitancy',
    category: 'policy',
    translations: {
      fr: 'hésitation vaccinale',
      pt: 'hesitação vacinal',
      sw: 'kusitasita kwa chanjo',
    },
    phonetic: 'vak-seen hez-uh-tuhn-see',
    context: 'Delay in acceptance or refusal of vaccination despite availability of services.',
    contributor: 'vacfa',
  },
  {
    id: 'term-023',
    term: 'Budget impact analysis',
    category: 'policy',
    translations: {
      fr: "analyse d'impact budgétaire (AIB)",
      pt: 'análise de impacto orçamentário (AIO)',
      sw: 'uchambuzi wa athari za bajeti',
    },
    phonetic: 'buj-it im-pakt uh-nal-uh-sis',
    context: 'Economic evaluation assessing whether a health ministry can afford to introduce a new vaccine.',
    contributor: 'vacfa',
  },
  {
    id: 'term-024',
    term: 'Co-financing',
    category: 'policy',
    translations: {
      fr: 'co-financement national',
      pt: 'co-financiamento nacional',
      sw: 'ufadhili wa pamoja wa serikali',
    },
    phonetic: 'koh fy-nan-sing',
    context: 'National financial contribution share by recipient African governments towards Gavi-supported vaccines.',
    contributor: 'vacfa',
  },
  {
    id: 'term-025',
    term: 'Seroprevalence',
    category: 'epidemiology',
    translations: {
      fr: 'séroprévalence',
      pt: 'soroprevalência',
      sw: 'kuenea kwa seramu',
    },
    phonetic: 'seer-oh-prev-uh-luhns',
    context: 'The level of a pathogen in a population as measured in blood serum.',
    contributor: 'vacfa',
  },
  {
    id: 'term-026',
    term: 'Vaccine coverage',
    category: 'epidemiology',
    translations: {
      fr: 'couverture vaccinale',
      pt: 'cobertura vacinal',
      sw: 'kiwango cha chanjo',
    },
    phonetic: 'vak-seen kuhv-rij',
    context: 'The proportion of a target population that has received scheduled vaccine doses.',
    contributor: 'vacfa',
  },
  {
    id: 'term-027',
    term: 'Drop-out rate',
    category: 'epidemiology',
    translations: {
      fr: "taux d'abandon vaccinal",
      pt: 'taxa de abandono vacinal',
      sw: 'kiwango cha kuacha chanjo',
    },
    phonetic: 'drop owt rayt',
    context: 'Percentage of children who start an immunization schedule (e.g. DTP1) but fail to complete it (DTP3).',
    contributor: 'vacfa',
  },
  {
    id: 'term-028',
    term: 'Ultra-cold chain',
    category: 'logistics',
    translations: {
      fr: 'chaîne ultra-froide (-80°C)',
      pt: 'cadeia ultrafria (-80°C)',
      sw: 'mfumo wa baridi kali sana (-80°C)',
    },
    phonetic: 'uhl-truh kohld chayn',
    context: 'Extreme temperature-controlled storage environment (-80°C to -60°C) necessary for sensitive mRNA vaccines.',
    contributor: 'vacfa',
  },
  {
    id: 'term-029',
    term: 'Cost of illness',
    category: 'policy',
    translations: {
      fr: 'coût de la maladie (COI)',
      pt: 'custo da doença (COI)',
      sw: 'gharama ya ugonjwa',
    },
    phonetic: 'kost uhv il-nis',
    context: 'Economic evaluation measuring the total financial burden of a vaccine-preventable disease.',
    contributor: 'vacfa',
  },
  {
    id: 'term-030',
    term: 'Health Technology Assessment',
    category: 'policy',
    translations: {
      fr: 'évaluation des technologies de santé (ETS / HTA)',
      pt: 'avaliação de tecnologias em saúde (ATS / HTA)',
      sw: 'tathmini ya teknolojia ya afya (HTA)',
    },
    phonetic: 'helth tek-nol-uh-jee uh-ses-muhnt',
    context: 'Systematic evaluation of properties, effects, and impacts of health interventions to inform policy.',
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
    translations: {
      fr: 'Bonjour à tous. Bienvenue au Sommet de Vaccination GAVI 2026.',
      pt: 'Bom dia a todos. Bem-vindos à Cúpula de Imunização GAVI 2026.',
      sw: 'Habari za asubuhi, kila mtu. Karibuni kwenye Mkutano wa Chanjo wa GAVI wa 2026.'
    },
    glossaryTerms: [],
  },
  {
    id: 'cap-002',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:00:28',
    originalText: 'Today we will be discussing the latest developments in mRNA vaccine technology and its deployment across Sub-Saharan Africa.',
    translations: {
      fr: `Aujourd'hui, nous allons discuter des derniers développements de la technologie des vaccins à ARNm et de son déploiement en Afrique subsaharienne.`,
      pt: `Hoje discutiremos os últimos desenvolvimentos da tecnologia de vacinas de mRNA e sua implantação na África Subsaariana.`,
      sw: `Leo tutajadili maendeleo ya hivi punde katika teknolojia ya chanjo ya mRNA na usambazaji wake kote katika Kusini mwa Jangwa la Sahara.`
    },
    glossaryTerms: ['mRNA vaccine'],
  },
  {
    id: 'cap-003',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:00:51',
    originalText: 'As many of you know, maintaining the cold chain has been one of our greatest challenges in reaching rural communities.',
    translations: {
      fr: `Comme beaucoup d'entre vous le savent, le maintien de la chaîne du froid a été l'un de nos plus grands défis pour atteindre les communautés rurales.`,
      pt: `Como muitos de vocês sabem, manter a cadeia de frio tem sido um dos nossos maiores desafios para alcançar as comunidades rurais.`,
      sw: `Kama wengi wenu mnavyojua, kudumisha mfumo wa baridi imekuwa moja ya changamoto zetu kubwa katika kufikia jamii za vijijini.`
    },
    glossaryTerms: ['Cold chain'],
  },
  {
    id: 'cap-004',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:01:15',
    originalText: 'Thank you, Dr. Osei. I would like to present our findings on seroconversion rates following the booster dose campaigns in West Africa.',
    translations: {
      fr: `Merci, Dr Osei. Je voudrais présenter nos résultats sur les taux de séroconversion suite aux campagnes de dose de rappel en Afrique de l'Ouest.`,
      pt: `Obrigado, Dra. Osei. Gostaria de apresentar nossas descobertas sobre as taxas de soroconversão após as campanhas de dose de reforço na África Ocidental.`,
      sw: `Asante, Dkt. Osei. Ningependa kuwasilisha matokeo yetu kuhusu viwango vya mabadiliko ya seramu kufuatia kampeni za dozi ya nyongeza huko Afrika Magharibi.`
    },
    glossaryTerms: ['seroconversion', 'booster dose'],
  },
  {
    id: 'cap-005',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:01:38',
    originalText: 'Our data shows that the lyophilized formulations performed exceptionally well in high-temperature environments, reducing dependency on traditional cold chain infrastructure.',
    translations: {
      fr: 'Nos données montrent que les formulations lyophilisées ont exceptionnellement bien fonctionné dans des environnements à haute température, réduisant la dépendance aux infrastructures traditionnelles de chaîne du froid.',
      pt: `Nossos dados mostram que as formulações liofilizadas tiveram um desempenho excepcionalmente bom em ambientes de alta temperatura, reduzindo a dependência da infraestrutura tradicional da cadeia de frio.`,
      sw: `Takwimu zetu zinaonyesha kuwa michanganyiko iliyokaushwa kwa baridi ilifanya vizuri sana katika mazingira ya joto la juu, na kupunguza utegemezi wa miundombinu ya jadi ya mfumo wa baridi.`
    },
    glossaryTerms: ['lyophilized', 'cold chain'],
  },
  {
    id: 'cap-006',
    speaker: 'Prof. Kwame Asante',
    timestamp: '09:02:05',
    originalText: 'The adjuvant we used in the trial significantly enhanced the immune response, particularly in populations with prior exposure.',
    translations: {
      fr: `L'adjuvant que nous avons utilisé dans l'essai a considérablement amélioré la réponse immunitaire, en particulier dans les populations avec une exposition antérieure.`,
      pt: `O adjuvante que usamos no ensaio melhorou significativamente a resposta imune, particularmente em populações com exposição prévia.`,
      sw: `Kisaidizi cha chanjo tulichotumia katika jaribio kiliongeza kwa kiasi kikubwa majibu ya kinga, hasa katika makundi yenye mfiduo wa awali.`
    },
    glossaryTerms: ['adjuvant'],
  },
  {
    id: 'cap-007',
    speaker: 'Dr. Fatima Diallo',
    timestamp: '09:02:30',
    originalText: 'I want to emphasize the importance of pharmacovigilance in these campaigns. We need robust surveillance systems to monitor adverse events.',
    translations: {
      fr: `Je veux souligner l'importance de la pharmacovigilance dans ces campagnes. Nous avons besoin de systèmes de surveillance robustes pour surveiller les événements indésirables.`,
      pt: `Quero enfatizar a importância da farmacovigilância nessas campanhas. Precisamos de sistemas de vigilância robustos para monitorar eventos adversos.`,
      sw: `Ninataka kusisitiza umuhimu wa uangalifu wa dawa katika kampeni hizi. Tunahitaji mifumo imara ya ufuatiliaji ili kufuatilia matukio mabaya.`
    },
    glossaryTerms: ['pharmacovigilance', 'surveillance'],
  },
  {
    id: 'cap-008',
    speaker: 'Dr. Fatima Diallo',
    timestamp: '09:02:52',
    originalText: 'The antigen stability data from Mozambique and Angola have been very encouraging for the Portuguese-speaking regions.',
    translations: {
      fr: `Les données de stabilité des antigènes du Mozambique et de l'Angola ont été très encourageantes pour les régions lusophones.`,
      pt: `Os dados de estabilidade do antígeno de Moçambique e Angola têm sido muito animadores para as regiões de língua portuguesa.`,
      sw: `Takwimu za uthabiti wa antijeni kutoka Msumbiji na Angola zimekuwa zikitia moyo sana kwa mikoa inayozungumza Kireno.`
    },
    glossaryTerms: ['antigen'],
  },
  {
    id: 'cap-009',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:03:18',
    originalText: 'Achieving herd immunity across the continent requires coordinated efforts between all national immunization programs.',
    translations: {
      fr: `Atteindre l'immunité collective à travers le continent nécessite des efforts coordonnés entre tous les programmes nationaux de vaccination.`,
      pt: `Alcançar a imunidade de rebanho em todo o continente requer esforços coordenados entre todos os programas nacionais de imunização.`,
      sw: `Kufikia kinga ya jamii kote barani kunahitaji juhudi za pamoja kati ya programu zote za kitaifa za chanjo.`
    },
    glossaryTerms: ['herd immunity'],
  },
  {
    id: 'cap-010',
    speaker: 'Dr. Amina Osei',
    timestamp: '09:03:45',
    originalText: 'Let us now hear from our regional coordinators about the progress in their respective areas.',
    translations: {
      fr: 'Écoutons maintenant nos coordinateurs régionaux sur les progrès réalisés dans leurs domaines respectifs.',
      pt: 'Vamos agora ouvir nossos coordenadores regionais sobre o progresso em suas respectivas áreas.',
      sw: 'Sasa tusikilize kutoka kwa waratibu wetu wa mikoa kuhusu maendeleo katika maeneo yao.'
    },
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
