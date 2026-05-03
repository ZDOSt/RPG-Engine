import {
    amount_gen,
    chat as liveChat,
    chat_metadata,
    eventSource,
    event_types,
    extractMessageBias,
    extension_prompt_roles,
    extension_prompt_types,
    Generate,
    main_api,
    name1,
    name2,
    saveChatDebounced,
    saveSettingsDebounced,
    sendMessageAsUser,
    setGenerationParamsFromPreset,
    setUserName,
    setExtensionPrompt,
} from '../../../../script.js';
import { oai_settings } from '../../../openai.js';
import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { selected_group } from '../../../group-chats.js';
import { persona_description_positions, power_user } from '../../../power-user.js';
import {
    getUserAvatars,
    initPersona,
    setPersonaDescription,
    user_avatar,
} from '../../../personas.js';
import {
    createNewWorldInfo,
    createWorldInfoEntry,
    loadWorldInfo,
    saveWorldInfo,
    updateWorldInfoList,
    world_names,
} from '../../../world-info.js';
import {
    DEFAULT_SETTINGS,
    CHARACTER_CREATOR_RACES,
    METADATA_KEY,
    buildFinalNarrationPayload,
    buildCharacterSheet,
    createTracker,
    describeNpcFeeling,
    parseCoreStats,
    parseNpcArchiveContent,
    rollCharacterCreatorBasics,
    rollCharacterCreatorStats,
    applyCharacterCreatorReroll,
    applyCharacterCreatorSwap,
    resolveTurn,
    serializeNpcArchiveEntry,
    summarizeTracker,
    upsertArchivedNpc,
} from './engine.js?v=0.1.220';

const EXT_ID = 'rpEngineTracker';
const EXT_VERSION = '0.1.220';
const MECHANICS_ARTIFACT_VERSION = 12;
const PROMPT_KEY = 'RP_ENGINE_TRACKER_HANDOFF';
const GROUNDING_PROMPT_KEY = 'RP_ENGINE_TRACKER_GROUNDED_WRITING_EARLY';
const MESSAGE_MECHANICS_KEY = 'rp_engine_mechanics';
const DEFAULT_ARCHIVE_WORLD = 'RP Engine NPC Archive';
const ARCHIVE_COMMENT_PREFIX = '[RPE NPC]';
const MECHANICS_PASS_SCHEMA = Object.freeze({
    name: 'rp_engine_mechanics_pass_v4_engine_functions',
    description: 'Mandatory RP Engine mechanics schema using engine function names.',
    strict: false,
    value: {
        type: 'object',
        additionalProperties: false,
        properties: {
            mode: { type: 'string', enum: ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'] },
            identifyGoal: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    goal: { type: 'string', maxLength: 140 },
                    goalKind: { type: 'string', enum: ['Normal', 'IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'] },
                    evidence: { type: 'string', maxLength: 180 },
                },
                required: ['goal', 'goalKind'],
            },
            identifyTargets: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ActionTargets: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
                    OppTargets: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            NPC: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
                            ENV: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 80 } },
                        },
                        required: ['NPC', 'ENV'],
                    },
                    BenefitedObservers: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
                    HarmedObservers: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
                    NPCInScene: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 60 } },
                    evidence: { type: 'string', maxLength: 180 },
                },
                required: ['ActionTargets', 'OppTargets', 'BenefitedObservers', 'HarmedObservers', 'NPCInScene'],
            },
            hasStakes: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    STAKES: { type: 'string', enum: ['Y', 'N'] },
                    evidence: { type: 'string', maxLength: 180 },
                },
                required: ['STAKES'],
            },
            checkIntimacyGate: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    IntimacyConsent: { type: 'string', enum: ['Y', 'N'] },
                    evidence: { type: 'string', maxLength: 180 },
                },
                required: ['IntimacyConsent'],
            },
            mapStats: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    USER: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
                    OPP: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
                    userEvidence: { type: 'string', maxLength: 160 },
                    oppEvidence: { type: 'string', maxLength: 160 },
                },
                required: ['USER', 'OPP'],
            },
            genStats: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        target: { type: 'string', maxLength: 60 },
                        Rank: { type: 'string', enum: ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'unknown'] },
                        MainStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'Balanced', 'unknown'] },
                        PHY: { type: 'integer', minimum: 1, maximum: 10 },
                        MND: { type: 'integer', minimum: 1, maximum: 10 },
                        CHA: { type: 'integer', minimum: 1, maximum: 10 },
                        evidence: { type: 'string', maxLength: 180 },
                    },
                    required: ['target', 'Rank', 'MainStat'],
                },
            },
            initPreset: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        NPC: { type: 'string', maxLength: 60 },
                        Label: {
                            type: 'string',
                            enum: ['romanticOpen', 'userBadRep', 'userGoodRep', 'userNonHuman', 'neutralDefault', 'unknown'],
                        },
                        evidence: { type: 'string', maxLength: 180 },
                    },
                    required: ['NPC', 'Label'],
                },
            },
            NPC_STAKES: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        NPC: { type: 'string', maxLength: 60 },
                        NPC_STAKES: { type: 'string', enum: ['Y', 'N'] },
                        evidence: { type: 'string', maxLength: 180 },
                    },
                    required: ['NPC', 'NPC_STAKES'],
                },
            },
            checkThreshold: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        NPC: { type: 'string', maxLength: 60 },
                        Override: {
                            type: 'string',
                            enum: ['Exploitation', 'Hedonist', 'Transactional', 'Established', 'NONE', 'unknown'],
                        },
                        evidence: { type: 'string', maxLength: 180 },
                    },
                    required: ['NPC', 'Override'],
                },
            },
            decisiveAction: { type: 'string', maxLength: 140 },
            why: { type: 'string', maxLength: 180 },
            outcomeOnSuccess: { type: 'string', maxLength: 160 },
            outcomeOnFailure: { type: 'string', maxLength: 160 },
            actionCount: { type: 'integer', minimum: 1, maximum: 3 },
            hostilePhysicalHarm: { type: 'string', enum: ['Y', 'N'] },
            newEncounterExplicit: { type: 'string', enum: ['Y', 'N'] },
            timeDeltaMinutes: { type: 'integer', minimum: -10080, maximum: 10080 },
            timeSkipReason: { type: 'string', maxLength: 120 },
            scene: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    location: { type: 'string', maxLength: 100 },
                    time: { type: 'string', maxLength: 80 },
                    weather: { type: 'string', maxLength: 80 },
                },
            },
            npcFacts: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: { type: 'string', maxLength: 60 },
                        aliases: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 80 } },
                        descriptor: { type: 'string', maxLength: 120 },
                        revealedFrom: { type: 'string', maxLength: 80 },
                        present: { type: 'boolean' },
                        position: { type: 'string', maxLength: 100 },
                        condition: { type: 'string', maxLength: 120 },
                        knowsUser: { type: 'string', maxLength: 80 },
                        explicitPreset: {
                            type: 'string',
                            enum: ['romanticOpen', 'userBadRep', 'userGoodRep', 'userNonHuman', 'neutralDefault', 'unknown'],
                        },
                        rank: { type: 'string', enum: ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'unknown'] },
                        mainStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'Balanced', 'unknown'] },
                        explicitStats: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                PHY: { type: 'integer', minimum: 1, maximum: 10 },
                                MND: { type: 'integer', minimum: 1, maximum: 10 },
                                CHA: { type: 'integer', minimum: 1, maximum: 10 },
                            },
                        },
                        override: {
                            type: 'string',
                            enum: ['Transactional', 'Hedonist', 'Exploitation', 'Established', 'NONE', 'unknown'],
                        },
                        archiveStatus: {
                            type: 'string',
                            enum: ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten', 'unknown'],
                        },
                    },
                    required: ['name'],
                },
            },
            inventoryDeltas: {
                type: 'array',
                maxItems: 6,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['gain', 'lose', 'equip', 'unequip', 'use', 'damage'] },
                        item: { type: 'string', maxLength: 100 },
                        evidence: { type: 'string', maxLength: 120 },
                    },
                    required: ['action', 'item'],
                },
            },
            taskDeltas: {
                type: 'array',
                maxItems: 6,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['add', 'complete', 'cancel'] },
                        task: { type: 'string', maxLength: 140 },
                        due: { type: 'string', maxLength: 80 },
                        source: { type: 'string', maxLength: 80 },
                        evidence: { type: 'string', maxLength: 120 },
                    },
                    required: ['action', 'task'],
                },
            },
        },
        required: [
            'mode',
            'identifyGoal',
            'identifyTargets',
            'hasStakes',
            'checkIntimacyGate',
            'mapStats',
            'genStats',
            'initPreset',
            'NPC_STAKES',
            'checkThreshold',
            'decisiveAction',
            'actionCount',
            'hostilePhysicalHarm',
            'newEncounterExplicit'
        ],
    },
});
const CHARACTER_CREATOR_SCHEMA = Object.freeze({
    name: 'rp_engine_character_creator',
    description: 'RP Engine character creator draft.',
    strict: false,
    value: {
        type: 'object',
        properties: {
            basic: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    race: { type: 'string' },
                    gender: { type: 'string' },
                    age: { type: 'string' },
                },
                required: ['name', 'race', 'gender', 'age'],
            },
            appearance: {
                type: 'object',
                properties: {
                    height: { type: 'string' },
                    build: { type: 'string' },
                    hair: { type: 'string' },
                    eyes: { type: 'string' },
                    skin: { type: 'string' },
                    distinctFeatures: { type: 'string' },
                },
                required: ['height', 'build', 'hair', 'eyes', 'skin', 'distinctFeatures'],
            },
            traits: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        effect: { type: 'string' },
                    },
                    required: ['name', 'effect'],
                },
            },
            abilities: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        effect: { type: 'string' },
                    },
                    required: ['name', 'effect'],
                },
            },
            inventory: { type: 'array', items: { type: 'string' } },
            notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['basic', 'appearance', 'traits', 'abilities', 'inventory', 'notes'],
    },
});

const RP_ENGINE_CONTEXT_PROMPT = Object.freeze([
    'AUTHORITATIVE RP MECHANICS ENGINES - CONTEXTUAL INTERPRETATION LAYER',
    '',
    'These mechanics engines define how user input is interpreted for Resolution and Relationship mechanics. They do not replace the roleplay role, character card, lore, or scenario. They define the hidden mechanics meaning of the latest user action.',
    'The extension code applies deterministic math after semantic fields are identified. Current numeric mechanics remain: core stats use 1-10 values, rolls use 1d20 + stat versus 1d20 + opposing stat, or 1d20 versus environment.',
    '',
    'function ResolutionEngine(input) {',
    '  const DEF = Object.freeze({',
    "    UNIVERSAL: 'EXPLICIT-ONLY. MUST be stated in Character Card / Lore / Scene text / tracker. NO invention. Uncertain = N or default. FIRST-YES-WINS = first matching explicit rule becomes final. No reconsideration. NEVER invent stats, targets, actions, obstacles, or outcomes. MAX 3 ACTIONS. TIE = DEFENDER / OPPOSITION WINS.',",
    "    STATS: 'PHY = challenges that require physical effort, strength, agility, speed, coordination, endurance, stealth movement, combat skill, or bodily execution under risk. MND = challenges that require thought, memory, perception, focus, reasoning, knowledge, awareness, will, or deliberate mental/supernatural exertion. CHA = social challenges that require persuasion, deception, intimidation, negotiation, emotional influence, personal presence, or interpersonal skill. Core stat scale is 1 to 10.',",
    "    STAKES: 'Stakes are meaningful possible consequences tied to success or failure. Stakes include physical risk, harm, danger, detection, material gain or loss, social status shift, loss of autonomy, meaningful obstacle resolution or failure, or explicit goal advancement or failure for {{user}} or a specific living entity. If success or failure would not materially change the outcome, no roll is needed.'",
    '  });',
    '',
    '  identifyGoal(input):',
    '    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS',
    "    rule: return a short, plain description of the final goal/intent of {{user}}'s actions in the last input",
    '    rule: if the goal is an explicit direct intimate advance toward a specific NPC, return IntimacyAdvancePhysical for physical contact or IntimacyAdvanceVerbal for verbal proposition',
    '    rule: flirting, compliments, teasing, affectionate tone, or non-explicit romantic/social behavior do NOT count as intimacy advances',
    '',
    '  identifyTargets(input, goal, context):',
    '    policy: LOCKED, EXPLICIT-ONLY',
    "    ActionTargets = LIVING entities targeted by {{user}}'s actions",
    "    OppTargets.NPC = LIVING entities who are actively or passively opposing, contesting, or resisting {{user}}'s actions",
    "    OppTargets.ENV = NON-LIVING environmental or terrain feature, hazard, object, or other obstacle directly obstructing {{user}}'s actions",
    "    BenefitedObservers = LIVING entities present in scene not in ActionTargets or OppTargets.NPC whose stakes improve as a result of {{user}}'s actions, as per DEF.STAKES",
    "    HarmedObservers = LIVING entities present in scene not in ActionTargets or OppTargets.NPC whose stakes worsen as a result of {{user}}'s actions, as per DEF.STAKES",
    '    rule: if any target list is not present, return [(none)]',
    '    return {ActionTargets, OppTargets, BenefitedObservers, HarmedObservers}',
    '',
    '  checkIntimacyGate(goal, targets, context):',
    '    policy: LOCKED, EXPLICIT-ONLY',
    '    rule: if goal=IntimacyAdvancePhysical or goal=IntimacyAdvanceVerbal, read exact target NPC entry in latest sceneTracker',
    '    rule: return Y if B>=4 under currentDisposition OR IntimacyGate=ALLOW',
    '    else -> N',
    '',
    '  hasStakes(input, goal, targets, IntimacyConsent, context):',
    '    policy: LOCKED, EXPLICIT-ONLY',
    '    rule: if goal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal] and IntimacyConsent=N, return Y',
    '    rule: if goal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal], return N',
    "    rule: return Y if success or failure of the explicit means used in input to pursue the goal could affect {{user}} or NPC's stakes, as per DEF.STAKES",
    '    else -> N',
    '',
    '  actionCount(input, goal):',
    '    policy: LOCKED, EXPLICIT-ONLY, MAX 3 ACTIONS',
    '    rule: only applies to explicit hostile/combat attack sequences',
    '    rule: do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as additional actions',
    '    rule: each individual attack within a sequence counts as one action',
    '    rule: return one action marker per attack: [a1], [a1,a2], or [a1,a2,a3]',
    '',
    '  mapStats(input, goal, targets, context):',
    '    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS',
    "    rule: if the final goal relies heavily on a specific enabling action, determine USER stat based strictly on that enabling action.",
    "    rule: determine {{user}} stat by applying DEF.STATS to the explicit action-attempt that determines whether {{user}}'s goal succeeds or fails.",
    '    rule: use final goal only if no distinct explicit means are present',
    "    rule: if OppTargets.NPC contains an opposing entity, determine opposing stat by applying DEF.STATS to that entity's resistance to {{user}}'s explicit means or goal",
    '    rule: if OppTargets.NPC=[(none)] and OppTargets.ENV contains an obstacle, OPP=ENV',
    '    return {USER, OPP}',
    '',
    '  MAGIC / SUPERNATURAL GUIDANCE:',
    '    rule: Magic is not a separate stat. Map it by decisive means and opposition mode.',
    '    rule: MND = deliberate supernatural exertion: casting, channeling, ritual focus, warding, dispelling, sensing magic, curses, blessings, healing, summoning, teleportation, divination, identifying magical effects.',
    '    rule: CHA = supernatural social influence: charm, glamour, compulsion through presence/speech, seductive magic, fear aura used to intimidate, magical deception aimed at belief or emotion.',
    '    rule: PHY = magical actions where bodily execution decides success: aiming a projectile under pressure, throwing alchemical magic, drawing a sigil while dodging, touching a resisting target, or delivering magic through a weapon strike.',
    '    rule: Living opposition never becomes ENV. If magic targets, deceives, controls, harms, detects, heals, restrains, or bypasses a living being, include that living being appropriately.',
    '',
    '  genStats(target, context):',
    '    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS',
    '    output: {Rank, MainStat, PHY, MND, CHA}',
    '    rule: use only if target currentCoreStats missing',
    '    rule: determine Rank from explicit portrayal only by comparing the target to narrative baselines',
    '    rankGuide:',
    '      Weak = clearly below an ordinary healthy adult',
    '      Average = roughly comparable to an ordinary healthy adult or ordinary capable creature',
    '      Trained = at least comparable to a trained and capable professional or dangerous lesser threat',
    '      Elite = clearly beyond ordinary trained professionals or lesser threats',
    '      Boss = overwhelmingly beyond elite',
    '    mainStat:',
    '      rule: identify the target clearest proficiency from explicit portrayal in scene/context/backstory, referring to DEF.STATS, and assign a primary stat',
    '      rule: MainStat must be PHY, MND, CHA, or Balanced',
    '    rule: exact PHY/MND/CHA values only if explicitly stated; otherwise code assigns within the current rank/mainStat range',
    '    return {Rank, MainStat, PHY, MND, CHA}',
    '}',
    '',
    'function RelationshipEngine(npc, resolutionPacket) {',
    '  const DEF = Object.freeze({',
    "    EO: 'EXPLICIT-ONLY. MUST be stated in Card / Lore / Scene text / tracker. NO inference. Uncertain=N.',",
    "    FYW: 'FIRST-YES-WINS. In ordered rule ladders, the first matching explicit rule becomes final.',",
    "    UNIVERSAL: 'Use resolutionPacket as final for GOAL, IntimacyConsent, LandedActions, OutcomeTier, Outcome, ActionTargets, OppTargets, BenefitedObservers, and HarmedObservers.',",
    "    BANDS: 'BOND(B): 1 Avoid/Ignore. 2 Neutral/Transactional. 3 Friendly/Comfortable. 4 Close/Trusting. FEAR(F): 1 Unshaken. 2 Alert/Wary. 3 Freezing/Submissive. 4 Terrified/Panic. HOSTILITY(H): 1 Warm/Loyal. 2 Neutral. 3 Aggressive/Obstructive. 4 Hatred/Violent.',",
    "    LOCK: 'If F=4 -> TERROR. Else if H=4 -> HATRED. Else if F=3 or H=3 -> FREEZE. If lock is active, behavior must equal lock.'",
    '  });',
    '',
    '  initPreset():',
    '    policy: EO, FYW',
    '    rule: use only if currentDisposition is missing',
    '    rule: NPC has explicit fear immunity only if same or superior kind/nature, superior being, or explicit natural fear/mental immunity',
    '    rule: title, rank, bravado, posturing, composure, or pretending to be fearless do NOT count as fear immunity',
    '    if NPC is already romantically/intimately involved with {{user}}, willing toward {{user}}, or in love -> {Label:romanticOpen,B:4,F:1,H:1}',
    '    if {{user}} is hated, distrusted, wanted, or bad-reputation -> {Label:userBadRep,B:1,F:2,H:3}',
    '    if {{user}} is admired, trusted, praised, good-reputation, or already known favorably -> {Label:userGoodRep,B:3,F:1,H:2}',
    '    if {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like AND NPC lacks explicit fear immunity -> {Label:userNonHuman,B:1,F:3,H:2}',
    '    else -> {Label:neutralDefault,B:2,F:2,H:2}',
    '',
    '  auditInteraction(npc, resolutionPacket):',
    '    policy: EO, FYW',
    "    rule: return Y only if {{user}}'s act materially improves this NPC's stakes: safety, resources, status, autonomy, or explicit goal advancement",
    '    rule: flirting, compliments, tone, or conversation alone do NOT count',
    '    if scene facts show such benefit -> Y',
    '    else -> N',
    '',
    '  checkThreshold(currentDisposition):',
    '    policy: EO, FYW',
    '    rule: override facts must be explicit; do not infer from mood or attraction alone',
    '    if NPC explicitly naive, trapped, dependent, coerced, powerless, or exploitable by {{user}} -> Override = Exploitation',
    '    else if NPC explicitly sexually open, pleasure-seeking, casual, or promiscuous -> Override = Hedonist',
    '    else if NPC explicitly willing to exchange intimacy for money, goods, favors, protection, status, or services -> Override = Transactional',
    '    else if NPC explicitly already intimate with {{user}} or specifically receptive toward {{user}} -> Override = Established',
    '    else -> Override = NONE',
    '',
    '  newEncounterExplicit():',
    '    policy: EO, FYW',
    '    rule: return Y only if explicit roleplay/context shows a clear encounter reset: sleep, rest, new day, significant downtime, leaving and returning later, or explicit later re-engagement after separation',
    '    else -> N',
    '}',
    '',
    'SCHEMA AUTHORITY:',
    '- At runtime, the extension will ask for a hidden schema using the exact function names above. Fill only the requested fields. Code will reject incomplete or contradictory schema, then apply deterministic mechanics.',
]).join('\n');

let resolving = false;
const activeQuietControllers = new Set();
let quietGenerationDepth = 0;
let panelDragMoved = false;
let characterCreatorState = null;
let lastMechanicsHandoff = {
    handoff: '',
    trackerSnapshot: null,
    display: null,
};
let pendingPanelRefreshAfterGeneration = false;
let pendingAuditDisplayAfterGeneration = null;
let visibleTrackerSnapshot = null;
let preparedMechanicsTurn = null;
let preparingMechanicsTurn = false;
let preparedMechanicsFailure = null;

function activePersonaText() {
    const contextPersona = getContext().powerUserSettings?.persona_description;
    const directPersona = power_user.persona_description;
    const selectedPersona = user_avatar ? power_user.persona_descriptions?.[user_avatar]?.description : '';
    const chatPersona = chat_metadata?.persona ? power_user.persona_descriptions?.[chat_metadata.persona]?.description : '';
    const uiPersona = $('#persona_description').val();
    return String(contextPersona || directPersona || selectedPersona || chatPersona || uiPersona || '');
}

function settings() {
    extension_settings[EXT_ID] = extension_settings[EXT_ID] || structuredClone(DEFAULT_SETTINGS);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[EXT_ID][key] === undefined) {
            extension_settings[EXT_ID][key] = value;
        }
    }
    if (extension_settings[EXT_ID].resolverTimeoutMs === 20000 || extension_settings[EXT_ID].resolverTimeoutMs === 90000) {
        extension_settings[EXT_ID].resolverTimeoutMs = DEFAULT_SETTINGS.resolverTimeoutMs;
    }
    if (Number(extension_settings[EXT_ID].resolverTimeoutMs) < 60000) {
        extension_settings[EXT_ID].resolverTimeoutMs = DEFAULT_SETTINGS.resolverTimeoutMs;
    }
    if (Number(extension_settings[EXT_ID].responseLength) < 700 || Number(extension_settings[EXT_ID].responseLength) > 1200) {
        extension_settings[EXT_ID].responseLength = DEFAULT_SETTINGS.responseLength;
    }
    if (!isFinitePosition(extension_settings[EXT_ID].panelPosition)) {
        extension_settings[EXT_ID].panelPosition = null;
    }
    if (typeof extension_settings[EXT_ID].npcArchiveWorld !== 'string') {
        extension_settings[EXT_ID].npcArchiveWorld = '';
    }
    if (typeof extension_settings[EXT_ID].scopeNpcArchivePerChat !== 'boolean') {
        extension_settings[EXT_ID].scopeNpcArchivePerChat = DEFAULT_SETTINGS.scopeNpcArchivePerChat;
    }
    for (const key of ['enableNpcArchive', 'autoCreateNpcArchive', 'pruneArchivedAbsentNpcs', 'rehydrateArchivedNpcs', 'autoRetireDeadNpcs']) {
        if (typeof extension_settings[EXT_ID][key] !== 'boolean') {
            extension_settings[EXT_ID][key] = Boolean(DEFAULT_SETTINGS[key]);
        }
    }
    if (typeof extension_settings[EXT_ID].enableTimeTracking !== 'boolean') {
        extension_settings[EXT_ID].enableTimeTracking = Boolean(DEFAULT_SETTINGS.enableTimeTracking);
    }
    if (!Number.isFinite(Number(extension_settings[EXT_ID].timeScaleWorldMinutesPerRealMinute)) || Number(extension_settings[EXT_ID].timeScaleWorldMinutesPerRealMinute) <= 0) {
        extension_settings[EXT_ID].timeScaleWorldMinutesPerRealMinute = DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute;
    }
    if (!Number.isFinite(Number(extension_settings[EXT_ID].timeTrackingMaxRealMinutes)) || Number(extension_settings[EXT_ID].timeTrackingMaxRealMinutes) <= 0) {
        extension_settings[EXT_ID].timeTrackingMaxRealMinutes = DEFAULT_SETTINGS.timeTrackingMaxRealMinutes;
    }
    for (const key of ['enableCharacterCreator', 'autoOfferCharacterCreator']) {
        if (typeof extension_settings[EXT_ID][key] !== 'boolean') {
            extension_settings[EXT_ID][key] = Boolean(DEFAULT_SETTINGS[key]);
        }
    }
    return extension_settings[EXT_ID];
}

function applyEngineContextPrompt() {
    setExtensionPrompt(
        GROUNDING_PROMPT_KEY,
        RP_ENGINE_CONTEXT_PROMPT,
        extension_prompt_types.IN_PROMPT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function clearEngineContextPrompt() {
    setExtensionPrompt(
        GROUNDING_PROMPT_KEY,
        '',
        extension_prompt_types.IN_PROMPT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function tracker() {
    chat_metadata[METADATA_KEY] = createTracker(chat_metadata[METADATA_KEY]);
    syncUserIdentityFromPersona(chat_metadata[METADATA_KEY]);
    return chat_metadata[METADATA_KEY];
}

function saveTracker() {
    chat_metadata[METADATA_KEY] = createTracker(chat_metadata[METADATA_KEY]);
    syncUserIdentityFromPersona(chat_metadata[METADATA_KEY]);
    chat_metadata.tainted = true;
    saveMetadataDebounced();
}

function syncUserIdentityFromPersona(current) {
    if (!current?.user) return;
    const personaText = activePersonaText();
    const parsedName = parsePersonaName(personaText);
    const personaName = user_avatar ? String(power_user.personas?.[user_avatar] || '').trim() : '';
    const fallbackName = String(name1 || '').trim();
    const chosen = parsedName
        || personaName
        || (/^(user|you|\{\{user\}\})$/i.test(fallbackName) ? '' : fallbackName);
    if (chosen) {
        current.user.name = chosen;
    }
    const userStats = parseCoreStats(personaText);
    if (userStats) {
        current.user.stats = userStats;
    }
    current.user.profile = buildUserProfileFromPersona(personaText);
    seedInventoryFromPersona(current, personaText);
}

function buildUserProfileFromPersona(personaText) {
    const text = String(personaText || '');
    return {
        race: extractPersonaField(text, 'Race'),
        appearance: compactPersonaAppearance(text),
        visiblyNonHuman: /\b(demon|demonic|monster|monstrous|undead|bestial|eldritch|construct|inhuman|horns?|tail|claws?|slit pupils?|visually obvious|looks like a full-blooded demon)\b/i.test(text) ? 'Y' : 'N',
        fullPersona: text,
    };
}

function seedInventoryFromPersona(current, personaText) {
    if (!current) return;
    const inventory = parsePersonaInventoryLines(personaText);
    if (!inventory.length) return;
    current.inventory = Array.isArray(current.inventory) ? current.inventory : [];
    const personaNorm = new Set(inventory.map(normalizeNameLocal));
    const currentIsPersonaSubset = current.inventory.length
        && current.inventory.every(item => personaNorm.has(normalizeNameLocal(item)));
    const canMergeSeed = !current.inventory.length || current.inventorySource === 'persona' || currentIsPersonaSubset;
    if (!canMergeSeed) return;
    const currentNorm = new Set(current.inventory.map(normalizeNameLocal));
    for (const item of inventory) {
        if (!currentNorm.has(normalizeNameLocal(item))) {
            current.inventory.push(item);
            currentNorm.add(normalizeNameLocal(item));
        }
    }
    current.inventorySource = 'persona';
}

function parsePersonaInventory(personaText) {
    const text = String(personaText || '');
    const section = text.match(/(?:^|\n)\s*(?:[#*= -]*)\s*(?:🎒\s*)?INVENTORY\b[^\n\r]*\n([\s\S]*?)(?=\n\s*(?:[#*= -]*)\s*(?:[A-Z][A-Z /]+|[📜👤🌙📊✨📓][^\n\r]*)\b|$)/i)?.[1] || '';
    if (!section) return [];
    return section
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*[-*•]\s*/, '').trim())
        .filter(Boolean)
        .filter(line => !/^=+$/.test(line))
        .map(line => line.replace(/\s+/g, ' ').slice(0, 160))
        .slice(0, 30);
}

function parsePersonaInventoryLines(personaText) {
    const lines = String(personaText || '').split(/\r?\n/);
    const items = [];
    let inInventory = false;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const heading = personaHeadingText(line);
        if (!inInventory) {
            if (/^inventory\b/i.test(heading)) inInventory = true;
            continue;
        }
        if (!line || /^=+$/.test(line)) continue;
        if (isPersonaSectionHeading(line)) break;
        const item = line
            .replace(/^\s*[-*•]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (item) items.push(item.slice(0, 160));
        if (items.length >= 30) break;
    }
    return items;
}

function personaHeadingText(line) {
    return String(line || '')
        .trim()
        .replace(/^#+\s*/, '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .trim();
}

function isPersonaSectionHeading(line) {
    const heading = personaHeadingText(line);
    return /^[A-Z][A-Z0-9 /&'-]{2,}:?$/.test(heading)
        || /^(basic info|appearance|stats|corestats|racial traits|traits|abilities|notes|additional notes|fighting style)\b/i.test(heading);
}

function extractPersonaField(text, label) {
    const match = String(text || '').match(new RegExp(`\\b${label}\\s*:\\s*([^\\n\\r|]+)`, 'i'));
    return cleanUiText(match?.[1] || '').slice(0, 120);
}

function compactPersonaAppearance(text) {
    const source = String(text || '');
    const labels = ['Race', 'Appearance', 'Eyes', 'Horns', 'Tail', 'Claws', 'Skin', 'Hands', 'Feet'];
    return labels
        .map(label => {
            const value = extractPersonaField(source, label);
            return value ? `${label}: ${value}` : '';
        })
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500);
}

function parsePersonaName(text) {
    const source = String(text || '');
    const patterns = [
        /\b(?:full\s+name|character\s+name|persona\s+name|name)\s*[:=]\s*([^\n\r|;]+)/i,
        /\{\{user\}\}\s*(?:is|=|:)\s*([A-Z][^\n\r|;]{1,60})/,
    ];
    for (const pattern of patterns) {
        const match = source.match(pattern);
        const candidate = cleanPersonaName(match?.[1]);
        if (candidate) return candidate;
    }
    return '';
}

function cleanPersonaName(value) {
    const text = String(value || '')
        .replace(/\[[^\]]*]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/^["'`]+|["'`,.]+$/g, '')
        .trim();
    if (!text || text.length > 60) return '';
    if (/^(unknown|none|null|n\/a|user|you|\{\{user\}\})$/i.test(text)) return '';
    if (/\b(PHY|MND|CHA|stats?|condition|gear|inventory|personality|age|race|class)\b/i.test(text)) return '';
    return text.replace(/\s+/g, ' ');
}

function parseJsonResponse(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        const tagged = raw.match(/<rp_engine_schema>\s*([\s\S]*?)\s*<\/rp_engine_schema>/i);
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidates = [
            tagged?.[1],
            fenced?.[1],
            ...extractBalancedJsonObjects(raw),
        ].filter(Boolean);
        for (const candidate of candidates) {
            try {
                return JSON.parse(candidate);
            } catch {
                // Try the next JSON-looking span.
            }
        }
    }
    return null;
}

function canonicalMechanicsMode(value) {
    const mode = String(value || '').trim();
    if (mode === 'N') return 'NO_STAKES';
    if (mode === 'S') return 'STAKES';
    if (mode === 'U') return 'SYSTEM_UPDATE';
    if (mode === 'O') return 'OOC_STOP';
    return ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'].includes(mode) ? mode : '';
}

function expandMechanicsMode(value) {
    return canonicalMechanicsMode(value) || 'NO_STAKES';
}

const MECHANICS_PASS_STATIC_PROMPT = Object.freeze([
    'You are the hidden @Depth 0 RP Engine schema pass. Return the schema artifact only.',
    'This schema pass is mandatory and authoritative. A visible roleplay reply is forbidden until this exact schema is complete.',
    'Your entire output MUST be one <rp_engine_schema> block containing one valid JSON object. No prose. No narration. No commentary.',
    'Open with <rp_engine_schema>, print the JSON object, then close with </rp_engine_schema>.',
    '',
    'PURPOSE:',
    '- Execute the ResolutionEngine(input) and RelationshipEngine(npc,resolutionPacket) contextual procedures already present in the prompt.',
    '- Fill schema fields with the exact same function names used by those engines: identifyGoal, identifyTargets, checkIntimacyGate, hasStakes, mapStats, genStats, initPreset, NPC_STAKES, checkThreshold.',
    '- Code will not decide semantic meaning. Code will validate your schema, roll dice, apply deterministic math, update tracker state, run Chaos/Proactivity, and build the narration handoff.',
    '- FIRST-YES-WINS. EXPLICIT-ONLY. Uncertain = conservative default. Never invent targets, stakes, stats, NPC facts, scene facts, motives, outcomes, or relationship changes.',
    '- If a roll might be needed, use mode=STAKES. If no explicit target/fact exists, leave the specific list empty.',
    '- Use full visible prompt context, tracker context, active exchange, latest user message, and recent chat excerpt.',
    '',
    'RUNTIME ORDER:',
    '1. Check OOC.',
    '2. identifyGoal(input): return the practical final goal/intent of the latest user input. If explicit direct intimacy toward a specific NPC, use IntimacyAdvancePhysical or IntimacyAdvanceVerbal.',
    '3. identifyTargets(input, goal, context): ActionTargets are living entities targeted by the user; OppTargetsNPC are living entities opposing/resisting/being attacked/refusing; OppTargetsENV are nonliving obstacles; Benefited/Harmed observers are living entities whose material stakes improve/worsen.',
    '4. checkIntimacyGate(goal, targets, context): return IntimacyConsent=Y only if the exact target is already eligible under B>=4 or IntimacyGate=ALLOW; otherwise N. Code will recompute the final gate.',
    '5. hasStakes(input, goal, targets, context): return STAKES when success/failure could materially change user/NPC stakes or when denied/uncertain intimacy, combat, opposition, risk, obstacle, coercion, deception, stealth, theft, magic, or harm matters.',
    '6. actionCount(input, goal): only explicit hostile/combat attack sequences count, max 3. Do not count setup, movement, defense, or flavor as extra attacks.',
    '7. mapStats(input, goal, targets, context): use DEF.STATS on the explicit decisive action; use final goal only if no distinct means exists. Living opposition cannot be ENV.',
    '8. initPreset(npc), NPC_STAKES/auditInteraction(npc,resolutionPacket), and checkThreshold override facts for relevant NPCs.',
    '9. Extract only explicit NPC, inventory, task, scene, and time facts needed for tracker updates.',
    '',
    'WHEN TO RETURN STAKES:',
    '- Any meaningful stakes: physical risk, harm, danger, detection, material gain/loss, social status shift, loss of autonomy, obstacle resolution, restricted information, or explicit goal advancement/failure.',
    '- Any combat, hostile physical action, intimidation, coercion, threat, demand, blackmail, deception, distraction, stealth, theft, chase, grapple, restraint, forced movement, or obstacle/hazard.',
    '- Any explicit intimacy advance, physical boundary issue, sexual/romantic proposition with possible refusal, or consent/intimacy gate relevance.',
    '- Any magic/supernatural exertion where limits, resistance, cost, target, risk, or uncertainty matter.',
    '',
    'WHEN NO_STAKES IS ALLOWED:',
    '- Only when the latest user action has no meaningful contested stakes and no dice should be rolled.',
    '- Ordinary harmless conversation, greetings, thanks, apologies, compliments, casual questions, harmless posture/movement, or automatic simple answers can be NO_STAKES.',
    '- No-roll can still be relationship-relevant. Include exact ActionTargets and NPCInScene for NPCs the user directly addresses or acts toward.',
    '- Include BenefitedObservers/HarmedObservers only if explicit material stakes improve/worsen. Pleasant tone alone is not a benefit.',
    '',
    'WHEN SYSTEM_UPDATE IS ALLOWED:',
    '- Pure tracker/continuity updates with no live contested action: explicit time passage, scene presence changes, archive status, task updates, inventory bookkeeping.',
    '- Keep npcFacts, inventoryDeltas, taskDeltas, scene, timeDeltaMinutes, and timeSkipReason accurate if explicitly stated.',
    '',
    'OOC:',
    '- Double parentheses ((like this)) are OOC_STOP. Return OOC_STOP and do not create in-scene targets.',
    '- Triple parentheses are proxy narration. Resolve the inner declared in-scene action normally as NO_STAKES, STAKES, or SYSTEM_UPDATE.',
    '- Do not infer proxy action from double parentheses. If the user wants proxy narration, they must use triple parentheses.',
    '',
    'FIELD GUIDANCE:',
    '- identifyGoal: short practical intent of the latest user message. If setup plus payoff exist, identifyGoal is the practical end state, not necessarily the first verb.',
    '- decisiveAction: the explicit action-attempt whose success/failure determines the result. For NO_STAKES this is usually the same harmless speech/action.',
    '- If the user says something as a tactic, distinguish tactic from goal: a lie may be decisiveAction while theft, escape, entry, or intimacy is the final goal.',
    '- If there is a clear enabling action, decisiveAction is that enabling action even when final goal is different.',
    '- Setup, movement, approach, flourish, drawing a weapon, taking a breath, repositioning, or recovery are not decisive unless they are the actual contested/risky step.',
    '- Combat exception: for hostile attack sequences, decisiveAction summarizes the whole sequence and actionCount counts distinct attempted attacks.',
    '- outcomeOnSuccess/outcomeOnFailure: optional brief plain results bounded by explicit stakes only.',
    '- goalKind: IntimacyAdvancePhysical or IntimacyAdvanceVerbal only for explicit direct intimacy advances toward a specific NPC; otherwise Normal.',
    '- If the user uses deception, distraction, stealth, pressure, or setup to enable a kiss, touch, embrace, cuddle, grope, or similar physical intimacy toward a specific NPC, goalKind is still IntimacyAdvancePhysical.',
    '- Flirting, compliments, teasing, affectionate tone, romance-coded attention, and non-explicit social behavior do not count as intimacy advances.',
    '- ActionTargets: living entities directly targeted by the user action. In GM/narrator chats, do not treat the assistant/GM character name as an NPC unless that exact living entity is explicitly present in scene.',
    '- OppTargetsNPC: living entities actively/passively opposing, resisting, refusing, guarding, perceiving, defending, or attacked. Empty for NO_STAKES unless opposition matters, in which case use STAKES.',
    '- OppTargetsENV: nonliving obstacle/hazard/object/terrain directly obstructing the action. Empty for NO_STAKES unless obstruction matters, in which case use STAKES.',
    '- Never put a living being in OppTargetsENV. If a guard, witness, owner, victim, pursuer, target, or observer is the thing the action must get past, use OppTargetsNPC.',
    '- BenefitedObservers/HarmedObservers: living observers whose material stakes improve/worsen while they are not direct targets and not opposing NPCs. Never place ActionTargets or OppTargets.NPC here. Never use for mere mood or pleasant tone.',
    '- NPCInScene: NPCs directly interacted with plus benefited/harmed observers. Include newly introduced scene NPCs only when explicitly present or directly interacted with.',
    '- If multiple same-role unnamed NPCs are present, use the exact tracker label, alias, or descriptor that identifies the intended one: Goblin 1, Goblin 2, Guard 1, the wounded goblin, the younger guard.',
    '- If "the goblin", "the guard", or a similar role phrase is ambiguous among multiple present NPCs and context does not identify one, do not invent certainty. Use the explicit group phrase only if the user acts on the group; otherwise keep target lists conservative and state ambiguity in why.',
    '- If currentInteractionTarget is present in tracker context and the latest user message uses a pronoun, reply/answer, payment, offer, gesture, or quoted speech that clearly continues the previous exchange, use currentInteractionTarget as the NPC target even if the role/name is not repeated.',
    '- If currentInteractionTarget or a single present NPC exists and the latest user message is a short physical/social action with a pronoun or omitted-but-obvious object, resolve that NPC as the target. Example pattern: prior NPC is speaking/holding/touching the user, then "I slap her" targets that NPC.',
    '- actionCount: 1 for noncombat; 1-3 only for explicit hostile/combat attack sequences.',
    '- Do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as combat actions.',
    '- USER/OPP: for NO_STAKES use MND/ENV defaults unless explicit semantics are clear. For STAKES, map from decisiveAction using PHY/MND/CHA definitions.',
    '- hostilePhysicalHarm=Y only for explicit hostile physical action meant to hurt or injure.',
    '- npcFacts: only exact explicit facts. For newly interacted or relevant NPCs, initPreset must include a Label. Also mirror that Label into npcFacts.explicitPreset if npcFacts is present.',
    '',
    'STAT DEFINITIONS FOR STAKES:',
    '- PHY = bodily execution under risk: force, agility, speed, endurance, coordination, combat, stealth movement, sleight of hand, escaping, chasing, climbing, jumping, grappling.',
    '- MND = cognition/perception/focus/knowledge/will: noticing, reasoning, tracking, survival, supernatural concentration, resisting mental pressure.',
    '- CHA = interpersonal influence/social masking: persuasion, deception, intimidation, negotiation, bargaining, command presence, emotional pressure, seduction/flirtation short of intimacy advance.',
    '- ENV is only nonliving opposition. Living opposition is never ENV.',
    '- Physical task vs nonliving/environmental opposition: USER=PHY, OPP=ENV.',
    '- Mental/perceptive/knowledge task vs nonliving/environmental opposition: USER=MND, OPP=ENV.',
    '- Physical contest vs living body/resistance, including combat, grapples, chases, shoves, blocking, forcing past, restraint, or escape from a hold: USER=PHY, OPP=PHY.',
    '- Physical execution vs living awareness, including stealth, hiding, slipping past, pickpocketing, or avoiding notice: USER=PHY, OPP=MND.',
    '- Non-hostile social influence vs living target, including sincere persuasion, diplomacy, negotiation, bargaining, rapport, or friendly appeal: USER=CHA, OPP=CHA.',
    '- Hostile/deceptive/concealed social influence vs living target, including bluff, lie, distraction, intimidation, coercion, blackmail, threat, demand, command, manipulation, or hiding intent: USER=CHA, OPP=MND.',
    '',
    'MAGIC / SUPERNATURAL GUIDANCE:',
    '- Magic is not a separate stat. Map it by decisive means and opposition mode.',
    '- MND = deliberate supernatural exertion: casting, channeling, ritual focus, warding, dispelling, sensing magic, curses, blessings, healing, summoning, teleportation, divination, identifying magical effects.',
    '- CHA = supernatural social influence: charm, glamour, compulsion through presence/speech, seductive magic, fear aura used to intimidate, magical deception aimed at belief or emotion.',
    '- PHY = magical actions where bodily execution decides success: aiming a projectile under pressure, throwing alchemical magic, drawing a sigil while dodging, touching a resisting target, or delivering magic through a weapon strike.',
    '- Living opposition never becomes ENV. If magic targets, deceives, controls, harms, detects, heals, restrains, or bypasses a living being, include that living being appropriately.',
    '',
    'RELATIONSHIP SEMANTIC INPUTS:',
    '- Your target/observer fields are semantic input to the Relationship Engine.',
    '- Mark BenefitedObservers only for non-target observers whose material stakes improve: safety, resources, status, autonomy, or explicit goal progress.',
    '- Mark HarmedObservers only for non-target observers whose material stakes worsen: safety, resources, status, autonomy, trust, property, or explicit goal progress.',
    '- Do not mark Bond just because of compliments, flirting, affectionate tone, or pleasant conversation; those are no-stakes unless explicit benefit exists.',
    '- Intimidation, coercion, menacing threats, forced submission, terror displays, blackmail, and leverage must be clear in identifyGoal/decisiveAction/why so Relationship can route Fear.',
    '- Direct attacks, injury attempts, hostile physical contact, theft from an NPC, autonomy violations, or denied intimacy must be clear in targets/why so Relationship can route Hostility or FearHostility.',
    '',
    'NPC INITIALIZATION GUIDANCE:',
    '- Use npcFacts only for NPCs present/relevant this turn.',
    '- For multiple same-role NPCs, preserve distinct labels and descriptors from tracker context. Do not merge Goblin 1/Goblin 2/Goblin 3 unless the text explicitly treats them as one group.',
    '- npcFacts.aliases may include old generic labels or observed descriptions. npcFacts.descriptor is a short identifying phrase from explicit observable context only.',
    '- If an unnamed tracked NPC has their personal name revealed, return npcFacts with name as the revealed name and revealedFrom set to the old tracker label/alias. Preserve the old label as an alias; do not create a fresh unrelated NPC.',
    '- explicitPreset=romanticOpen only if NPC is explicitly already romantically/intimately involved with the user, willing toward the user, or in love.',
    '- explicitPreset=userBadRep only if the user is explicitly hated, distrusted, wanted, or has bad reputation with this NPC/group.',
    '- explicitPreset=userGoodRep only if the user is explicitly admired, trusted, praised, or known favorably.',
    '- explicitPreset=userNonHuman only if user is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like AND NPC lacks explicit fear immunity.',
    '- Fear immunity requires explicit same/superior nature, superior being, or natural fear/mental immunity. Title, rank, bravado, composure, or pretending fearless does not count.',
    '- rank Weak: clearly below ordinary healthy adult. Average: ordinary healthy adult/capable creature. Trained: trained/capable professional or dangerous lesser threat. Elite: beyond ordinary trained professionals. Boss: overwhelmingly beyond elite.',
    '- mainStat must be PHY, MND, CHA, Balanced, or unknown from explicit portrayal only. explicitStats only if exact PHY/MND/CHA values are present. Do not invent exact stats.',
    '- override Transactional/Hedonist/Exploitation/Established only if explicitly stated; otherwise NONE/unknown.',
    '- archiveStatus only from explicit lifecycle facts: Active, Inactive, Dead, Retired, Forgotten, or unknown.',
    '',
    'TRACKER / TIME GUIDANCE:',
    '- scene.location/time/weather only when explicitly known.',
    '- npc position, condition, and knowsUser only from explicit facts. Otherwise empty/unknown.',
    '- inventoryDeltas require explicit evidence that an item was gained, lost, equipped, unequipped, used, or damaged.',
    '- taskDeltas add only when the user explicitly agrees/accepts/promises/schedules or an NPC explicitly assigns a task and the user accepts. Complete/cancel only with explicit evidence.',
    '- timeDeltaMinutes is only allowed from the latest user message, never from prior assistant narration or recent chat context.',
    '- Return timeDeltaMinutes only when the user explicitly declares a time skip/time passage, goes to sleep in-character, or completes travel to another destination such as "I go to the next town".',
    '- Do not return timeDeltaMinutes for ordinary movement, approach, walking in-scene, or travel being roleplayed along the way. Prior chat may describe elapsed time, but it is not a new time skip unless the latest user message says so.',
    '',
    'COMPACT OUTPUT FORMAT:',
    '- Use the exact engine function/schema names below. Keep values short. Do not write paragraphs.',
    '- Wrap the JSON in <rp_engine_schema>...</rp_engine_schema>. The tags are required for reliable extension parsing.',
    '- mode: NO_STAKES/STAKES/SYSTEM_UPDATE/OOC_STOP.',
    '- identifyGoal={goal, goalKind, evidence}. goalKind is Normal/IntimacyAdvancePhysical/IntimacyAdvanceVerbal.',
    '- identifyTargets={ActionTargets, OppTargets:{NPC,ENV}, BenefitedObservers, HarmedObservers, NPCInScene, evidence}. Every list contains short names/descriptors only.',
    '- hasStakes={STAKES, evidence}. STAKES is Y/N.',
    '- mapStats={USER, OPP, userEvidence, oppEvidence}. USER is PHY/MND/CHA. OPP is PHY/MND/CHA/ENV.',
    '- genStats=[{target,Rank,MainStat,PHY,MND,CHA,evidence}...] only for NPCs whose currentCoreStats are missing. Rank/MainStat are required; PHY/MND/CHA are optional and only when exact values are explicitly present. If uncertain, use Rank=unknown/MainStat=unknown and code will use deterministic fallback stats.',
    '- checkIntimacyGate={IntimacyConsent,evidence}. IntimacyConsent is Y only for existing B>=4 or IntimacyGate=ALLOW; otherwise N.',
    '- initPreset=[{NPC,Label,evidence}...] for every NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or NPCInScene. Label is romanticOpen/userBadRep/userGoodRep/userNonHuman/neutralDefault/unknown.',
    '- NPC_STAKES=[{NPC,NPC_STAKES,evidence}...] for every relevant NPC whose material stakes are evaluated for relationship movement. NPC_STAKES=Y only when safety, resources, status, autonomy, or explicit goal progress materially improves this turn. Conversation, compliments, flirtation, tone, or mere witnessing do not count.',
    '- checkThreshold=[{NPC,Override,evidence}...] for explicit intimacy override facts only. Override is Exploitation/Hedonist/Transactional/Established/NONE/unknown.',
    '- decisiveAction, actionCount, hostilePhysicalHarm, newEncounterExplicit are compact answers.',
    '- outcomeOnSuccess/outcomeOnFailure are optional short consequence meanings. scene/npcFacts/inventoryDeltas/taskDeltas are optional and only for explicit updates.',
    '',
    'MINIMUM REQUIRED JSON SKELETON:',
    '<rp_engine_schema>',
    '{',
    '  "mode": "NO_STAKES",',
    '  "identifyGoal": {"goal": "", "goalKind": "Normal", "evidence": ""},',
    '  "identifyTargets": {"ActionTargets": [], "OppTargets": {"NPC": [], "ENV": []}, "BenefitedObservers": [], "HarmedObservers": [], "NPCInScene": [], "evidence": ""},',
    '  "hasStakes": {"STAKES": "N", "evidence": ""},',
    '  "checkIntimacyGate": {"IntimacyConsent": "N", "evidence": ""},',
    '  "mapStats": {"USER": "MND", "OPP": "ENV", "userEvidence": "", "oppEvidence": ""},',
    '  "genStats": [],',
    '  "initPreset": [],',
    '  "NPC_STAKES": [],',
    '  "checkThreshold": [],',
    '  "decisiveAction": "",',
    '  "why": "",',
    '  "outcomeOnSuccess": "",',
    '  "outcomeOnFailure": "",',
    '  "actionCount": 1,',
    '  "hostilePhysicalHarm": "N",',
    '  "newEncounterExplicit": "N",',
    '  "timeDeltaMinutes": 0,',
    '  "timeSkipReason": "",',
    '  "scene": {"location": "", "time": "", "weather": ""},',
    '  "npcFacts": [],',
    '  "inventoryDeltas": [],',
    '  "taskDeltas": []',
    '}',
    '</rp_engine_schema>',
    '',
    'Copy this skeleton shape exactly, but replace the values with the correct contextual results.',
    '',
    'ENGINE FIELD MAP:',
    '- identifyGoal(input) -> identifyGoal.',
    '- identifyTargets(input, goal, context) -> identifyTargets.ActionTargets / identifyTargets.OppTargets.NPC / identifyTargets.OppTargets.ENV / identifyTargets.BenefitedObservers / identifyTargets.HarmedObservers / identifyTargets.NPCInScene.',
    '- hasStakes(input, goal, targets, context) -> hasStakes.STAKES.',
    '- mapStats(input, goal, targets, context) -> mapStats.USER / mapStats.OPP.',
    '- genStats(target, context) -> genStats[].',
    '- initPreset(npc, context) -> initPreset[].',
    '- auditInteraction(npc, resolutionPacket) for relationship stakes -> NPC_STAKES[].',
    '- checkThreshold(currentDisposition, npc context) override facts -> checkThreshold[].',
    '- hostile/combat intent to hurt or injure -> hostilePhysicalHarm.',
    '- newEncounterExplicit -> newEncounterExplicit.',
    '- Output compact JSON only inside the required tag block. Prefer short names, enums, empty arrays, and omitted optional objects over prose.',
    '- Required function-name fields are non-optional: identifyGoal, identifyTargets, hasStakes, checkIntimacyGate, mapStats, genStats, initPreset, NPC_STAKES, checkThreshold, decisiveAction, actionCount, hostilePhysicalHarm, newEncounterExplicit.',
]).join('\n');

function buildMechanicsPassPrompt({ chatExcerpt, latestUserMessage, tracker, userName, characterName }) {
    const resolverContext = buildSchemaRequestContext(tracker, latestUserMessage, chatExcerpt);
    return [
        MECHANICS_PASS_STATIC_PROMPT,
        '',
        `USER NAME: ${userName || '{{user}}'}`,
        `CHARACTER/ASSISTANT NAME: ${characterName || '{{char}}'}`,
        '',
        'SCHEMA REQUEST CONTEXT JSON:',
        JSON.stringify(resolverContext),
        '',
        'CONTEXT NOTE:',
        '- The normal prompt already contains the full RP Engine contextual rules and the full SillyTavern roleplay context available to this quiet pass.',
        '- This JSON is the current tracker/mechanics state for exact values, known NPC entries, current gates, inventory, and active exchange.',
        '- activeExchange identifies the latest user message, the most recent assistant message before it, and the best current living target if the chat makes one clear.',
        '- If a fact is absent from this compact context, treat it as unknown/no new evidence. Absence is never permission to invent facts, targets, stats, motives, outcomes, or relationship state.',
        '',
        'LATEST USER MESSAGE TO RESOLVE:',
        latestUserMessage || '(none)',
        '',
        'RECENT CHAT EXCERPT:',
        chatExcerpt,
        '',
        'Return exactly this shape: <rp_engine_schema>{...valid compact JSON...}</rp_engine_schema>',
        'No markdown, no explanation, no visible narration.',
    ].join('\n');
}

function buildMechanicsRepairPrompt({ priorPrompt, rawSchema, expandedSchema, issues }) {
    return [
        priorPrompt,
        '',
        'MANDATORY SCHEMA REPAIR REQUIRED:',
        'The prior output contradicted or omitted required RP Engine function outputs. Correct it now.',
        'This generation is still a hidden schema pass. Visible narration is forbidden.',
        'Return exactly one corrected <rp_engine_schema> block using the exact same schema. Do not explain.',
        '',
        'Validation issues:',
        ...issues.map(issue => `- ${issue}`),
        '',
        'Prior raw schema JSON:',
        formatJsonForDisplay(rawSchema).slice(0, 5000),
        '',
        'Prior expanded schema JSON:',
        formatJsonForDisplay(expandedSchema).slice(0, 5000),
    ].join('\n');
}

function mechanicsPassFailure(message, details = {}) {
    const error = new Error(message);
    error.rpEngineSchemaFailure = true;
    error.details = details;
    return error;
}

function mechanicsPassInvalidReasons(pass, extraction, validationIssues = []) {
    const issues = Array.isArray(validationIssues) ? [...validationIssues] : [];
    if (!pass || typeof pass !== 'object') {
        issues.push('mechanics pass did not return a JSON object');
        return uniqueLocal(issues).slice(0, 12);
    }
    const mode = canonicalMechanicsMode(pass.m || pass.mode);
    if (!mode) {
        issues.push('mode must be NO_STAKES, STAKES, SYSTEM_UPDATE, or OOC_STOP');
    }
    const goal = String(pass.identifyGoal?.goal ?? pass.identifyGoal ?? pass.g ?? pass.goal ?? '').trim();
    const decisiveAction = String(pass.a || pass.decisiveAction || '').trim();
    if (!goal || /^(unspecified|unknown|none|null|n\/a)$/i.test(goal)) {
        issues.push('identifyGoal.goal must be a concrete contextual result');
    }
    if (!decisiveAction || /^(unspecified|unknown|none|null|n\/a)$/i.test(decisiveAction)) {
        issues.push('decisiveAction must be a concrete contextual result');
    }
    if (!pass.identifyTargets || typeof pass.identifyTargets !== 'object') {
        issues.push('identifyTargets must be present as an object');
    }
    if (!pass.hasStakes || typeof pass.hasStakes !== 'object') {
        issues.push('hasStakes must be present as an object');
    }
    if (!pass.mapStats || typeof pass.mapStats !== 'object') {
        issues.push('mapStats must be present as an object');
    }
    if (!Array.isArray(pass.genStats)) {
        issues.push('genStats must be present as an array');
    }
    if (!Array.isArray(pass.initPreset)) {
        issues.push('initPreset must be present as an array');
    }
    if (!Array.isArray(pass.NPC_STAKES)) {
        issues.push('NPC_STAKES must be present as an array');
    }
    if (!Array.isArray(pass.checkThreshold)) {
        issues.push('checkThreshold must be present as an array');
    }
    if (!extraction || typeof extraction !== 'object') {
        issues.push('schema could not be expanded into deterministic mechanics input');
    }
    return uniqueLocal(issues).slice(0, 12);
}

async function runMechanicsPass({
    sourceChat,
    latestUserMessage,
    current,
    userName,
    characterName,
}) {
    const prompt = buildMechanicsPassPrompt({
        chatExcerpt: makeChatExcerpt(sourceChat),
        latestUserMessage,
        tracker: current,
        userName,
        characterName,
    });

    let response = '';
    let pass = null;
    let extraction = null;
    let issues = [];
    let repaired = false;
    let repairResponse = '';
    let repairPass = null;
    try {
        response = await generateQuietPromptWithTimeout({
            quietPrompt: prompt,
            skipWIAN: false,
            responseLength: mechanicsPassResponseLength(),
            removeReasoning: false,
        }, Math.min(Number(settings().resolverTimeoutMs) || DEFAULT_SETTINGS.resolverTimeoutMs, 45000));
        pass = parseJsonResponse(response);
        if (pass && typeof pass === 'object') {
            extraction = expandMechanicsPass(pass, latestUserMessage);
            issues = mechanicsPassInvalidReasons(pass, extraction, validateExpandedMechanicsSchema(extraction, pass));
        } else {
            issues = mechanicsPassInvalidReasons(pass, extraction, ['schema response could not be parsed as JSON']);
        }
        if (issues.length) {
            repairResponse = await generateQuietPromptWithTimeout({
                quietPrompt: buildMechanicsRepairPrompt({
                    priorPrompt: prompt,
                    rawSchema: pass,
                    expandedSchema: extraction,
                    issues,
                }),
                skipWIAN: false,
                responseLength: mechanicsPassResponseLength(),
                removeReasoning: false,
            }, Math.min(Number(settings().resolverTimeoutMs) || DEFAULT_SETTINGS.resolverTimeoutMs, 45000));
            repairPass = parseJsonResponse(repairResponse);
            if (repairPass && typeof repairPass === 'object') {
                const repairExtraction = expandMechanicsPass(repairPass, latestUserMessage);
                const repairIssues = mechanicsPassInvalidReasons(repairPass, repairExtraction, validateExpandedMechanicsSchema(repairExtraction, repairPass));
                if (repairIssues.length <= issues.length) {
                    repaired = true;
                    issues = repairIssues;
                    extraction = repairExtraction;
                }
            }
        }
        const finalPass = repaired ? repairPass : pass;
        const ok = Boolean(finalPass && typeof finalPass === 'object' && extraction && !issues.length);
        return {
            ok,
            mode: expandMechanicsMode(finalPass?.m || finalPass?.mode),
            pass: finalPass,
            originalPass: pass,
            response,
            repairResponse,
            repaired,
            validationIssues: issues,
            extraction: ok ? extraction : null,
            expandedExtraction: extraction,
        };
    } catch (error) {
        console.warn('[RP Engine Tracker] Mechanics schema pass failed.', error);
        return {
            ok: false,
            mode: 'SCHEMA_ERROR',
            pass,
            originalPass: pass,
            response,
            repairResponse,
            repaired,
            validationIssues: mechanicsPassInvalidReasons(repairPass || pass, extraction, [error?.message || String(error)]),
            extraction: null,
            expandedExtraction: extraction,
            error: error?.message || String(error),
        };
    }
}

function mechanicsPassResponseLength() {
    return 900;
}

function buildResolverContext(currentTracker, latestUserMessage = '', chatExcerpt = '') {
    const current = createTracker(currentTracker);
    const text = `${latestUserMessage || ''}\n${chatExcerpt || ''}`;
    const mentionedNames = mentionedNpcNamesForResolver(current, text);
    const relevantNpcIds = new Set([
        ...(current.presentNpcIds || []),
        ...mentionedNames
            .map(name => findNpcIdLocal(current, name))
            .filter(Boolean),
    ]);
    const relevantNpcs = [...relevantNpcIds]
        .map(id => current.npcs?.[id])
        .filter(Boolean)
        .map(compactNpcForResolver);

    return {
        scene: current.scene,
        worldClock: compactClockForResolver(current.worldClock),
        user: current.user,
        userProfile: current.user?.profile || {},
        activeExchange: current.activeExchange || null,
        presentNpcNames: (current.presentNpcIds || [])
            .map(id => current.npcs?.[id]?.name)
            .filter(Boolean),
        currentInteractionTarget: current.currentInteractionTarget || '',
        relevantNpcs,
        inventory: current.inventory.slice(0, 30),
        pendingTasks: relevantTasksForResolver(current.pendingTasks, text, 8),
        recentAudit: compactAuditForResolver(current.lastAudit),
    };
}

function buildSchemaRequestContext(currentTracker, latestUserMessage = '', chatExcerpt = '') {
    const context = buildResolverContext(currentTracker, latestUserMessage, chatExcerpt);
    return {
        scene: context.scene,
        worldClock: context.worldClock,
        user: context.user,
        activeExchange: context.activeExchange,
        presentNpcNames: context.presentNpcNames,
        currentInteractionTarget: context.currentInteractionTarget,
        relevantNpcs: context.relevantNpcs,
        inventory: context.inventory,
        pendingTasks: context.pendingTasks,
        recentAudit: context.recentAudit,
    };
}

function mentionedNpcNamesForResolver(current, text) {
    const source = String(text || '');
    return Object.values(current?.npcs || {})
        .filter(npc => npc?.name)
        .filter(npc => [npc.name, ...(Array.isArray(npc.aliases) ? npc.aliases : [])]
            .filter(Boolean)
            .some(name => mentionedByText(source, name)))
        .map(npc => npc.name);
}

function findNpcIdLocal(current, name) {
    const wanted = normalizeNameLocal(name);
    for (const [id, npc] of Object.entries(current?.npcs || {})) {
        if (normalizeNameLocal(npc?.name) === wanted) return id;
        if ((npc?.aliases || []).some(alias => normalizeNameLocal(alias) === wanted)) return id;
    }
    return '';
}

function compactNpcForResolver(npc) {
    return {
        id: npc.id,
        name: npc.name,
        aliases: Array.isArray(npc.aliases) ? npc.aliases.slice(0, 4) : [],
        descriptor: npc.descriptor || '',
        revealedFrom: npc.revealedFrom || '',
        present: npc.present !== false,
        position: npc.position || '',
        condition: npc.condition || 'unknown',
        disposition: npc.disposition || null,
        rapport: Number.isFinite(Number(npc.rapport)) ? Number(npc.rapport) : 0,
        rapportEncounterLock: npc.rapportEncounterLock || 'N',
        intimacyGate: npc.intimacyGate || 'SKIP',
        coreStats: npc.coreStats || null,
        rank: npc.rank || 'unknown',
        mainStat: npc.mainStat || 'unknown',
        override: npc.override || 'NONE',
        archiveStatus: npc.archiveStatus || 'Active',
        knowsUser: npc.knowsUser || npc.knowsAboutUser || 'unknown',
        continuity: npc.continuity || '',
        pending: npc.pending || '',
    };
}

function compactClockForResolver(clock) {
    return {
        enabled: clock?.enabled !== false,
        absoluteMinutes: Number.isFinite(Number(clock?.absoluteMinutes)) ? Number(clock.absoluteMinutes) : null,
        scale: Number.isFinite(Number(clock?.scale)) ? Number(clock.scale) : DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute,
        lastAdvance: clock?.lastAdvance || '',
        source: clock?.source || 'unset',
    };
}

function relevantListForResolver(list, text, limit) {
    const source = String(text || '').toLowerCase();
    const values = Array.isArray(list) ? list.map(x => String(x || '').trim()).filter(Boolean) : [];
    const relevant = values.filter(item => source.includes(item.toLowerCase()));
    return uniqueLocal([...relevant, ...values.slice(0, limit)]).slice(0, limit);
}

function relevantTasksForResolver(tasks, text, limit) {
    const source = String(text || '').toLowerCase();
    const values = Array.isArray(tasks) ? tasks : [];
    const compact = values.map(task => {
        if (typeof task === 'string') return { task, status: 'Active' };
        return {
            task: String(task?.task || '').trim(),
            due: String(task?.due || '').trim(),
            source: String(task?.source || '').trim(),
            status: String(task?.status || 'Active').trim(),
        };
    }).filter(task => task.task);
    const relevant = compact.filter(task => source.includes(task.task.toLowerCase()));
    return [...relevant, ...compact.filter(task => !relevant.includes(task))].slice(0, limit);
}

function compactAuditForResolver(audit) {
    if (!audit?.resolutionPacket) return null;
    const packet = audit.resolutionPacket;
    return {
        goal: packet.GOAL || '',
        outcome: packet.Outcome || '',
        outcomeTier: packet.OutcomeTier || '',
        actionTargets: packet.ActionTargets || [],
        oppTargets: packet.OppTargets || { NPC: [], ENV: [] },
        npcInScene: packet.NPCInScene || [],
        at: audit.at || '',
    };
}

function expandMechanicsPass(pass, latestUserMessage) {
    const mode = expandMechanicsMode(pass?.m || pass?.mode);
    const text = String(latestUserMessage || '').trim();
    const fallbackGoal = text.slice(0, 140) || 'latest user action';
    const isOocStop = mode === 'OOC_STOP';
    const isSystemUpdate = mode === 'SYSTEM_UPDATE';
    const hasStakesValue = pass?.hasStakes?.STAKES ?? pass?.hasStakes ?? pass?.STAKES;
    const hasStakes = mode === 'STAKES' || String(hasStakesValue || '').toUpperCase() === 'Y' ? 'Y' : 'N';
    const reason = compactString(pass?.why ?? pass?.e ?? pass?.reason, 300);
    const identifyGoal = pass?.identifyGoal && typeof pass.identifyGoal === 'object'
        ? pass.identifyGoal
        : { goal: pass?.identifyGoal ?? pass?.g ?? pass?.goal, goalKind: pass?.k ?? pass?.goalKind, evidence: pass?.goalEvidence };
    const identifyTargets = pass?.identifyTargets && typeof pass.identifyTargets === 'object'
        ? pass.identifyTargets
        : {
            ActionTargets: pass?.ActionTargets ?? pass?.at ?? pass?.actionTargets,
            OppTargets: {
                NPC: pass?.OppTargetsNPC ?? pass?.on ?? pass?.oppTargetsNpc,
                ENV: pass?.OppTargetsENV ?? pass?.oe ?? pass?.oppTargetsEnv,
            },
            BenefitedObservers: pass?.BenefitedObservers ?? pass?.bo ?? pass?.benefitedObservers,
            HarmedObservers: pass?.HarmedObservers ?? pass?.ho ?? pass?.harmedObservers,
            NPCInScene: pass?.NPCInScene ?? pass?.ns ?? pass?.npcInScene,
            evidence: pass?.targetEvidence,
        };
    const mapStats = pass?.mapStats && typeof pass.mapStats === 'object'
        ? pass.mapStats
        : {
            USER: pass?.USER ?? pass?.us ?? pass?.userStat,
            OPP: pass?.OPP ?? pass?.os ?? pass?.oppStat,
            userEvidence: pass?.userStatEvidence,
            oppEvidence: pass?.oppStatEvidence,
        };
    const checkIntimacyGate = pass?.checkIntimacyGate && typeof pass.checkIntimacyGate === 'object'
        ? pass.checkIntimacyGate
        : {
            IntimacyConsent: pass?.IntimacyConsent ?? pass?.intimacyConsent,
            evidence: pass?.intimacyEvidence,
        };
    const goal = compactString(identifyGoal.goal, 140);
    const decisiveAction = compactString(pass?.a ?? pass?.decisiveAction, 140);
    const oocInstruction = isOocStop ? extractDoubleParenInner(text) || reason : '';
    const npcFacts = mergeGenStatsIntoNpcFacts(
        mergeRelationshipSemanticFacts(
            expandCompactNpcFacts(pass?.npcFacts ?? pass?.nf),
            expandInitPreset(pass?.initPreset),
            expandCheckThreshold(pass?.checkThreshold),
        ),
        expandGenStats(pass?.genStats),
    );
    const targetEvidence = compactString(identifyTargets.evidence, 300);
    const stakeEvidence = compactString(pass?.hasStakes?.evidence ?? pass?.stakesEvidence, 300);
    return {
        ooc: isOocStop ? 'Y' : 'N',
        oocMode: isOocStop ? 'STOP' : 'IC',
        oocInstruction,
        goal: goal || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        goalKind: ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(identifyGoal.goalKind) ? identifyGoal.goalKind : 'Normal',
        goalEvidence: compactString(identifyGoal.evidence, 300) || reason || text,
        decisiveAction: decisiveAction || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        decisiveActionEvidence: reason || compactString(pass?.decisiveActionEvidence, 300) || text,
        outcomeOnSuccess: compactString(pass?.win ?? pass?.outcomeOnSuccess, 160),
        outcomeOnFailure: compactString(pass?.fail ?? pass?.outcomeOnFailure, 160),
        actionTargets: arrayFromCompact(identifyTargets.ActionTargets),
        oppTargetsNpc: hasStakes === 'Y' ? arrayFromCompact(identifyTargets.OppTargets?.NPC) : [],
        oppTargetsEnv: hasStakes === 'Y' ? arrayFromCompact(identifyTargets.OppTargets?.ENV) : [],
        benefitedObservers: arrayFromCompact(identifyTargets.BenefitedObservers),
        harmedObservers: arrayFromCompact(identifyTargets.HarmedObservers),
        npcInScene: arrayFromCompact(identifyTargets.NPCInScene),
        hasStakes,
        checkIntimacyGate: {
            IntimacyConsent: String(checkIntimacyGate.IntimacyConsent || '').toUpperCase() === 'Y' ? 'Y' : 'N',
            evidence: compactString(checkIntimacyGate.evidence, 300),
        },
        stakesEvidence: stakeEvidence || targetEvidence || reason || (hasStakes === 'Y'
            ? 'Mechanics pass found explicit meaningful stakes.'
            : 'Mechanics pass classified this as no-roll with no meaningful contested stakes.'),
        actionCount: Math.max(1, Math.min(3, Number(pass?.ac ?? pass?.actionCount) || 1)),
        userStat: ['PHY', 'MND', 'CHA'].includes(mapStats.USER) ? mapStats.USER : 'MND',
        userStatEvidence: compactString(mapStats.userEvidence, 160),
        oppStat: ['PHY', 'MND', 'CHA', 'ENV'].includes(mapStats.OPP) ? mapStats.OPP : 'ENV',
        oppStatEvidence: compactString(mapStats.oppEvidence, 160),
        hostilePhysicalHarm: (pass?.hp ?? pass?.hostilePhysicalHarm) === 'Y' ? 'Y' : 'N',
        newEncounter: (pass?.newEncounterExplicit ?? pass?.ne ?? pass?.newEncounter) === 'Y' ? 'Y' : 'N',
        timeDeltaMinutes: Number.isFinite(Number(pass?.tdm ?? pass?.timeDeltaMinutes)) ? Number(pass.tdm ?? pass.timeDeltaMinutes) : 0,
        timeSkipReason: compactString(pass?.tsr ?? pass?.timeSkipReason, 120),
        systemOnlyUpdate: isSystemUpdate ? 'Y' : 'N',
        systemOnlyUpdateReason: isSystemUpdate ? reason || 'Mechanics pass classified this as a pure tracker/continuity update.' : '',
        scene: {
            location: compactString(pass?.scene?.location ?? pass?.sc?.l, 100),
            time: compactString(pass?.scene?.time ?? pass?.sc?.t, 80),
            weather: compactString(pass?.scene?.weather ?? pass?.sc?.w, 80),
        },
        npcFacts,
        npcStakes: expandNpcStakes(pass?.NPC_STAKES ?? pass?.npcStakes),
        inventoryDeltas: expandCompactInventoryDeltas(pass?.inventoryDeltas ?? pass?.inv),
        taskDeltas: expandCompactTaskDeltas(pass?.taskDeltas ?? pass?.tasks),
        resolverMode: 'mechanics_pass',
        mechanicsPassMode: mode,
        mechanicsPassReason: reason,
        modelSchema: pass && typeof pass === 'object' ? structuredClone(pass) : null,
    };
}

function validateExpandedMechanicsSchema(extraction, rawPass = null) {
    const issues = [];
    if (!extraction || typeof extraction !== 'object') return ['schema did not expand into an object'];
    const goalKind = extraction.goalKind || 'Normal';
    const hasActionTarget = Array.isArray(extraction.actionTargets) && extraction.actionTargets.length > 0;
    const hasOppNpc = Array.isArray(extraction.oppTargetsNpc) && extraction.oppTargetsNpc.length > 0;
    const hasOppEnv = Array.isArray(extraction.oppTargetsEnv) && extraction.oppTargetsEnv.length > 0;
    const hasLivingTarget = hasActionTarget || hasOppNpc;
    const hasRelevantNpc = hasLivingTarget
        || (Array.isArray(extraction.benefitedObservers) && extraction.benefitedObservers.length > 0)
        || (Array.isArray(extraction.harmedObservers) && extraction.harmedObservers.length > 0)
        || (Array.isArray(extraction.npcInScene) && extraction.npcInScene.length > 0);

    if (!rawPass?.identifyGoal || typeof rawPass.identifyGoal !== 'object') issues.push('identifyGoal must be an object with goal and goalKind');
    if (!rawPass?.identifyTargets || typeof rawPass.identifyTargets !== 'object') issues.push('identifyTargets must be an object with ActionTargets, OppTargets, BenefitedObservers, HarmedObservers, NPCInScene');
    if (!rawPass?.checkIntimacyGate || typeof rawPass.checkIntimacyGate !== 'object') issues.push('checkIntimacyGate must be present, even when IntimacyConsent=N');
    if (!Array.isArray(rawPass?.initPreset)) issues.push('initPreset must be present as an array');
    if (!Array.isArray(rawPass?.NPC_STAKES)) issues.push('NPC_STAKES must be present as an array');
    if (!Array.isArray(rawPass?.checkThreshold)) issues.push('checkThreshold must be present as an array');

    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goalKind)) {
        if (!hasLivingTarget) issues.push(`${goalKind} requires a living ActionTargets or OppTargets.NPC entry resolved from context`);
        if (String(extraction.hasStakes || '').toUpperCase() !== 'Y' && extraction.checkIntimacyGate?.IntimacyConsent !== 'Y') {
            issues.push(`${goalKind} with IntimacyConsent=N must return hasStakes.STAKES=Y`);
        }
        if (extraction.oppStat === 'ENV') issues.push(`${goalKind} cannot use OPP=ENV when a living target is involved`);
    }

    if (extraction.hostilePhysicalHarm === 'Y') {
        if (!hasLivingTarget) issues.push('hostilePhysicalHarm=Y requires a living target/opponent');
        if (String(extraction.hasStakes || '').toUpperCase() !== 'Y') issues.push('hostilePhysicalHarm=Y requires hasStakes.STAKES=Y');
        if (extraction.userStat !== 'PHY') issues.push('hostilePhysicalHarm=Y should map USER=PHY unless explicit context says otherwise');
    }

    if (hasOppNpc && extraction.oppStat === 'ENV') issues.push('OppTargets.NPC present means mapStats.OPP cannot be ENV');
    if (String(extraction.hasStakes || '').toUpperCase() === 'Y' && !hasLivingTarget && !hasOppEnv && extraction.oocMode !== 'STOP') {
        issues.push('hasStakes.STAKES=Y requires a living target/opponent or environmental obstacle');
    }

    const directOrOpp = new Set([...(extraction.actionTargets || []), ...(extraction.oppTargetsNpc || [])].map(normalizeNameLocal));
    for (const name of extraction.benefitedObservers || []) {
        if (directOrOpp.has(normalizeNameLocal(name))) issues.push(`BenefitedObservers cannot include direct target/opponent: ${name}`);
    }
    for (const name of extraction.harmedObservers || []) {
        if (directOrOpp.has(normalizeNameLocal(name))) issues.push(`HarmedObservers cannot include direct target/opponent: ${name}`);
    }

    if (hasRelevantNpc) {
        const initialized = new Set((rawPass?.initPreset || []).map(entry => normalizeNameLocal(entry?.NPC || entry?.name)));
        const needed = [
            ...(extraction.actionTargets || []),
            ...(extraction.oppTargetsNpc || []),
            ...(extraction.benefitedObservers || []),
            ...(extraction.harmedObservers || []),
            ...(extraction.npcInScene || []),
        ].filter(Boolean);
        for (const name of needed) {
            if (!initialized.has(normalizeNameLocal(name))) {
                issues.push(`initPreset missing for relevant NPC: ${name}`);
            }
        }
    }

    return uniqueLocal(issues).slice(0, 12);
}

function latestUserMessageHasExplicitTimeChange(text) {
    if (/\b(go to sleep|fall asleep|sleep for the night|turn in for the night|rest for the night)\b/i.test(String(text || ''))) {
        return true;
    }
    const source = String(text || '').toLowerCase();
    const outsideQuotes = source.replace(/["“”][\s\S]*?["“”]/g, ' ');
    if (/\b(skip|timeskip|time skip|wait|sleep|go to sleep|fall asleep|rest until|after|later|pass(?:es|ed)?|until|overnight)\b/.test(outsideQuotes)
        && /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter)\s*(?:minutes?|mins?|hours?|hrs?|days?)\b|\bovernight\b|\buntil\s+(?:morning|dawn|sunrise)\b/.test(outsideQuotes)) {
        return true;
    }
    if (/\b(?:go|head|travel|ride|set out|depart|leave)\s+(?:to|for|into)\s+(?:the\s+)?(?:next\s+)?(?:town|city|village|camp|castle|keep|forest|market|temple|destination)\b/.test(outsideQuotes)
        && !/\b(along the way|on the way|as I go|while traveling|roleplay|scene by scene|slowly|carefully|continue walking|approach|walk up to)\b/.test(outsideQuotes)) {
        return true;
    }
    return false;
}

function validateTimeExtractionForLatestUserMessage(extraction, latestUserMessage) {
    if (!extraction || typeof extraction !== 'object') return extraction;
    if (!Number(extraction.timeDeltaMinutes || 0)) return extraction;
    if (latestUserMessageHasExplicitTimeChange(latestUserMessage)) return extraction;
    extraction.timeDeltaMinutes = 0;
    extraction.timeSkipReason = '';
    return extraction;
}

function scrubUnauthorizedTimeAdvance(result, latestUserMessage) {
    if (!result || latestUserMessageHasExplicitTimeChange(latestUserMessage)) return result;
    const extraction = result.audit?.extraction || {};
    const clock = result.tracker?.worldClock || {};
    const packet = result.packet || {};
    const unauthorizedExplicit = Number(extraction.timeDeltaMinutes || 0) !== 0
        || /^Explicit skip\b/i.test(String(clock.lastAdvance || ''))
        || /^explicit-skip/i.test(String(clock.source || ''))
        || /^Explicit skip\b/i.test(String(packet.TimeAdvance || ''));
    if (!unauthorizedExplicit) return result;

    extraction.timeDeltaMinutes = 0;
    extraction.timeSkipReason = '';
    if (result.tracker?.worldClock) {
        result.tracker.worldClock.lastAdvance = 'No world-time advance this turn.';
        result.tracker.worldClock.source = 'no-user-time-change';
    }
    if (result.packet) {
        result.packet.TimeAdvance = 'No world-time advance this turn.';
        result.packet.SceneTime = result.tracker?.scene?.time || result.packet.SceneTime || '';
    }
    if (result.audit?.resolutionPacket) {
        result.audit.resolutionPacket.TimeAdvance = result.packet?.TimeAdvance || '';
        result.audit.resolutionPacket.SceneTime = result.packet?.SceneTime || '';
    }
    return result;
}

function arrayFromCompact(value) {
    return Array.isArray(value) ? value.map(x => String(x || '').trim()).filter(Boolean) : [];
}

function compactString(value, max = 180) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function expandCompactNpcFacts(value) {
    if (!Array.isArray(value)) return [];
    return value.map((fact) => ({
        name: compactString(fact?.n ?? fact?.name, 60),
        aliases: arrayFromCompact(fact?.aliases ?? fact?.al).slice(0, 6),
        descriptor: compactString(fact?.descriptor ?? fact?.desc ?? fact?.d, 120),
        revealedFrom: compactString(fact?.revealedFrom ?? fact?.rf, 80),
        present: fact?.p ?? fact?.present,
        position: compactString(fact?.pos ?? fact?.position, 100),
        condition: compactString(fact?.c ?? fact?.condition, 120),
        knowsUser: compactString(fact?.ku ?? fact?.knowsUser, 80),
        explicitPreset: fact?.ep ?? fact?.explicitPreset ?? 'unknown',
        rank: fact?.r ?? fact?.rank ?? 'unknown',
        mainStat: fact?.ms ?? fact?.mainStat ?? 'unknown',
        explicitStats: fact?.st ?? fact?.explicitStats ?? null,
        override: fact?.o ?? fact?.override ?? 'unknown',
        archiveStatus: fact?.arc ?? fact?.archiveStatus ?? 'unknown',
    })).filter(fact => fact.name);
}

function expandGenStats(value) {
    if (!Array.isArray(value)) return [];
    return value.map(entry => {
        const stats = {
            PHY: Number(entry?.PHY),
            MND: Number(entry?.MND),
            CHA: Number(entry?.CHA),
        };
        const hasStats = ['PHY', 'MND', 'CHA'].every(stat => Number.isFinite(stats[stat]) && stats[stat] >= 1 && stats[stat] <= 10);
        return {
            name: compactString(entry?.target ?? entry?.name, 60),
            rank: entry?.Rank ?? entry?.rank ?? 'unknown',
            mainStat: entry?.MainStat ?? entry?.mainStat ?? 'unknown',
            explicitStats: hasStats ? stats : null,
        };
    }).filter(entry => entry.name);
}

function mergeGenStatsIntoNpcFacts(facts, genStats) {
    const output = Array.isArray(facts) ? [...facts] : [];
    for (const statFact of genStats || []) {
        const index = output.findIndex(fact => normalizeNameLocal(fact.name) === normalizeNameLocal(statFact.name));
        if (index >= 0) {
            output[index] = {
                ...output[index],
                rank: statFact.rank || output[index].rank,
                mainStat: statFact.mainStat || output[index].mainStat,
                explicitStats: statFact.explicitStats || output[index].explicitStats,
            };
        } else {
            output.push({
                name: statFact.name,
                aliases: [],
                descriptor: '',
                revealedFrom: '',
                position: '',
                condition: '',
                knowsUser: '',
                explicitPreset: 'unknown',
                rank: statFact.rank,
                mainStat: statFact.mainStat,
                explicitStats: statFact.explicitStats,
                override: 'unknown',
                archiveStatus: 'unknown',
            });
        }
    }
    return output;
}

function expandInitPreset(value) {
    if (!Array.isArray(value)) return [];
    return value.map(entry => ({
        name: compactString(entry?.NPC ?? entry?.npc ?? entry?.name, 60),
        explicitPreset: entry?.Label ?? entry?.label ?? entry?.explicitPreset ?? 'unknown',
        evidence: compactString(entry?.evidence ?? entry?.why, 180),
    })).filter(entry => entry.name);
}

function expandCheckThreshold(value) {
    if (!Array.isArray(value)) return [];
    return value.map(entry => ({
        name: compactString(entry?.NPC ?? entry?.npc ?? entry?.name, 60),
        override: entry?.Override ?? entry?.override ?? 'unknown',
        evidence: compactString(entry?.evidence ?? entry?.why, 180),
    })).filter(entry => entry.name);
}

function mergeRelationshipSemanticFacts(facts, initPreset, checkThreshold) {
    const output = Array.isArray(facts) ? [...facts] : [];
    const ensureFact = (name) => {
        const wanted = normalizeNameLocal(name);
        let index = output.findIndex(fact => normalizeNameLocal(fact.name) === wanted);
        if (index < 0) {
            output.push({
                name,
                aliases: [],
                descriptor: '',
                revealedFrom: '',
                position: '',
                condition: '',
                knowsUser: '',
                explicitPreset: 'unknown',
                rank: 'unknown',
                mainStat: 'unknown',
                explicitStats: null,
                override: 'unknown',
                archiveStatus: 'unknown',
            });
            index = output.length - 1;
        }
        return output[index];
    };
    for (const preset of initPreset || []) {
        const fact = ensureFact(preset.name);
        if (preset.explicitPreset) fact.explicitPreset = preset.explicitPreset;
    }
    for (const threshold of checkThreshold || []) {
        const fact = ensureFact(threshold.name);
        if (threshold.override) fact.override = threshold.override;
    }
    return output;
}

function expandNpcStakes(value) {
    if (!Array.isArray(value)) return [];
    return value.map(entry => ({
        NPC: compactString(entry?.NPC ?? entry?.npc ?? entry?.name, 60),
        NPC_STAKES: String((entry?.NPC_STAKES ?? entry?.npcStakes ?? entry?.stakes) || '').toUpperCase() === 'Y' ? 'Y' : 'N',
        evidence: compactString(entry?.evidence ?? entry?.why, 180),
    })).filter(entry => entry.NPC);
}

function expandCompactInventoryDeltas(value) {
    if (!Array.isArray(value)) return [];
    return value.map((delta) => ({
        action: delta?.act ?? delta?.action,
        item: compactString(delta?.item, 100),
        evidence: compactString(delta?.e ?? delta?.evidence, 120),
    })).filter(delta => delta.item);
}

function expandCompactTaskDeltas(value) {
    if (!Array.isArray(value)) return [];
    return value.map((delta) => ({
        action: delta?.act ?? delta?.action,
        task: compactString(delta?.task, 140),
        due: compactString(delta?.due, 80),
        source: compactString(delta?.src ?? delta?.source, 80),
        evidence: compactString(delta?.e ?? delta?.evidence, 120),
    })).filter(delta => delta.task);
}

function extractDoubleParenInner(text) {
    const match = String(text || '').match(/^\s*\(\((?!\()([\s\S]*?)(?<!\))\)\)\s*$/);
    return match ? match[1].trim() : '';
}

function extractBalancedJsonObjects(raw) {
    const spans = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start >= 0) {
                spans.push(raw.slice(start, i + 1));
                start = -1;
            }
        }
    }

    return spans;
}

function messageText(message) {
    if (!message || typeof message !== 'object') return '';
    const value = message.mes ?? message.content ?? message.text ?? message.message ?? '';
    if (Array.isArray(value)) {
        return value.map(part => typeof part === 'string' ? part : (part?.text || '')).join(' ');
    }
    return String(value || '');
}

function makeChatExcerpt(chat) {
    const count = Number(settings().recentMessages) || DEFAULT_SETTINGS.recentMessages;
    return chat
        .slice(-count)
        .map((message) => {
            const isUser = message.is_user || message.role === 'user' || message.name === name1;
            const role = isUser ? (name1 || 'User') : (message.name || name2 || 'Assistant');
            const text = messageText(message).replace(/\s+/g, ' ').trim();
            return `${role}: ${text}`;
        })
        .filter(x => x.trim())
        .join('\n');
}

function inferCurrentInteractionTargetFromChat(chat) {
    const source = Array.isArray(chat) ? chat : [];
    const latestUserIndex = source.findLastIndex?.(isUserMessage) ?? (() => {
        for (let i = source.length - 1; i >= 0; i--) {
            if (isUserMessage(source[i])) return i;
        }
        return -1;
    })();
    if (latestUserIndex <= 0) return '';

    for (let i = latestUserIndex - 1; i >= 0; i--) {
        const message = source[i];
        if (isUserMessage(message)) break;
        if (!isAssistantMessage(message)) continue;
        const speaker = currentSpeakerLabel(message);
        if (speaker) return speaker;
    }
    return '';
}

function buildActiveExchangeContext(chat, latestUserMessage = '') {
    const source = Array.isArray(chat) ? chat : [];
    const latestUserIndex = source.findLastIndex?.(isUserMessage) ?? (() => {
        for (let i = source.length - 1; i >= 0; i--) {
            if (isUserMessage(source[i])) return i;
        }
        return -1;
    })();
    let previousAssistant = null;
    if (latestUserIndex > 0) {
        for (let i = latestUserIndex - 1; i >= 0; i--) {
            const message = source[i];
            if (isUserMessage(message)) break;
            if (isAssistantMessage(message)) {
                previousAssistant = message;
                break;
            }
        }
    }
    const assistantText = messageText(previousAssistant).replace(/\s+/g, ' ').trim();
    const speaker = currentSpeakerLabel(previousAssistant);
    return {
        latestUserMessage: String(latestUserMessage || '').trim(),
        previousAssistantSpeaker: speaker,
        previousAssistantText: assistantText.slice(0, 1200),
        currentInteractionTarget: speaker,
    };
}

function currentSpeakerLabel(message) {
    const explicitName = String(message?.name || '').trim();
    if (explicitName && !isGenericNarratorName(explicitName)) {
        return cleanSceneNpcName(explicitName);
    }
    const text = messageText(message).trim();
    const firstLine = text.split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
    if (/^[-–—]*\s*[A-Z][A-Za-z0-9_'\- ]{1,50}\s*:?$/.test(firstLine)) {
        return cleanSceneNpcName(firstLine.replace(/^[-–—]+\s*/, '').replace(/:$/, '').trim());
    }
    const rolePrefix = text.match(/^\s*([A-Z][A-Za-z0-9_'\- ]{1,50})\s*:\s*["“]/);
    if (rolePrefix) return cleanSceneNpcName(rolePrefix[1]);
    const roleLine = text.match(/^\s*[-–—]\s*([A-Z][A-Za-z0-9_'\- ]{1,50})\s*\n/);
    if (roleLine) return cleanSceneNpcName(roleLine[1]);
    return '';
}

function isGenericNarratorName(value) {
    return /^(assistant|system|narrator|narration|storyteller|game master|gamemaster|gm|dungeon master|dm|world|scenario)$/i.test(String(value || '').trim());
}

function getLatestUserMessage(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        const roleName = String(message.name || '').trim();
        if (message.is_user || message.role === 'user' || roleName === name1 || message.force_avatar === 'persona') {
            const text = messageText(message).trim();
            if (text) return text;
        }
    }
    return messageText(chat.at(-1)).trim();
}

function getMessageById(messageId) {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id < 0) return null;
    const contextChat = getContext().chat;
    if (Array.isArray(contextChat) && contextChat[id]) return contextChat[id];
    if (Array.isArray(liveChat) && liveChat[id]) return liveChat[id];
    return null;
}

function isUserMessage(message) {
    const roleName = String(message?.name || '').trim();
    return message?.is_user || message?.role === 'user' || roleName === name1 || message?.force_avatar === 'persona';
}

function isAssistantMessage(message) {
    return !!message
        && !isUserMessage(message)
        && !message.is_system
        && message.extra?.type !== 'narrator'
        && !!messageText(message).trim();
}

function resolveAssistantMessageId(messageId) {
    const id = Number(messageId);
    const sources = [
        Array.isArray(getContext().chat) ? getContext().chat : [],
        Array.isArray(liveChat) ? liveChat : [],
    ].filter(x => x.length);
    for (const source of sources) {
        if (Number.isFinite(id) && isAssistantMessage(source[id])) return id;
        for (let i = source.length - 1; i >= 0; i--) {
            if (isAssistantMessage(source[i])) return i;
        }
    }
    return id;
}

function getPreviousUserMessageForId(messageId) {
    const id = Number(messageId);
    const sourceChat = [
        Array.isArray(getContext().chat) ? getContext().chat : [],
        Array.isArray(liveChat) ? liveChat : [],
    ].find(x => x.length) || [];
    for (let i = Math.min(id - 1, sourceChat.length - 1); i >= 0; i--) {
        const message = sourceChat[i];
        const roleName = String(message?.name || '').trim();
        if (message?.is_user || message?.role === 'user' || roleName === name1 || message?.force_avatar === 'persona') {
            const text = messageText(message).trim();
            if (text) return text;
        }
    }
    return getLatestUserMessage(sourceChat);
}

function getPreviousUserMessageStrictForId(messageId) {
    const id = Number(messageId);
    const sourceChat = [
        Array.isArray(getContext().chat) ? getContext().chat : [],
        Array.isArray(liveChat) ? liveChat : [],
    ].find(x => x.length) || [];
    for (let i = Math.min(id - 1, sourceChat.length - 1); i >= 0; i--) {
        const message = sourceChat[i];
        const roleName = String(message?.name || '').trim();
        if (message?.is_user || message?.role === 'user' || roleName === name1 || message?.force_avatar === 'persona') {
            return messageText(message).trim();
        }
    }
    return '';
}

async function runResolver(chat) {
    const resolverStartedAt = Date.now();
    let current = tracker();
    const context = getContext();
    const sourceChat = [
        Array.isArray(context.chat) ? context.chat : [],
        Array.isArray(liveChat) ? liveChat : [],
        Array.isArray(chat) ? chat : [],
    ].find(x => x.length) || [];
    const personaText = activePersonaText();
    const userName = parsePersonaName(personaText) || (user_avatar ? power_user.personas?.[user_avatar] : '') || name1;
    const userStats = parseCoreStats(personaText);
    if (userStats) {
        current.user.stats = userStats;
    }
    if (userName) {
        current.user.name = userName;
    }
    const latestUserMessage = getLatestUserMessage(sourceChat)
        || getLatestUserMessage(liveChat)
        || getLatestUserMessage(chat);
    await rehydrateArchivedNpcsForText(`${latestUserMessage}\n${makeChatExcerpt(sourceChat)}`);
    current = tracker();
    current.activeExchange = buildActiveExchangeContext(sourceChat, latestUserMessage);
    current.currentInteractionTarget = current.activeExchange?.currentInteractionTarget || inferCurrentInteractionTargetFromChat(sourceChat);
    console.debug('[RP Engine Tracker] Resolver start', { latestUserMessage, currentInteractionTarget: current.currentInteractionTarget });

    let parsed = null;
    const mechanicsResult = await runMechanicsPass({
        sourceChat,
        latestUserMessage,
        current,
        userName,
        characterName: name2,
    });
    if (mechanicsResult?.extraction) {
        parsed = mechanicsResult.extraction;
        parsed.modelSchema = structuredClone(mechanicsResult.pass || null);
        parsed.originalModelSchema = mechanicsResult.repaired ? structuredClone(mechanicsResult.originalPass || null) : null;
        parsed.schemaRepaired = mechanicsResult.repaired ? 'Y' : 'N';
        parsed.schemaValidationIssues = Array.isArray(mechanicsResult.validationIssues) ? [...mechanicsResult.validationIssues] : [];
        parsed.schemaRawResponse = String(mechanicsResult.response || '').slice(0, 6000);
        parsed.schemaRepairResponse = String(mechanicsResult.repairResponse || '').slice(0, 6000);
    }

    if (!parsed) {
        const issues = Array.isArray(mechanicsResult?.validationIssues) && mechanicsResult.validationIssues.length
            ? mechanicsResult.validationIssues
            : ['model did not complete the mandatory mechanics schema'];
        throw mechanicsPassFailure('RP Engine schema pass failed. The model must return a complete mechanics schema before narration can proceed.', {
            latestUserMessage,
            modelSchema: mechanicsResult?.pass || null,
            originalModelSchema: mechanicsResult?.originalPass || null,
            expandedExtraction: mechanicsResult?.expandedExtraction || null,
            validationIssues: issues,
            rawResponse: mechanicsResult?.response || '',
            repairResponse: mechanicsResult?.repairResponse || '',
            error: mechanicsResult?.error || '',
        });
    }

    parsed = validateTimeExtractionForLatestUserMessage(parsed, latestUserMessage);
    parsed = await guardDeadArchiveReentry(parsed, latestUserMessage);
    const resolved = resolveTurn(parsed, current, { userStats });
    applyTimeTracking(resolved.tracker, current, resolved.audit?.extraction);
    resolved.packet.SceneTime = resolved.tracker.scene?.time || '';
    resolved.packet.TimeAdvance = resolved.tracker.worldClock?.lastAdvance || '';
    scrubUnauthorizedTimeAdvance(resolved, latestUserMessage);
    console.debug('[RP Engine Tracker] Resolver complete', {
        packet: resolved.packet,
        elapsedMs: Date.now() - resolverStartedAt,
        mechanicsPassMode: mechanicsResult?.mode || 'fail_closed',
    });
    return resolved;
}

function trackerSnapshotForRollback(value) {
    const snapshot = createTracker(value);
    if (snapshot.lastAudit?.preTurnTrackerSnapshot) {
        delete snapshot.lastAudit.preTurnTrackerSnapshot;
    }
    snapshot.lastAuditDisplay = null;
    return structuredClone(snapshot);
}

function attachTurnRollback(result, triggerUserMessage, snapshot) {
    if (!result?.tracker?.lastAudit || !snapshot) return;
    const audit = result.tracker.lastAudit;
    audit.triggerUserMessage = String(triggerUserMessage || '').trim();
    audit.preTurnTrackerSnapshot = snapshot;
    if (result.audit && result.audit !== audit) {
        result.audit.triggerUserMessage = audit.triggerUserMessage;
        result.audit.preTurnTrackerSnapshot = snapshot;
    }
}

function hydrateResultFromMechanicsArtifact(payload, latestUserMessage = '') {
    const artifact = payload?.mechanicsArtifact;
    if (!artifact?.trackerSnapshot || !artifact?.packet) return null;
    if (Number(artifact.version || 0) < MECHANICS_ARTIFACT_VERSION) return null;
    const trackerSnapshot = createTracker(artifact.trackerSnapshot);
    const audit = artifact.audit ? structuredClone(artifact.audit) : trackerSnapshot.lastAudit;
    const result = {
        tracker: trackerSnapshot,
        packet: structuredClone(artifact.packet),
        npcHandoffs: structuredClone(artifact.npcHandoffs || []),
        chaosHandoff: structuredClone(artifact.chaosHandoff || null),
        proactivityHandoff: structuredClone(artifact.proactivityHandoff || {}),
        aggressionResults: structuredClone(artifact.aggressionResults || {}),
        audit,
        reusedMechanicsArtifact: true,
    };
    if (result.audit) {
        result.audit.reusedMechanicsArtifact = true;
        result.audit.triggerUserMessage = String(latestUserMessage || payload.triggerUserMessage || '').trim();
    }
    return result;
}

function cachedMechanicsForLatestUserMessage(chat, latestUserMessage) {
    const id = findLatestUserMessageIdByText(latestUserMessage, chat);
    if (id === null || id === undefined || !Number.isFinite(Number(id))) return null;
    const message = getMessageById(id);
    const payload = message?.[MESSAGE_MECHANICS_KEY];
    if (!payload?.mechanicsArtifact) return null;
    if (Number(payload.mechanicsArtifact.version || 0) < MECHANICS_ARTIFACT_VERSION) return null;
    if (String(payload.triggerUserMessage || '').trim() !== String(latestUserMessage || '').trim()) return null;
    return hydrateResultFromMechanicsArtifact(payload, latestUserMessage);
}

async function prepareMechanicsAtAfterCommands(type, options = {}, isDryRun = false) {
    const cfg = settings();
    applyEngineContextPrompt();
    if (isDryRun || !cfg.enabled || shouldSkipMechanicsForGenerationType(type)) return;
    const normalizedType = String(type || 'normal').toLowerCase();
    if (['regenerate', 'swipe'].includes(normalizedType)) return;
    if (preparingMechanicsTurn || resolving) return;

    const textarea = $('#send_textarea');
    const pendingText = String(textarea.val() || '');
    const pendingClean = pendingText.trim();
    if (!pendingClean) return;

    clearMechanicsHandoff();
    preparedMechanicsTurn = null;
    preparedMechanicsFailure = null;
    const preTurnSnapshot = trackerSnapshotForRollback(tracker());
    preparingMechanicsTurn = true;
    resolving = true;
    try {
        const bias = extractMessageBias(pendingText);
        textarea.val('')[0]?.dispatchEvent(new Event('input', { bubbles: true }));
        await sendMessageAsUser(pendingText, bias);

        const sourceChat = Array.isArray(getContext().chat) && getContext().chat.length ? getContext().chat : liveChat;
        const latestUserMessage = getLatestUserMessage(sourceChat) || pendingClean;
        const result = await runResolver(sourceChat);
        attachTurnRollback(result, latestUserMessage, preTurnSnapshot);
        chat_metadata[METADATA_KEY] = result.tracker;

        const handoff = cfg.injectHandoff
            ? buildFinalNarrationPayload({
                packet: result.packet,
                npcHandoffs: result.npcHandoffs,
                chaosHandoff: result.chaosHandoff,
                proactivityHandoff: result.proactivityHandoff,
                aggressionResults: result.aggressionResults,
            })
            : '';

        setMechanicsHandoff(handoff);
        const display = buildMechanicsDisplayPayload(result, handoff, latestUserMessage, sourceChat);
        preparedMechanicsTurn = {
            latestUserMessage,
            result,
            handoff,
            display,
            trackerSnapshot: trackerSnapshotForRollback(result.tracker),
        };
        lastMechanicsHandoff = {
            handoff,
            trackerSnapshot: preparedMechanicsTurn.trackerSnapshot,
            display,
        };
        bindMechanicsDisplayToTrigger(display);
        pendingAuditDisplayAfterGeneration = structuredClone(display);
        saveTracker();
        pendingPanelRefreshAfterGeneration = true;
        queueNpcArchiveSync(result);
        console.debug('[RP Engine Tracker] Prepared mechanics before final prompt assembly.', {
            goal: result.packet?.GOAL,
            stakes: result.packet?.STAKES,
            outcome: result.packet?.Outcome,
        });
    } catch (error) {
        preparedMechanicsTurn = null;
        preparedMechanicsFailure = error;
        recordMechanicsPreparationFailure(error, pendingClean);
        console.error('[RP Engine Tracker] Pre-generation mechanics preparation failed.', error);
    } finally {
        resolving = false;
        preparingMechanicsTurn = false;
    }
}

function recordMechanicsPreparationFailure(error, latestUserMessage) {
    const current = tracker();
    const details = error?.details || {};
    const schemaFailure = Boolean(error?.rpEngineSchemaFailure);
    const auditExtraction = schemaFailure ? {
        resolverMode: 'schema_failed',
        mechanicsPassMode: 'SCHEMA_FAILED',
        modelSchema: details.modelSchema && typeof details.modelSchema === 'object' ? structuredClone(details.modelSchema) : null,
        originalModelSchema: details.originalModelSchema && typeof details.originalModelSchema === 'object' ? structuredClone(details.originalModelSchema) : null,
        schemaRepaired: details.repairResponse ? 'Y' : 'N',
        schemaValidationIssues: Array.isArray(details.validationIssues) ? [...details.validationIssues] : [],
        schemaRawResponse: String(details.rawResponse || '').slice(0, 6000),
        schemaRepairResponse: String(details.repairResponse || '').slice(0, 6000),
        expandedExtraction: details.expandedExtraction && typeof details.expandedExtraction === 'object' ? structuredClone(details.expandedExtraction) : null,
        latestUserMessage,
    } : null;
    current.lastAudit = {
        at: new Date().toISOString(),
        error: error?.message || String(error),
        latestUserMessage,
        schemaFailure,
        extraction: auditExtraction,
    };
    chat_metadata[METADATA_KEY] = current;
    pendingAuditDisplayAfterGeneration = {
        version: 1,
        at: current.lastAudit.at,
        triggerUserMessage: latestUserMessage,
        triggerUserMessageId: findLatestUserMessageIdByText(latestUserMessage),
        resolverSchema: cloneAuditForDisplay(current.lastAudit),
        narrationHandoff: '',
        mechanicsArtifact: null,
    };
    clearMechanicsHandoff();
    saveTracker();
    pendingPanelRefreshAfterGeneration = true;
}

function rollbackLastTurnIfTriggerDeleted() {
    const current = tracker();
    const audit = current.lastAudit;
    const trigger = String(audit?.triggerUserMessage || '').trim();
    const snapshot = audit?.preTurnTrackerSnapshot;
    if (!trigger || !snapshot) return false;

    const sourceChat = [
        Array.isArray(getContext().chat) ? getContext().chat : [],
        Array.isArray(liveChat) ? liveChat : [],
    ].find(x => x.length) || [];
    const triggerStillExists = sourceChat.some(message => isUserMessage(message) && messageText(message).trim() === trigger);
    if (triggerStillExists) return false;

    const surviving = latestSurvivingMechanicsArtifact(sourceChat);
    if (surviving) {
        const restoredResult = hydrateResultFromMechanicsArtifact(surviving.payload, surviving.payload.triggerUserMessage || '');
        if (restoredResult?.tracker) {
            const restored = createTracker(restoredResult.tracker);
            restored.lastAuditDisplay = structuredClone(surviving.payload);
            chat_metadata[METADATA_KEY] = restored;
            lastMechanicsHandoff = {
                handoff: surviving.payload.narrationHandoff || '',
                trackerSnapshot: trackerSnapshotForRollback(restored),
                display: structuredClone(surviving.payload),
            };
            saveTracker();
            renderPanel();
            console.info('[RP Engine Tracker] Restored mechanics from latest surviving user-message artifact.');
            return true;
        }
    }

    const restored = createTracker(snapshot);
    restored.lastAudit = {
        at: new Date().toISOString(),
        rollback: true,
        reason: 'Deleted user message removed the mechanics it triggered.',
        deletedTrigger: trigger.slice(0, 300),
    };
    restored.lastAuditDisplay = {
        version: 1,
        at: restored.lastAudit.at,
        triggerUserMessage: '',
        triggerUserMessageId: null,
        resolverSchema: restored.lastAudit,
        narrationHandoff: '',
        mechanicsArtifact: null,
    };
    chat_metadata[METADATA_KEY] = restored;
    clearMechanicsHandoff();
    saveTracker();
    renderPanel();
    console.info('[RP Engine Tracker] Rolled back mechanics for deleted triggering user message.');
    return true;
}

function latestSurvivingMechanicsArtifact(sourceChat) {
    const chat = Array.isArray(sourceChat) ? sourceChat : [];
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!isUserMessage(message)) continue;
        const payload = message?.[MESSAGE_MECHANICS_KEY];
        if (payload?.mechanicsArtifact?.trackerSnapshot
            && payload?.mechanicsArtifact?.packet
            && Number(payload.mechanicsArtifact.version || 0) >= MECHANICS_ARTIFACT_VERSION) {
            return { index: i, payload };
        }
    }
    return null;
}

async function guardDeadArchiveReentry(extraction, latestUserMessage) {
    const cfg = settings();
    if (!cfg.enableNpcArchive || !extraction || typeof extraction !== 'object') return extraction;
    const archive = await loadNpcArchive({ createIfMissing: false });
    if (!archive) return extraction;

    const presentFacts = Array.isArray(extraction.npcFacts)
        ? extraction.npcFacts.filter(fact => fact?.name && fact.present !== false)
        : [];
    const candidates = uniqueLocal([
        ...(Array.isArray(extraction.npcInScene) ? extraction.npcInScene : []),
        ...presentFacts.map(fact => fact.name),
    ].filter(Boolean));
    if (!candidates.length) return extraction;

    for (const name of candidates) {
        const entry = findNpcArchiveEntry(archive.data, name);
        const archived = entry ? parseNpcArchiveContent(entry.content) : null;
        if (sanitizeArchiveStatusLocal(archived?.archiveStatus) !== 'Dead') continue;
        if (canRehydrateArchivedNpc(archived, latestUserMessage)) continue;
        return buildBlockedDeadReentryExtraction(archived.name || name, latestUserMessage);
    }

    return extraction;
}

function applyTimeTracking(current, previous, extraction = {}) {
    if (!current?.scene) return;
    const cfg = settings();
    const clock = normalizeLocalClock(current.worldClock);
    current.worldClock = clock;
    clock.enabled = !!cfg.enableTimeTracking;
    clock.scale = Number(cfg.timeScaleWorldMinutesPerRealMinute) || DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute;

    if (!clock.enabled || extraction?.oocMode === 'STOP') {
        clock.lastRealTimestamp = Date.now();
        clock.lastAdvance = clock.enabled ? 'No world-time advance this turn.' : 'World time tracking off.';
        clock.source = clock.enabled ? clock.source : 'disabled';
        return;
    }

    const now = Date.now();
    const explicitTime = String(extraction?.scene?.time || '').trim();
    const explicitDelta = Number(extraction?.timeDeltaMinutes || 0);
    const previousClock = normalizeLocalClock(previous?.worldClock);
    const currentParsed = parseSceneTimeToMinutes(current.scene.time);
    const previousParsed = parseSceneTimeToMinutes(previous?.scene?.time);
    const previousAbs = Number.isFinite(previousClock.absoluteMinutes) ? previousClock.absoluteMinutes : previousParsed;

    if (explicitTime) {
        if (Number.isFinite(currentParsed)) {
            clock.absoluteMinutes = preserveWorldDay(previousAbs, currentParsed);
            clock.lastAdvance = `Explicit time set: ${current.scene.time}`;
            clock.source = 'explicit-time';
        } else {
            clock.absoluteMinutes = Number.isFinite(previousAbs) ? previousAbs : null;
            clock.lastAdvance = `Explicit time noted: ${current.scene.time}`;
            clock.source = 'explicit-time-label';
        }
        clock.lastRealTimestamp = now;
        return;
    }

    if (Number.isFinite(explicitDelta) && explicitDelta !== 0) {
        const base = Number.isFinite(previousAbs) ? previousAbs : currentParsed;
        if (Number.isFinite(base)) {
            clock.absoluteMinutes = Math.max(0, Math.round(base + explicitDelta));
            current.scene.time = formatSceneMinutes(clock.absoluteMinutes);
            clock.lastAdvance = `Explicit skip ${formatSignedDuration(explicitDelta)}${extraction?.timeSkipReason ? `: ${extraction.timeSkipReason}` : ''}`;
            clock.source = 'explicit-skip';
        } else {
            clock.absoluteMinutes = null;
            clock.lastAdvance = `Explicit skip ${formatSignedDuration(explicitDelta)}${extraction?.timeSkipReason ? `: ${extraction.timeSkipReason}` : ''}`;
            clock.source = 'explicit-skip-unanchored';
        }
        clock.lastRealTimestamp = now;
        return;
    }

    if (!Number.isFinite(clock.absoluteMinutes) && Number.isFinite(currentParsed)) {
        clock.absoluteMinutes = preserveWorldDay(previousAbs, currentParsed);
        clock.lastAdvance = `Clock initialized at ${current.scene.time}.`;
        clock.source = 'parsed-scene-time';
        clock.lastRealTimestamp = now;
        return;
    }

    if (Number.isFinite(previousClock.lastRealTimestamp) && Number.isFinite(previousAbs)) {
        const elapsedRealMinutes = Math.max(0, (now - previousClock.lastRealTimestamp) / 60000);
        const cappedRealMinutes = Math.min(elapsedRealMinutes, Number(cfg.timeTrackingMaxRealMinutes) || DEFAULT_SETTINGS.timeTrackingMaxRealMinutes);
        const worldDelta = Math.floor(cappedRealMinutes * clock.scale);
        if (worldDelta > 0) {
            clock.absoluteMinutes = Math.max(0, Math.round(previousAbs + worldDelta));
            current.scene.time = formatSceneMinutes(clock.absoluteMinutes);
            clock.lastAdvance = `Auto ${formatSignedDuration(worldDelta)} from ${cappedRealMinutes.toFixed(1)} real min.`;
            clock.source = elapsedRealMinutes > cappedRealMinutes ? 'auto-capped' : 'auto';
        } else {
            clock.absoluteMinutes = previousAbs;
            clock.lastAdvance = 'No world-time advance this turn.';
            clock.source = 'auto';
        }
    } else if (!Number.isFinite(clock.absoluteMinutes) && Number.isFinite(previousAbs)) {
        clock.absoluteMinutes = previousAbs;
        clock.lastAdvance = 'Clock carried from prior scene time.';
        clock.source = 'carry';
    } else if (!current.scene.time) {
        clock.lastAdvance = 'Clock waiting for a parseable scene time or explicit time skip.';
        clock.source = 'unset';
    } else {
        clock.lastAdvance = 'No world-time advance this turn.';
        clock.source = 'no-change';
    }

    clock.lastRealTimestamp = now;
}

function normalizeLocalClock(clock) {
    const input = clock && typeof clock === 'object' ? clock : {};
    const absoluteMinutes = Number(input.absoluteMinutes);
    const lastRealTimestamp = Number(input.lastRealTimestamp);
    const scale = Number(input.scale);
    return {
        enabled: input.enabled !== false,
        absoluteMinutes: Number.isFinite(absoluteMinutes) ? Math.round(absoluteMinutes) : null,
        lastRealTimestamp: Number.isFinite(lastRealTimestamp) ? lastRealTimestamp : null,
        scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute,
        lastAdvance: String(input.lastAdvance || ''),
        source: String(input.source || 'unset'),
    };
}

function parseSceneTimeToMinutes(value) {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return null;
    const named = {
        midnight: 0,
        dawn: 6 * 60,
        sunrise: 6 * 60,
        morning: 8 * 60,
        noon: 12 * 60,
        midday: 12 * 60,
        afternoon: 15 * 60,
        dusk: 18 * 60,
        sunset: 18 * 60,
        evening: 19 * 60,
        night: 22 * 60,
    };
    for (const [word, minutes] of Object.entries(named)) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(source)) return minutes;
    }
    const matches = [...source.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/gi)]
        .filter(match => match[2] || match[3] || Number(match[1]) <= 24);
    const clockMatch = matches.at(-1);
    if (!clockMatch) return null;
    let hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2] || 0);
    if (!Number.isFinite(hour) || hour < 0 || hour > 24 || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    const suffix = (clockMatch[3] || '').replace(/\./g, '').toLowerCase();
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    if (!suffix && hour === 24) hour = 0;
    if (hour > 23) return null;
    return hour * 60 + minute;
}

function preserveWorldDay(previousAbs, dayMinute) {
    if (!Number.isFinite(dayMinute)) return null;
    if (!Number.isFinite(previousAbs)) return dayMinute;
    const day = Math.floor(previousAbs / 1440);
    const sameDay = day * 1440 + dayMinute;
    if (sameDay + 720 < previousAbs) return sameDay + 1440;
    if (sameDay - 720 > previousAbs) return Math.max(0, sameDay - 1440);
    return sameDay;
}

function formatSceneMinutes(totalMinutes) {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const day = Math.floor(total / 1440);
    const minuteOfDay = total % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return day > 0 ? `Day ${day + 1} ${label}` : label;
}

function formatSignedDuration(minutes) {
    const sign = Number(minutes) >= 0 ? '+' : '-';
    const abs = Math.abs(Math.round(Number(minutes) || 0));
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (mins || !parts.length) parts.push(`${mins}m`);
    return `${sign}${parts.join(' ')}`;
}

function buildBlockedDeadReentryExtraction(npcName, latestUserMessage) {
    const name = String(npcName || 'NPC').trim() || 'NPC';
    const evidence = String(latestUserMessage || '').trim().slice(0, 300);
    return {
        ooc: 'N',
        oocMode: 'IC',
        oocInstruction: '',
        goal: `${name} remains archived as Dead`,
        goalKind: 'Normal',
        goalEvidence: evidence,
        decisiveAction: `${name} remains archived as Dead`,
        decisiveActionEvidence: evidence,
        outcomeOnSuccess: '',
        outcomeOnFailure: '',
        actionTargets: [],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        npcInScene: [],
        hasStakes: 'N',
        stakesEvidence: 'Archived dead NPC was mentioned without explicit ghost, undead, or resurrection wording; re-entry blocked.',
        actionCount: 1,
        userStat: 'MND',
        userStatEvidence: '',
        oppStat: 'ENV',
        oppStatEvidence: '',
        hostilePhysicalHarm: 'N',
        newEncounter: 'N',
        timeDeltaMinutes: 0,
        timeSkipReason: '',
        systemOnlyUpdate: 'Y',
        systemOnlyUpdateReason: 'Dead archived NPC cannot be returned to the active scene unless the user explicitly frames it as ghost, undead, resurrection, or revival.',
        scene: { location: '', time: '', weather: '' },
        npcFacts: [],
        inventoryDeltas: [],
        taskDeltas: [],
    };
}

async function generateQuietPromptWithTimeout(params = {}, ms = DEFAULT_SETTINGS.resolverTimeoutMs) {
    const timeoutMs = Number(ms) || DEFAULT_SETTINGS.resolverTimeoutMs;
    const responseLength = Number(params.responseLength);
    const controller = new AbortController();
    activeQuietControllers.add(controller);
    const timer = setTimeout(() => {
        controller.abort(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    quietGenerationDepth += 1;
    const restoreResponseLength = applyTemporaryResponseLength(responseLength);
    try {
        const result = await Generate('quiet', {
            quiet_prompt: params.quietPrompt ?? '',
            quietToLoud: params.quietToLoud ?? false,
            skipWIAN: params.skipWIAN ?? false,
            force_name2: true,
            quietImage: params.quietImage ?? null,
            quietName: params.quietName ?? null,
            force_chid: params.forceChId ?? null,
            jsonSchema: params.jsonSchema ?? null,
            signal: controller.signal,
        });
        return params.removeReasoning === false ? String(result || '') : stripReasoningBlocks(result);
    } finally {
        restoreResponseLength();
        quietGenerationDepth = Math.max(0, quietGenerationDepth - 1);
        clearTimeout(timer);
        activeQuietControllers.delete(controller);
    }
}

function applyTemporaryResponseLength(responseLength) {
    if (!Number.isFinite(responseLength) || responseLength <= 0) return () => {};
    const original = main_api === 'openai'
        ? { openai_max_tokens: Number(oai_settings.openai_max_tokens) }
        : { genamt: Number(amount_gen) };
    try {
        if (main_api === 'openai') {
            oai_settings.openai_max_tokens = responseLength;
        } else {
            setGenerationParamsFromPreset({ genamt: responseLength });
        }
    } catch (error) {
        console.warn('[RP Engine Tracker] Failed to apply temporary resolver response cap.', error);
        return () => {};
    }
    return () => {
        try {
            if (main_api === 'openai') {
                oai_settings.openai_max_tokens = original.openai_max_tokens;
            } else {
                setGenerationParamsFromPreset({ genamt: original.genamt });
            }
        } catch (error) {
            console.warn('[RP Engine Tracker] Failed to restore response length after resolver call.', error);
        }
    };
}

function stripReasoningBlocks(value) {
    return String(value || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .trim();
}

async function ensureNpcArchiveWorld({ createIfMissing = true } = {}) {
    const cfg = settings();
    if (!cfg.enableNpcArchive) return null;

    await updateWorldInfoList();
    const names = Array.isArray(world_names) ? world_names : [];
    if (cfg.npcArchiveWorld && names.includes(cfg.npcArchiveWorld)) {
        return cfg.npcArchiveWorld;
    }
    if (names.includes(DEFAULT_ARCHIVE_WORLD)) {
        cfg.npcArchiveWorld = DEFAULT_ARCHIVE_WORLD;
        saveSettingsDebounced();
        syncExtensionSettingsBlock();
        return cfg.npcArchiveWorld;
    }
    if (!createIfMissing || !cfg.autoCreateNpcArchive) {
        return null;
    }

    const created = await createNewWorldInfo(DEFAULT_ARCHIVE_WORLD, { interactive: false });
    await updateWorldInfoList();
    const afterCreate = Array.isArray(world_names) ? world_names : [];
    if (created && afterCreate.includes(DEFAULT_ARCHIVE_WORLD)) {
        cfg.npcArchiveWorld = DEFAULT_ARCHIVE_WORLD;
        saveSettingsDebounced();
        syncExtensionSettingsBlock();
        return cfg.npcArchiveWorld;
    }
    return null;
}

async function loadNpcArchive({ createIfMissing = true } = {}) {
    const worldName = await ensureNpcArchiveWorld({ createIfMissing });
    if (!worldName) return null;
    const data = await loadWorldInfo(worldName);
    if (!data || typeof data !== 'object') return null;
    data.entries = data.entries && typeof data.entries === 'object' ? data.entries : {};
    return { worldName, data };
}

function findNpcArchiveEntry(data, npcName) {
    const wanted = normalizeNameLocal(npcName);
    const wantedKey = normalizeNameLocal(archiveEntryKey(npcName));
    for (const entry of Object.values(data.entries || {})) {
        const parsed = parseNpcArchiveContent(entry.content);
        if (parsed && !archiveEntryMatchesCurrentChat(parsed)) continue;
        const keys = Array.isArray(entry.key) ? entry.key : [];
        const names = [
            parsed?.name,
            ...(parsed?.aliases || []),
            ...keys,
            String(entry.comment || '').replace(ARCHIVE_COMMENT_PREFIX, '').trim(),
        ].filter(Boolean);
        if (names.some(name => normalizeNameLocal(name) === wanted || normalizeNameLocal(name) === wantedKey)) return entry;
    }
    return null;
}

async function syncNpcArchive(result) {
    const cfg = settings();
    if (!cfg.enableNpcArchive || !result?.tracker?.npcs) return;
    const archive = await loadNpcArchive({ createIfMissing: true });
    if (!archive) return;

    const { worldName, data } = archive;
    const presentIds = new Set(result.tracker.presentNpcIds || []);
    let archiveChanged = false;
    for (const npc of Object.values(result.tracker.npcs || {})) {
        if (!npc?.name) continue;
        let entry = findNpcArchiveEntry(data, npc.name);
        if (!entry) {
            entry = createWorldInfoEntry(worldName, data);
            archiveChanged = true;
        }
        if (!entry) continue;
        const previous = parseNpcArchiveContent(entry.content) || {};
        const chatId = currentArchiveChatId();
        const archiveOwner = currentArchiveOwnerKey();
        const entryKey = archiveEntryKey(npc.name, chatId);
        const mergedNpc = {
            ...previous,
            ...npc,
            chatId,
            archiveOwner,
            archiveEntryKey: entryKey,
            aliases: uniqueLocal([npc.name, ...(previous.aliases || []), ...(npc.aliases || [])]),
            descriptor: npc.descriptor || previous.descriptor || '',
            revealedFrom: npc.revealedFrom || previous.revealedFrom || '',
            present: presentIds.has(npc.id),
            archiveStatus: archiveStatusForNpc(npc, previous, cfg),
            lastKnownLocation: result.tracker.scene?.location || previous.lastKnownLocation || npc.lastKnownLocation || '',
            knowsUser: preferKnownValue(npc.knowsUser, previous.knowsUser),
            personality: preferKnownValue(npc.personality, previous.personality),
            continuity: preferKnownValue(npc.continuity, previous.continuity),
            pending: preferKnownValue(npc.pending, previous.pending, 'none'),
            misc: preferKnownValue(npc.misc, previous.misc, 'none'),
        };
        const nextEntry = {
            comment: `${ARCHIVE_COMMENT_PREFIX} ${archiveOwner} / ${chatId} / ${npc.name}`,
            key: settings().scopeNpcArchivePerChat
            ? uniqueLocal([entryKey, ...(mergedNpc.aliases || []).map(alias => archiveEntryKey(alias, chatId))])
            : uniqueLocal([npc.name, ...(mergedNpc.aliases || [])]),
            keysecondary: [],
            content: serializeNpcArchiveEntry(mergedNpc, {
                chatId,
                archiveOwner,
                archiveEntryKey: entryKey,
                location: result.tracker.scene?.location,
                audit: result.audit,
            }),
            disable: false,
            constant: false,
            selective: true,
            order: Number.isFinite(Number(entry.order)) ? entry.order : 100,
        };
        for (const [key, value] of Object.entries(nextEntry)) {
            if (worldInfoEntryValueEqual(entry[key], value)) continue;
            entry[key] = value;
            archiveChanged = true;
        }
    }
    if (archiveChanged) {
        await saveWorldInfo(worldName, data, true);
    }

    if (cfg.pruneArchivedAbsentNpcs) {
        const pruned = createTracker(result.tracker);
        for (const [id] of Object.entries(pruned.npcs || {})) {
            if (!presentIds.has(id)) {
                delete pruned.npcs[id];
            }
        }
        pruned.presentNpcIds = pruned.presentNpcIds.filter(id => pruned.npcs[id]);
        result.tracker = pruned;
    }
}

function queueNpcArchiveSync(result) {
    if (!settings().enableNpcArchive || !result?.tracker?.npcs) return;
    const queued = {
        ...result,
        tracker: createTracker(result.tracker),
        audit: result.audit ? structuredClone(result.audit) : null,
    };
    setTimeout(async () => {
        try {
            await syncNpcArchive(queued);
            if (settings().pruneArchivedAbsentNpcs) {
                const currentTrigger = String(chat_metadata[METADATA_KEY]?.lastAudit?.triggerUserMessage || '').trim();
                const queuedTrigger = String(queued.tracker?.lastAudit?.triggerUserMessage || '').trim();
                if (currentTrigger && queuedTrigger && currentTrigger !== queuedTrigger) return;
                const current = createTracker(chat_metadata[METADATA_KEY]);
                const presentIds = new Set(current.presentNpcIds || []);
                for (const [id] of Object.entries(current.npcs || {})) {
                    if (!presentIds.has(id)) delete current.npcs[id];
                }
                current.presentNpcIds = current.presentNpcIds.filter(id => current.npcs[id]);
                chat_metadata[METADATA_KEY] = current;
                saveTracker();
                pendingPanelRefreshAfterGeneration = true;
            }
        } catch (error) {
            console.warn('[RP Engine Tracker] Deferred NPC archive sync failed.', error);
        }
    }, 0);
}

function worldInfoEntryValueEqual(current, next) {
    if (Array.isArray(next) || Array.isArray(current)) {
        return JSON.stringify(Array.isArray(current) ? current : []) === JSON.stringify(Array.isArray(next) ? next : []);
    }
    if (typeof next === 'boolean') return Boolean(current) === next;
    if (typeof next === 'number') return Number(current) === next;
    return String(current ?? '') === String(next ?? '');
}

async function pruneForgottenNpcs() {
    const archive = await loadNpcArchive({ createIfMissing: false });
    if (!archive) {
        toastr.warning('No NPC archive Lorebook is available.', 'RP Engine');
        return 0;
    }
    let count = 0;
    for (const [uid, entry] of Object.entries(archive.data.entries || {})) {
        const parsed = parseNpcArchiveContent(entry.content);
        if (parsed && !archiveEntryMatchesCurrentChat(parsed)) continue;
        if (parsed?.archiveStatus === 'Forgotten') {
            delete archive.data.entries[uid];
            count += 1;
        }
    }
    if (count) {
        await saveWorldInfo(archive.worldName, archive.data, true);
    }
    toastr[count ? 'success' : 'info'](
        count ? `Pruned ${count} forgotten NPC archive entr${count === 1 ? 'y' : 'ies'}.` : 'No forgotten NPC entries to prune.',
        'RP Engine',
    );
    return count;
}

function deletedArchiveChatIdFromEvent(payload) {
    if (typeof payload === 'string' || typeof payload === 'number') return sanitizeArchiveChatId(payload);
    if (!payload || typeof payload !== 'object') return '';
    const source = payload.detail && typeof payload.detail === 'object' ? payload.detail : payload;
    return sanitizeArchiveChatId(
        source.chatId
        || source.id
        || source.name
        || source.fileName
        || source.file_name
        || source.chatfile
        || source.chat,
    );
}

function archiveEntryBelongsToDeletedChat(entry, deletedChatId, ownerKey = currentArchiveOwnerKey()) {
    const wantedChat = sanitizeArchiveChatId(deletedChatId);
    if (!wantedChat || wantedChat === 'unsaved-chat') return false;
    const wantedOwner = String(ownerKey || '').trim();
    const parsed = parseNpcArchiveContent(entry?.content);
    if (parsed?.chatId) {
        const chatMatches = sanitizeArchiveChatId(parsed.chatId) === wantedChat;
        if (!chatMatches) return false;
        const storedOwner = String(parsed.archiveOwner || '').trim();
        return !storedOwner || storedOwner === 'unknown' || !wantedOwner || storedOwner === wantedOwner;
    }
    const keys = Array.isArray(entry?.key) ? entry.key : [];
    if (keys.some(key => {
        const text = String(key || '');
        return text.startsWith(`RPE:${wantedChat}:`) || (text.startsWith('RPE:') && text.includes(`:${wantedChat}:`));
    })) return true;
    const comment = String(entry?.comment || '');
    return comment.includes(`${ARCHIVE_COMMENT_PREFIX} ${wantedChat} /`)
        || comment.includes(`${ARCHIVE_COMMENT_PREFIX} ${wantedOwner} / ${wantedChat} /`);
}

async function deleteNpcArchiveEntriesForChat(payload) {
    const cfg = settings();
    if (!cfg.enableNpcArchive || !cfg.scopeNpcArchivePerChat) return 0;
    const deletedChatId = deletedArchiveChatIdFromEvent(payload);
    if (!deletedChatId || deletedChatId === 'unsaved-chat') return 0;
    const archive = await loadNpcArchive({ createIfMissing: false });
    if (!archive) return 0;

    const ownerKey = currentArchiveOwnerKey();
    let count = 0;
    for (const [uid, entry] of Object.entries(archive.data.entries || {})) {
        if (!archiveEntryBelongsToDeletedChat(entry, deletedChatId, ownerKey)) continue;
        delete archive.data.entries[uid];
        count += 1;
    }
    if (count) {
        await saveWorldInfo(archive.worldName, archive.data, true);
        console.info(`[RP Engine] Removed ${count} NPC archive entr${count === 1 ? 'y' : 'ies'} for deleted chat "${deletedChatId}".`);
    }
    return count;
}

async function rehydrateArchivedNpcsForText(text) {
    const cfg = settings();
    if (!cfg.enableNpcArchive || !cfg.rehydrateArchivedNpcs || !String(text || '').trim()) return;
    const archive = await loadNpcArchive({ createIfMissing: false });
    if (!archive) return;

    let current = tracker();
    let changed = false;
    for (const entry of Object.values(archive.data.entries || {})) {
        const archived = parseNpcArchiveContent(entry.content);
        if (!archived?.name) continue;
        if (!archiveEntryMatchesCurrentChat(archived)) continue;
        if (!canRehydrateArchivedNpc(archived, text)) continue;
        const names = uniqueLocal([archived.name, ...(archived.aliases || []), ...(Array.isArray(entry.key) ? entry.key : [])]);
        if (!names.some(name => mentionedByText(text, name))) continue;
        const before = JSON.stringify(current.npcs || {});
        current = upsertArchivedNpc(current, archived, true);
        changed = changed || JSON.stringify(current.npcs || {}) !== before;
    }
    if (changed) {
        chat_metadata[METADATA_KEY] = current;
        saveTracker();
    }
}

function archiveStatusForNpc(npc, previous, cfg) {
    const explicit = ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten'].includes(npc?.archiveStatus) ? npc.archiveStatus : '';
    const prior = sanitizeArchiveStatusLocal(previous.archiveStatus);
    const condition = String(npc?.condition || previous?.condition || '').toLowerCase();
    if (explicit && explicit !== 'Active') return explicit;
    if (prior === 'Forgotten') return 'Forgotten';
    if (cfg.autoRetireDeadNpcs && /\b(dead|deceased|slain|killed|destroyed)\b/.test(condition)) return 'Dead';
    if (prior === 'Dead' && !/\b(alive|revived|resurrected|returned from the dead|ghost|undead|spirit)\b/.test(condition)) return 'Dead';
    return explicit || prior || 'Active';
}

function canRehydrateArchivedNpc(archived, text) {
    const status = sanitizeArchiveStatusLocal(archived?.archiveStatus);
    const source = String(text || '');
    if (status === 'Forgotten') return false;
    if (status === 'Dead') {
        return /\b(ghost|spirit|undead|reanimated|resurrected|revived|returns? from the dead|risen)\b/i.test(source);
    }
    if (status === 'Retired' || status === 'Inactive') {
        return /\b(returns?|comes? back|arrives?|reappears?|reintroduced|back in|back into)\b/i.test(source);
    }
    return true;
}

function sanitizeArchiveStatusLocal(value) {
    return ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten'].includes(value) ? value : 'Active';
}

function mentionedByText(text, name) {
    const value = String(name || '').trim();
    if (!value) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExpLocal(value)}($|[^\\p{L}\\p{N}_])`, 'iu').test(String(text || ''));
}

function latestUserMessageFromAvailableChats(chat) {
    return getLatestUserMessage(getContext().chat || [])
        || getLatestUserMessage(liveChat)
        || getLatestUserMessage(chat);
}

function isSameTurnRegeneration(type, chat) {
    const normalizedType = String(type || '').toLowerCase();
    if (!['regenerate', 'swipe'].includes(normalizedType)) return false;
    if (!lastMechanicsHandoff.handoff || !lastMechanicsHandoff.trackerSnapshot) return false;
    const artifactVersion = Number(lastMechanicsHandoff.display?.mechanicsArtifact?.version || 0);
    if (artifactVersion < MECHANICS_ARTIFACT_VERSION) return false;
    const latestUserMessage = latestUserMessageFromAvailableChats(chat);
    const triggerUserMessage = lastMechanicsHandoff.trackerSnapshot?.lastAudit?.triggerUserMessage
        || tracker()?.lastAudit?.triggerUserMessage
        || '';
    return !!latestUserMessage && !!triggerUserMessage && latestUserMessage === triggerUserMessage;
}

function preserveSameTurnHandoffForRegeneration() {
    const artifactResult = hydrateResultFromMechanicsArtifact(lastMechanicsHandoff.display);
    const handoff = artifactResult
        ? buildFinalNarrationPayload({
            packet: artifactResult.packet,
            npcHandoffs: artifactResult.npcHandoffs,
            chaosHandoff: artifactResult.chaosHandoff,
            proactivityHandoff: artifactResult.proactivityHandoff,
            aggressionResults: artifactResult.aggressionResults,
        })
        : lastMechanicsHandoff.handoff;
    setMechanicsHandoff(handoff);
    chat_metadata[METADATA_KEY] = artifactResult?.tracker || structuredClone(lastMechanicsHandoff.trackerSnapshot);
    const display = lastMechanicsHandoff.display ? structuredClone(lastMechanicsHandoff.display) : null;
    if (display) {
        display.narrationHandoff = handoff;
        display.triggerUserMessageId = findLatestUserMessageIdByText(display.triggerUserMessage);
        bindMechanicsDisplayToTrigger(display);
        pendingAuditDisplayAfterGeneration = structuredClone(display);
        saveTracker();
        pendingPanelRefreshAfterGeneration = true;
    } else {
        saveTracker();
        pendingPanelRefreshAfterGeneration = true;
    }
}

function buildMechanicsDisplayPayload(result, handoff, latestUserMessage, sourceChat = null) {
    const audit = cloneAuditForDisplay(result?.audit || result?.tracker?.lastAudit || null);
    return {
        version: 1,
        at: new Date().toISOString(),
        triggerUserMessage: String(latestUserMessage || '').trim(),
        triggerUserMessageId: findLatestUserMessageIdByText(latestUserMessage, sourceChat),
        resolverSchema: audit,
        narrationHandoff: String(handoff || ''),
        mechanicsArtifact: buildMechanicsArtifact(result),
    };
}

function latestAuditDisplayPayload() {
    const current = tracker();
    if (isCurrentMechanicsDisplayPayload(current?.lastAuditDisplay)) {
        return current.lastAuditDisplay;
    }
    if (pendingAuditDisplayAfterGeneration || pendingPanelRefreshAfterGeneration) {
        return null;
    }
    const audit = current?.lastAudit ? cloneAuditForDisplay(current.lastAudit) : null;
    if (!audit) return null;
    return {
        version: 1,
        at: audit.at || new Date().toISOString(),
        triggerUserMessage: audit.triggerUserMessage || '',
        triggerUserMessageId: null,
        resolverSchema: audit,
        narrationHandoff: '',
        mechanicsArtifact: null,
    };
}

function isCurrentMechanicsDisplayPayload(payload) {
    if (!payload?.resolverSchema) return false;
    if (!payload.mechanicsArtifact) return true;
    return Number(payload.mechanicsArtifact.version || 0) >= MECHANICS_ARTIFACT_VERSION;
}

function buildMechanicsArtifact(result) {
    if (!result?.tracker || !result?.packet) return null;
    return {
        version: MECHANICS_ARTIFACT_VERSION,
        extensionVersion: EXT_VERSION,
        trackerSnapshot: trackerSnapshotForRollback(result.tracker),
        packet: structuredClone(result.packet),
        npcHandoffs: structuredClone(result.npcHandoffs || []),
        chaosHandoff: structuredClone(result.chaosHandoff || null),
        proactivityHandoff: structuredClone(result.proactivityHandoff || {}),
        aggressionResults: structuredClone(result.aggressionResults || {}),
        audit: cloneAuditForDisplay(result.audit || result.tracker?.lastAudit || null),
    };
}

function cloneAuditForDisplay(audit) {
    if (!audit) return null;
    const cloned = structuredClone(audit);
    delete cloned.preTurnTrackerSnapshot;
    return cloned;
}

function bindMechanicsDisplayToTrigger(payload) {
    if (!payload) return false;
    const id = Number(payload.triggerUserMessageId);
    if (!Number.isFinite(id)) {
        return false;
    }
    const message = getMessageById(id);
    if (!isUserMessage(message)) {
        return false;
    }

    message[MESSAGE_MECHANICS_KEY] = structuredClone(payload);
    saveChatDebounced();
    return true;
}

function revealPendingAuditDisplay() {
    const payload = pendingAuditDisplayAfterGeneration || lastMechanicsHandoff?.display || null;
    if (!payload) return false;
    const current = tracker();
    current.lastAuditDisplay = structuredClone(payload);
    chat_metadata[METADATA_KEY] = current;
    pendingAuditDisplayAfterGeneration = null;
    saveTracker();
    return true;
}

function updateVisibleTrackerSnapshot() {
    visibleTrackerSnapshot = structuredClone(tracker());
}

function findLatestUserMessageIdByText(text, preferredChat = null) {
    const needle = String(text || '').trim();
    const chats = [
        preferredChat,
        getContext().chat,
        liveChat,
    ].filter(chat => Array.isArray(chat) && chat.length);
    const seen = new Set();
    for (const sourceChat of chats) {
        if (seen.has(sourceChat)) continue;
        seen.add(sourceChat);
        for (let i = sourceChat.length - 1; i >= 0; i--) {
            if (!isUserMessage(sourceChat[i])) continue;
            const candidate = messageText(sourceChat[i]).trim();
            if (!needle || candidate === needle) return i;
        }
    }
    return null;
}

function renderMechanicsBlocks() {
    $('#chat .rp-engine-message-mechanics').remove();
}

function renderAuditDisplay(payload) {
    const audit = payload?.resolverSchema || null;
    const handoff = String(payload?.narrationHandoff || '').trim();
    const summaryBits = mechanicsSummaryBits(audit, payload);
    const title = summaryBits.length ? `Audit | ${summaryBits.join(' | ')}` : 'Audit';
    return `
        <details class="rp-engine-audit-details">
            <summary>${escapeHtml(title)}</summary>
            <div class="rp-engine-audit-body">
                <details open>
                    <summary>Model Schema</summary>
                    ${audit ? renderModelSchemaSummary(audit) : '<div class="rp-engine-muted">No model schema stored.</div>'}
                </details>
                <details>
                    <summary>Mechanics Summary</summary>
                    ${audit ? renderMechanicsSummary(audit, payload) : '<div class="rp-engine-muted">No mechanics summary stored.</div>'}
                </details>
                <details>
                    <summary>Narration Handoff</summary>
                    ${handoff ? `<pre>${escapeHtml(handoff)}</pre>` : '<div class="rp-engine-muted">No narration handoff stored for this turn.</div>'}
                </details>
            </div>
        </details>
    `;
}

function renderModelSchemaSummary(audit) {
    const extraction = audit?.extraction || {};
    const schema = extraction.modelSchema || null;
    const rawResponse = String(extraction.schemaRawResponse || '').trim();
    const repairResponse = String(extraction.schemaRepairResponse || '').trim();
    const issues = Array.isArray(extraction.schemaValidationIssues) ? extraction.schemaValidationIssues : [];
    if (!schema) {
        return `
            <div class="rp-engine-audit-card ${audit?.schemaFailure || audit?.error ? 'rp-engine-audit-error' : ''}">
                <div class="rp-engine-audit-title">${audit?.schemaFailure ? 'Mandatory Schema Failed' : 'Model Schema'}</div>
                ${audit?.error ? renderKv('Error', audit.error) : ''}
                ${issues.length ? renderKv('Validation Issues', issues.join(' | ')) : renderKv('Validation Issues', '(none recorded)')}
                ${renderKv('Latest User Message', audit?.latestUserMessage || extraction.latestUserMessage)}
                ${rawResponse ? `<details><summary>Raw Model Response</summary><pre>${escapeHtml(rawResponse)}</pre></details>` : '<div class="rp-engine-muted">No raw model response stored.</div>'}
                ${repairResponse ? `<details><summary>Repair Response</summary><pre>${escapeHtml(repairResponse)}</pre></details>` : ''}
                ${extraction.expandedExtraction ? `<details><summary>Expanded Partial Schema</summary><pre>${escapeHtml(formatJsonForDisplay(extraction.expandedExtraction))}</pre></details>` : ''}
            </div>
        `;
    }
    const targets = schema.identifyTargets || {};
    const mapStats = schema.mapStats || {};
    const checkGate = schema.checkIntimacyGate || {};
    const repaired = extraction.schemaRepaired === 'Y';
    return `
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Model Schema</div>
            ${renderKv('Mode', schema.mode)}
            ${renderKv('Repaired', repaired ? 'Y' : 'N')}
            ${issues.length ? renderKv('Validation Issues', issues.join(' | ')) : ''}
            ${renderKv('identifyGoal.goal', schema.identifyGoal?.goal)}
            ${renderKv('identifyGoal.goalKind', schema.identifyGoal?.goalKind)}
            ${renderKv('identifyTargets.ActionTargets', listText(targets.ActionTargets))}
            ${renderKv('identifyTargets.OppTargets.NPC', listText(targets.OppTargets?.NPC))}
            ${renderKv('identifyTargets.OppTargets.ENV', listText(targets.OppTargets?.ENV))}
            ${renderKv('identifyTargets.BenefitedObservers', listText(targets.BenefitedObservers))}
            ${renderKv('identifyTargets.HarmedObservers', listText(targets.HarmedObservers))}
            ${renderKv('identifyTargets.NPCInScene', listText(targets.NPCInScene))}
            ${renderKv('checkIntimacyGate.IntimacyConsent', checkGate.IntimacyConsent)}
            ${renderKv('hasStakes.STAKES', schema.hasStakes?.STAKES)}
            ${renderKv('mapStats.USER', mapStats.USER)}
            ${renderKv('mapStats.OPP', mapStats.OPP)}
            ${renderKv('decisiveAction', schema.decisiveAction)}
            ${renderKv('actionCount', schema.actionCount)}
            ${renderKv('hostilePhysicalHarm', schema.hostilePhysicalHarm)}
            ${renderKv('newEncounterExplicit', schema.newEncounterExplicit)}
            ${renderSchemaArray('initPreset', schema.initPreset)}
            ${renderSchemaArray('NPC_STAKES', schema.NPC_STAKES)}
            ${renderSchemaArray('checkThreshold', schema.checkThreshold)}
        </div>
        ${extraction.originalModelSchema ? `<details><summary>Original Before Repair</summary><pre>${escapeHtml(formatJsonForDisplay(extraction.originalModelSchema))}</pre></details>` : ''}
        <details><summary>Raw JSON</summary><pre>${escapeHtml(formatJsonForDisplay(schema))}</pre></details>
        ${rawResponse ? `<details><summary>Raw Model Response</summary><pre>${escapeHtml(rawResponse)}</pre></details>` : ''}
        ${repairResponse ? `<details><summary>Repair Response</summary><pre>${escapeHtml(repairResponse)}</pre></details>` : ''}
    `;
}

function renderSchemaArray(label, value) {
    if (!Array.isArray(value) || !value.length) return renderKv(label, '(none)');
    const text = value.map(item => {
        if (!item || typeof item !== 'object') return String(item || '');
        return Object.entries(item)
            .map(([key, val]) => `${key}=${Array.isArray(val) ? val.join(',') : val}`)
            .join('; ');
    }).join(' | ');
    return renderKv(label, text);
}

function renderMechanicsSummary(audit, payload = null) {
    if (audit.rollback || audit.error) return renderAudit(audit);
    const extraction = audit.extraction || {};
    const packet = audit.resolutionPacket || {};
    const chaos = audit.chaosHandoff?.CHAOS || {};
    const proactivity = audit.proactivityHandoff || {};
    const aggression = audit.aggressionResults || {};
    const npcs = Array.isArray(audit.npcHandoffs) ? audit.npcHandoffs : [];
    const roll = packet.roll || {};
    const rollLine = Number.isFinite(roll.atkDie)
        ? `${roll.atkDie}+${packet.stats?.USER || '?'}=${roll.atkTot} vs ${roll.defDie}${packet.stats?.OPP === 'ENV' ? '' : `+${packet.stats?.OPP || '?'}`}=${roll.defTot}; margin ${roll.margin}`
        : 'none';
    const proactive = Object.entries(proactivity)
        .filter(([, item]) => item?.Proactive === 'Y')
        .map(([name, item]) => `${name}: ${item.Intent}${item.TargetsUser === 'Y' ? ' -> user' : ''}`);
    const aggressionLines = Object.entries(aggression)
        .map(([name, item]) => `${name}: ${item.ReactionOutcome} (${item.Margin})`);
    const displayIntent = mechanicsDisplayIntent(audit, payload);
    const displayAction = mechanicsDisplayAction(audit, payload, displayIntent);

    return `
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Mechanics Summary</div>
            ${renderKv('Resolver', resolverModeLabel(extraction))}
            ${renderKv('Goal', displayIntent)}
            ${renderKv('Action', displayAction)}
            ${renderKv('Stakes', packet.STAKES || extraction.hasStakes)}
            ${renderKv('Target', listText(packet.ActionTargets || extraction.actionTargets))}
            ${renderKv('Opposition', listText([...(packet.OppTargets?.NPC || extraction.oppTargetsNpc || []), ...(packet.OppTargets?.ENV || extraction.oppTargetsEnv || [])]))}
            ${renderKv('Benefited', listText(packet.BenefitedObservers || extraction.benefitedObservers))}
            ${renderKv('Harmed', listText(packet.HarmedObservers || extraction.harmedObservers))}
            ${renderKv('Roll', rollLine)}
            ${renderKv('Outcome', `${packet.OutcomeTier || 'NONE'} / ${packet.Outcome || 'no_roll'}`)}
            ${renderKv('IntimacyConsent', packet.IntimacyConsent || 'N')}
            ${renderKv('IntimacyGate', firstNpcGate(npcs) || 'SKIP')}
            ${renderKv('Landed', packet.LandedActions)}
            ${renderKv('Counter', packet.CounterPotential)}
            ${npcs.length ? `<div class="rp-engine-audit-title">Relationships</div>${npcs.map(renderNpcAudit).join('')}` : ''}
            <div class="rp-engine-audit-title">Events</div>
            ${renderKv('Chaos', chaos.triggered ? `${chaos.band || 'event'} / ${chaos.magnitude || 'minor'} / ${chaos.anchor || 'scene'} / ${chaos.vector || 'scene'}` : 'none')}
            ${renderKv('Proactivity', proactive.length ? proactive.join(' | ') : 'none')}
            ${renderKv('Aggression', aggressionLines.length ? aggressionLines.join(' | ') : 'none')}
        </div>
    `;
}

function firstNpcGate(npcs) {
    const item = (Array.isArray(npcs) ? npcs : []).find(npc => npc?.IntimacyGate);
    return item?.IntimacyGate || '';
}

function resolverModeLabel(extraction) {
    if (extraction?.resolverMode === 'mechanics_pass') return `mechanics pass ${extraction.mechanicsPassMode || ''}`.trim();
    return extraction?.resolverMode || 'full';
}

function mechanicsSummaryBits(audit, payload) {
    if (audit?.schemaFailure || audit?.extraction?.resolverMode === 'schema_failed') {
        return ['schema failed', payload?.at ? new Date(payload.at).toLocaleTimeString() : ''].filter(Boolean);
    }
    if (audit?.error) {
        return ['error', payload?.at ? new Date(payload.at).toLocaleTimeString() : ''].filter(Boolean);
    }
    const packet = audit?.resolutionPacket || {};
    const chaos = audit?.chaosHandoff?.CHAOS || {};
    const status = packet.STAKES === 'Y'
        ? (packet.Outcome || packet.OutcomeTier || 'resolved')
        : 'no roll';
    const target = firstDisplayTarget(packet, audit?.extraction);
    return [
        status,
        target ? `target ${target}` : '',
        chaos.triggered ? `chaos ${chaos.band || 'event'}` : '',
        payload?.at ? new Date(payload.at).toLocaleTimeString() : '',
    ].filter(Boolean).slice(0, 4);
}

function mechanicsDisplayIntent(audit, payload = null) {
    const extraction = audit?.extraction || {};
    const packet = audit?.resolutionPacket || {};
    const raw = packet.GOAL || extraction.goal || '';
    if (!isRawUserMessageLike(raw, payload?.triggerUserMessage)) return compactDisplayText(raw, derivedMechanicsIntent(packet, extraction));
    return derivedMechanicsIntent(packet, extraction);
}

function mechanicsDisplayAction(audit, payload = null, displayIntent = '') {
    const extraction = audit?.extraction || {};
    const packet = audit?.resolutionPacket || {};
    const raw = packet.DecisiveAction || extraction.decisiveAction || '';
    if (!raw) return '';
    if (isRawUserMessageLike(raw, payload?.triggerUserMessage)) return displayIntent || derivedMechanicsIntent(packet, extraction);
    return compactDisplayText(raw, displayIntent || derivedMechanicsIntent(packet, extraction));
}

function derivedMechanicsIntent(packet = {}, extraction = {}) {
    if (packet.OOCMode === 'STOP' || extraction.oocMode === 'STOP') return 'OOC request';
    if (packet.SystemOnlyUpdate === 'Y' || extraction.systemOnlyUpdate === 'Y') return 'tracker update';

    const goalKind = packet.GOAL && ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)
        ? packet.GOAL
        : extraction.goalKind;
    if (goalKind === 'IntimacyAdvancePhysical') return 'physical intimacy advance';
    if (goalKind === 'IntimacyAdvanceVerbal') return 'verbal intimacy advance';
    if (packet.HostilePhysicalHarm === 'Y' || extraction.hostilePhysicalHarm === 'Y') return 'hostile physical action';

    const target = firstDisplayTarget(packet, extraction);
    if (packet.STAKES === 'Y' || extraction.hasStakes === 'Y') {
        return target ? `contested action against ${target}` : 'contested action';
    }
    return target ? `no-roll interaction with ${target}` : 'no-roll interaction';
}

function firstDisplayTarget(packet = {}, extraction = {}) {
    return [
        ...(packet.ActionTargets || extraction.actionTargets || []),
        ...(packet.OppTargets?.NPC || extraction.oppTargetsNpc || []),
        ...(packet.OppTargets?.ENV || extraction.oppTargetsEnv || []),
    ].map(x => String(x || '').trim()).find(Boolean) || '';
}

function compactDisplayText(value, fallback = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.length > 90 ? `${text.slice(0, 87).trim()}...` : text;
}

function isRawUserMessageLike(value, triggerUserMessage = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const trigger = String(triggerUserMessage || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    if (trigger && text === trigger) return true;
    if (trigger && text.length > 60 && trigger.includes(text)) return true;
    if (text.length > 120) return true;
    if (text.split(/\s+/).length > 18 && /["“”]|\bI\b|\bmy\b|\bme\b/i.test(text)) return true;
    return false;
}

function formatJsonForDisplay(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value ?? '');
    }
}

function renderPanel() {
    const cfg = settings();
    const root = $('#rp_engine_tracker_panel');
    if (!root.length) return;

    root.toggleClass('rp-engine-hidden', !cfg.showPanel);
    root.toggleClass('rp-engine-collapsed', !!cfg.panelCollapsed);
    root.find('#rp_engine_tracker_collapse')
        .attr('title', cfg.panelCollapsed ? 'Expand tracker' : 'Collapse tracker')
        .html('<i class="fa-solid fa-book-open"></i>');

    const currentTracker = tracker();
    const panelTracker = pendingPanelRefreshAfterGeneration && visibleTrackerSnapshot
        ? visibleTrackerSnapshot
        : currentTracker;
    const data = summarizeTracker(panelTracker);
    const userLabel = data.user?.name || name1 || 'User';
    const presentHtml = data.present.length
        ? data.present.map(renderNpc).join('')
        : '<div class="rp-engine-muted">No present NPCs initialized.</div>';
    const absentHtml = data.absent.length
        ? data.absent.map(renderNpc).join('')
        : '<div class="rp-engine-muted">No absent NPCs tracked.</div>';
    const showAbsent = !(cfg.enableNpcArchive && cfg.pruneArchivedAbsentNpcs);
    const inventoryHtml = data.inventory.length
        ? `<ul>${data.inventory.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
        : '<div class="rp-engine-muted">No inventory tracked yet.</div>';
    const pendingHtml = data.pendingTasks.length
        ? `<ul class="rp-engine-task-list">${data.pendingTasks.map(renderTask).join('')}</ul>`
        : '<div class="rp-engine-muted">No pending tasks tracked yet.</div>';
    const auditPayload = latestAuditDisplayPayload();
    const auditHtml = auditPayload
        ? renderAuditDisplay(auditPayload)
        : `<details class="rp-engine-audit-details">
            <summary>Audit</summary>
            <div class="rp-engine-muted">No mechanics audit yet.</div>
        </details>`;
    const creatorHtml = shouldShowCharacterCreatorPrompt()
        ? `<section class="rp-engine-creator-prompt">
            <h4>New Character</h4>
            <div class="rp-engine-muted">No user messages detected in this chat. Create a Persona-ready character sheet?</div>
            <button id="rp_engine_panel_open_creator" type="button">Create Character</button>
            <button id="rp_engine_panel_skip_creator" type="button">Not Now</button>
        </section>`
        : '';

    root.find('.rp-engine-body').html(`
        ${creatorHtml}
        <section>
            <h4>Scene</h4>
            <div>${escapeHtml(data.scene.location || 'Unknown location')}</div>
            <div class="rp-engine-muted">${renderSceneTime(data.scene, data.worldClock)}</div>
        </section>
        <details open>
            <summary>Present NPCs</summary>
            ${presentHtml}
        </details>
        ${showAbsent ? `<details>
            <summary>Absent NPCs</summary>
            ${absentHtml}
        </details>` : ''}
        <section>
            <h4>${escapeHtml(userLabel)}</h4>
            <div class="rp-engine-statline">PHY ${data.user.stats.PHY} | MND ${data.user.stats.MND} | CHA ${data.user.stats.CHA}</div>
            ${data.user.condition && data.user.condition !== 'unknown' ? `<div class="rp-engine-muted">${escapeHtml(data.user.condition)}</div>` : ''}
        </section>
        <details>
            <summary>Inventory for ${escapeHtml(userLabel)}</summary>
            ${inventoryHtml}
        </details>
        <details>
            <summary>Pending Tasks for ${escapeHtml(userLabel)}</summary>
            ${pendingHtml}
        </details>
        ${auditHtml}
    `);
    root.find('#rp_engine_panel_open_creator').off('click').on('click', () => openCharacterCreatorDialog({ manual: true }));
    root.find('#rp_engine_panel_skip_creator').off('click').on('click', () => {
        const current = tracker();
        current.characterCreator.offered = true;
        chat_metadata[METADATA_KEY] = current;
        saveTracker();
        renderPanel();
    });
    applyPanelPosition();
}

function currentArchiveChatId() {
    if (!settings().scopeNpcArchivePerChat) return 'global';
    const context = getContext();
    const raw = context?.chatId || context?.getCurrentChatId?.() || 'unsaved-chat';
    return sanitizeArchiveChatId(raw);
}

function currentArchiveOwnerKey() {
    const context = getContext();
    if (context?.groupId !== undefined && context?.groupId !== null && context?.groupId !== '') {
        return `group:${sanitizeArchiveChatId(context.groupId)}`;
    }
    if (context?.characterId !== undefined && context?.characterId !== null && context?.characterId !== '') {
        return `character:${sanitizeArchiveChatId(context.characterId)}`;
    }
    return 'unknown';
}

function sanitizeArchiveChatId(value) {
    return String(value || 'unsaved-chat')
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/\.jsonl$/i, '')
        .replace(/[^\p{L}\p{N}_. -]+/gu, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'unsaved-chat';
}

function archiveEntryKey(name, chatId = currentArchiveChatId(), ownerKey = currentArchiveOwnerKey()) {
    const owner = String(ownerKey || 'unknown').trim().replace(/\s+/g, '_');
    return `RPE:${owner}:${sanitizeArchiveChatId(chatId)}:${String(name || '').trim()}`;
}

function archiveEntryMatchesCurrentChat(parsed) {
    if (!settings().scopeNpcArchivePerChat) return true;
    const wanted = currentArchiveChatId();
    const stored = sanitizeArchiveChatId(parsed?.chatId || 'global');
    if (stored !== wanted) return false;
    const storedOwner = String(parsed?.archiveOwner || '').trim();
    return !storedOwner || storedOwner === 'unknown' || storedOwner === currentArchiveOwnerKey();
}

function shouldShowCharacterCreatorPrompt() {
    const cfg = settings();
    if (!cfg.enableCharacterCreator || !cfg.autoOfferCharacterCreator) return false;
    const current = tracker();
    if (current.characterCreator?.completed || current.characterCreator?.offered) return false;
    if (parseCoreStats(activePersonaText())) return false;
    return countUserMessages() === 0;
}

function maybeOfferCharacterCreator() {
    if (!shouldShowCharacterCreatorPrompt()) return;
    renderPanel();
}

function countUserMessages() {
    const sourceChat = [
        Array.isArray(getContext().chat) ? getContext().chat : [],
        Array.isArray(liveChat) ? liveChat : [],
    ].find(x => x.length) || [];
    return sourceChat.filter(message => {
        const roleName = String(message?.name || '').trim();
        return message?.is_user || message?.role === 'user' || roleName === name1 || message?.force_avatar === 'persona';
    }).length;
}

function renderSceneTime(scene, worldClock = null) {
    const time = escapeHtml(scene?.time || 'Unknown time');
    const weather = scene?.weather ? ` | ${escapeHtml(scene.weather)}` : '';
    const clock = worldClock || {};
    const advance = clock.enabled !== false && clock.lastAdvance
        ? `<div class="rp-engine-clock-note">${escapeHtml(clock.lastAdvance)}</div>`
        : '';
    return `${time}${weather}${advance}`;
}

function renderNpc(npc) {
    const d = npc.disposition || { B: 2, F: 2, H: 2 };
    const s = npc.coreStats || { PHY: 2, MND: 2, CHA: 2 };
    const descriptor = npc.descriptor ? `<div class="rp-engine-muted">${escapeHtml(npc.descriptor)}</div>` : '';
    const condition = npc.condition && npc.condition !== 'unknown'
        ? `<div class="rp-engine-muted">${escapeHtml(npc.condition)}${npc.position ? ` | ${escapeHtml(npc.position)}` : ''}</div>`
        : (npc.position ? `<div class="rp-engine-muted">${escapeHtml(npc.position)}</div>` : '');
    return `
        <div class="rp-engine-npc">
            <div class="rp-engine-npc-title">${escapeHtml(npc.name || npc.id)}</div>
            ${descriptor}
            <div>B${d.B}/F${d.F}/H${d.H} | Rapport ${npc.rapport ?? 0} | Gate ${escapeHtml(npc.intimacyGate || 'SKIP')}</div>
            <div class="rp-engine-muted">Feels: ${escapeHtml(npc.feelsTowardUser || describeNpcFeeling(npc))}</div>
            <div class="rp-engine-statline">PHY ${s.PHY} | MND ${s.MND} | CHA ${s.CHA}</div>
            ${condition}
        </div>
    `;
}

function renderTask(task) {
    const item = typeof task === 'string' ? { task } : (task || {});
    const bits = [
        item.due ? `Due: ${escapeHtml(item.due)}` : '',
        item.source ? `Source: ${escapeHtml(item.source)}` : '',
    ].filter(Boolean);
    return `<li>
        <div>${escapeHtml(item.task || 'Pending task')}</div>
        ${bits.length ? `<div class="rp-engine-muted">${bits.join(' | ')}</div>` : ''}
    </li>`;
}

function renderAudit(audit) {
    if (audit.rollback) {
        return `
            <div class="rp-engine-audit-card">
                <div class="rp-engine-audit-title">Mechanics Rolled Back</div>
                ${renderKv('At', audit.at)}
                ${renderKv('Reason', audit.reason)}
                ${audit.deletedTrigger ? renderKv('Deleted Input', audit.deletedTrigger) : ''}
            </div>
        `;
    }
    if (audit.error) {
        return `
            <div class="rp-engine-audit-card rp-engine-audit-error">
                <div class="rp-engine-audit-title">Resolver Error</div>
                ${renderKv('At', audit.at)}
                ${renderKv('Message', audit.error)}
                ${audit.latestUserMessage ? renderKv('Latest User Message', audit.latestUserMessage) : ''}
            </div>
        `;
    }

    const extraction = audit.extraction || {};
    const packet = audit.resolutionPacket || {};
    const chaos = audit.chaosHandoff?.CHAOS || {};
    const proactivity = audit.proactivityHandoff || {};
    const aggression = audit.aggressionResults || {};
    const roll = packet.roll || {};
    const npcs = Array.isArray(audit.npcHandoffs) ? audit.npcHandoffs : [];
    const statLine = packet.stats ? `${packet.stats.USER || '?'} vs ${packet.stats.OPP || '?'}` : '(none)';
    const rollLine = Number.isFinite(roll.atkDie)
        ? `${roll.atkDie} -> ${roll.atkTot} vs ${roll.defDie} -> ${roll.defTot} (margin ${roll.margin})`
        : '(no resolution roll)';

    return `
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Intent</div>
            ${renderKv('Goal', packet.GOAL || extraction.goal)}
            ${renderKv('Decisive Action', packet.DecisiveAction || extraction.decisiveAction)}
            ${renderKv('Evidence', extraction.decisiveActionEvidence || extraction.goalEvidence)}
            ${renderKv('On Success', packet.OutcomeOnSuccess || extraction.outcomeOnSuccess)}
            ${renderKv('On Failure', packet.OutcomeOnFailure || extraction.outcomeOnFailure)}
        </div>
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Resolution</div>
            ${renderKv('Stakes', packet.STAKES || extraction.hasStakes)}
            ${renderKv('Stats', statLine)}
            ${renderKv('Roll', rollLine)}
            ${renderKv('Outcome', `${packet.OutcomeTier || 'NONE'} / ${packet.Outcome || 'no_roll'}`)}
            ${renderKv('Landed', packet.LandedActions)}
            ${renderKv('Counter', packet.CounterPotential)}
        </div>
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Targets</div>
            ${renderKv('Action Targets', listText(packet.ActionTargets || extraction.actionTargets))}
            ${renderKv('Opposing NPCs', listText(packet.OppTargets?.NPC || extraction.oppTargetsNpc))}
            ${renderKv('Opposing Env', listText(packet.OppTargets?.ENV || extraction.oppTargetsEnv))}
            ${renderKv('Benefited', listText(packet.BenefitedObservers || extraction.benefitedObservers))}
            ${renderKv('Harmed', listText(packet.HarmedObservers || extraction.harmedObservers))}
        </div>
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Relationship</div>
            ${npcs.length ? npcs.map(renderNpcAudit).join('') : '<div class="rp-engine-muted">No NPC relationship update.</div>'}
        </div>
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Chaos</div>
            ${renderKv('Triggered', chaos.triggered ? 'Y' : 'N')}
            ${renderKv('Band', chaos.band || 'None')}
            ${renderKv('Magnitude', chaos.magnitude || 'None')}
            ${renderKv('Anchor', chaos.anchor || 'None')}
            ${renderKv('Vector', chaos.vector || 'None')}
            ${renderKv('Context', chaos.ctx || '(none)')}
            ${renderKv('Dice', chaos.dice ? `A ${chaos.dice.A}, O ${chaos.dice.O}, I ${chaos.dice.I}, anchor ${chaos.dice.anchorIdx}, vector ${chaos.dice.vectorIdx}` : '(none)')}
        </div>
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Proactivity</div>
            ${Object.keys(proactivity).length ? Object.entries(proactivity).map(([name, item]) => renderProactivityAudit(name, item, aggression[name])).join('') : '<div class="rp-engine-muted">No NPC proactivity.</div>'}
        </div>
    `;
}

function renderNpcAudit(npc) {
    return `
        <div class="rp-engine-audit-npc">
            <div class="rp-engine-audit-npc-title">${escapeHtml(npc.NPC || 'NPC')}</div>
            ${renderKv('State', `${npc.FinalState || '?'} / ${npc.Behavior || '?'}${npc.Lock ? ` / Lock ${npc.Lock}` : ''}`)}
            ${renderKv('Target', npc.Target)}
            ${renderKv('Gate', npc.IntimacyGate)}
        </div>
    `;
}

function renderProactivityAudit(name, item, aggression) {
    return `
        <div class="rp-engine-audit-npc">
            <div class="rp-engine-audit-npc-title">${escapeHtml(name || 'NPC')}</div>
            ${renderKv('Proactive', item.Proactive)}
            ${renderKv('Intent', item.Intent)}
            ${renderKv('Impulse', item.Impulse)}
            ${renderKv('Targets User', item.TargetsUser)}
            ${renderKv('Tier', item.ProactivityTier)}
            ${renderKv('Die / Threshold', item.ProactivityDie ? `${item.ProactivityDie} / ${item.Threshold}` : item.Threshold)}
            ${aggression ? renderKv('Aggression', `${aggression.ReactionOutcome} (margin ${aggression.Margin})`) : ''}
        </div>
    `;
}

function renderKv(label, value) {
    const text = value === undefined || value === null || value === '' ? '(none)' : String(value);
    return `
        <div class="rp-engine-kv">
            <span>${escapeHtml(label)}</span>
            <b>${escapeHtml(text)}</b>
        </div>
    `;
}

function listText(value) {
    return Array.isArray(value) && value.length ? value.join(', ') : '(none)';
}

function setupUi() {
    if (!$('#rp_engine_tracker_panel').length) {
        $('body').append(`
            <div id="rp_engine_tracker_panel">
                <div class="rp-engine-header">
                    <div class="rp-engine-actions">
                        <button id="rp_engine_tracker_collapse" title="Collapse tracker"><i class="fa-solid fa-book-open"></i></button>
                    </div>
                    <strong class="rp-engine-title">RP Engine</strong>
                </div>
                <div class="rp-engine-body"></div>
            </div>
        `);
    }

    setupExtensionSettingsBlock();
    setupCharacterCreatorDialog();

    if (!$('#rp_engine_tracker_button').length) {
        $('#extensionsMenu').append(`
            <div id="rp_engine_tracker_button" class="list-group-item flex-container flexGap5">
                <div class="fa-solid fa-dice-d20 extensionsMenuExtensionButton"></div>
                RP Engine Settings
            </div>
        `);
    }

    $('#rp_engine_tracker_button').off('click').on('click', () => {
        openSettingsDialog();
    });

    $('#rp_engine_tracker_collapse').off('click').on('click', () => {
        if (panelDragMoved) {
            panelDragMoved = false;
            return;
        }
        settings().panelCollapsed = !settings().panelCollapsed;
        saveSettingsDebounced();
        renderPanel();
    });

    setupPanelDrag();
    setupSettingsDialog();
    renderPanel();
    maybeOfferCharacterCreator();
}

function setupExtensionSettingsBlock() {
    if (!$('#rp_engine_extension_settings').length) {
        const target = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
        target.append(`
            <div id="rp_engine_extension_settings" class="extension_container">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>RP Engine</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="rp-engine-extension-row">
                            <label><input id="rp_engine_ext_enabled" type="checkbox"> Enable engine</label>
                            <label><input id="rp_engine_ext_inject" type="checkbox"> Inject final payload</label>
                        </div>
                        <div class="rp-engine-extension-row">
                            <label><input id="rp_engine_ext_panel" type="checkbox"> Show tracker panel</label>
                        </div>
                        <div class="rp-engine-extension-row">
                            <label><input id="rp_engine_ext_time" type="checkbox"> World time tracking</label>
                            <label>1 real min =
                                <input id="rp_engine_ext_time_scale" type="number" min="0.1" max="120" step="0.1" class="text_pole" style="width:70px">
                                world min
                            </label>
                        </div>
                        <div class="rp-engine-extension-row">
                            <label><input id="rp_engine_ext_creator" type="checkbox"> Character creator</label>
                            <label><input id="rp_engine_ext_creator_offer" type="checkbox"> Offer on new chat</label>
                            <button id="rp_engine_open_creator" type="button" class="menu_button">Create Character</button>
                        </div>
                        <div class="rp-engine-extension-row">
                            <label><input id="rp_engine_ext_archive" type="checkbox"> NPC Lorebook archive</label>
                            <label>Archive book
                                <select id="rp_engine_ext_archive_world"></select>
                            </label>
                            <button id="rp_engine_refresh_archive_worlds" type="button" class="menu_button">Refresh</button>
                            <button id="rp_engine_prune_forgotten" type="button" class="menu_button">Prune Forgotten</button>
                        </div>
                        <div class="rp-engine-muted">Mechanics only: Resolution, Relationship, Chaos, Proactivity, aggression handling, tracker state, NPC archive, world time, and character creation. Prose style and writing constraints belong in your SillyTavern preset.</div>
                    </div>
                </div>
            </div>
        `);
    }

    bindExtensionSettingsBlock();
    syncExtensionSettingsBlock();
}

function bindExtensionSettingsBlock() {
    const root = $('#rp_engine_extension_settings');
    root.find('#rp_engine_open_creator').off('click').on('click', () => openCharacterCreatorDialog({ manual: true }));
    root.find('#rp_engine_refresh_archive_worlds').off('click').on('click', async () => {
        await updateWorldInfoList();
        syncExtensionSettingsBlock();
    });
    root.find('#rp_engine_prune_forgotten').off('click').on('click', pruneForgottenNpcs);
    root.find('input, select').off('change').on('change', () => {
        const cfg = settings();
        cfg.enabled = root.find('#rp_engine_ext_enabled').prop('checked');
        cfg.injectHandoff = root.find('#rp_engine_ext_inject').prop('checked');
        cfg.showPanel = root.find('#rp_engine_ext_panel').prop('checked');
        cfg.enableTimeTracking = root.find('#rp_engine_ext_time').prop('checked');
        cfg.timeScaleWorldMinutesPerRealMinute = Math.max(0.1, Number(root.find('#rp_engine_ext_time_scale').val()) || DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute);
        cfg.enableCharacterCreator = root.find('#rp_engine_ext_creator').prop('checked');
        cfg.autoOfferCharacterCreator = root.find('#rp_engine_ext_creator_offer').prop('checked');
        cfg.enableNpcArchive = root.find('#rp_engine_ext_archive').prop('checked');
        cfg.npcArchiveWorld = String(root.find('#rp_engine_ext_archive_world').val() || '');
        saveSettingsDebounced();
        if (cfg.enabled) {
            applyEngineContextPrompt();
        } else {
            clearEngineContextPrompt();
        }
        renderPanel();
    });
}

function syncExtensionSettingsBlock() {
    const cfg = settings();
    const root = $('#rp_engine_extension_settings');
    root.find('#rp_engine_ext_enabled').prop('checked', !!cfg.enabled);
    root.find('#rp_engine_ext_inject').prop('checked', !!cfg.injectHandoff);
    root.find('#rp_engine_ext_panel').prop('checked', !!cfg.showPanel);
    root.find('#rp_engine_ext_time').prop('checked', !!cfg.enableTimeTracking);
    root.find('#rp_engine_ext_time_scale').val(Number(cfg.timeScaleWorldMinutesPerRealMinute) || DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute);
    root.find('#rp_engine_ext_creator').prop('checked', !!cfg.enableCharacterCreator);
    root.find('#rp_engine_ext_creator_offer').prop('checked', !!cfg.autoOfferCharacterCreator);
    root.find('#rp_engine_ext_archive').prop('checked', !!cfg.enableNpcArchive);
    root.find('#rp_engine_ext_archive_world').html(renderWorldOptions(cfg.npcArchiveWorld));
    if (cfg.enabled) {
        applyEngineContextPrompt();
    } else {
        clearEngineContextPrompt();
    }
}

function renderWorldOptions(selected) {
    const names = Array.isArray(world_names) ? world_names : [];
    const options = ['<option value="">Auto-create / default</option>'];
    for (const name of names) {
        options.push(`<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`);
    }
    return options.join('');
}

function setupSettingsDialog() {
    if ($('#rp_engine_settings_modal').length) return;

    $('body').append(`
        <div id="rp_engine_settings_modal" class="rp-engine-settings-hidden">
            <div class="rp-engine-settings-card">
                <div class="rp-engine-settings-header">
                    <strong>RP Engine Settings</strong>
                    <button id="rp_engine_settings_close" title="Close">Close</button>
                </div>
                <div class="rp-engine-settings-body"></div>
            </div>
        </div>
    `);

    $('#rp_engine_settings_close').on('click', closeSettingsDialog);
    $('#rp_engine_settings_modal').on('click', (event) => {
        if (event.target?.id === 'rp_engine_settings_modal') closeSettingsDialog();
    });
}

function openSettingsDialog() {
    setupSettingsDialog();
    renderSettingsDialog();
    $('#rp_engine_settings_modal').removeClass('rp-engine-settings-hidden');
}

function closeSettingsDialog() {
    $('#rp_engine_settings_modal').addClass('rp-engine-settings-hidden');
}

function setupCharacterCreatorDialog() {
    if ($('#rp_engine_character_creator_modal').length) return;

    $('body').append(`
        <div id="rp_engine_character_creator_modal" class="rp-engine-settings-hidden">
            <div class="rp-engine-settings-card rp-engine-character-card">
                <div class="rp-engine-settings-header">
                    <strong>Character Creator</strong>
                    <button id="rp_engine_character_close" title="Close">Close</button>
                </div>
                <div class="rp-engine-character-body"></div>
            </div>
        </div>
    `);

    $('#rp_engine_character_close').on('click', closeCharacterCreatorDialog);
    $('#rp_engine_character_creator_modal').on('click', (event) => {
        if (event.target?.id === 'rp_engine_character_creator_modal') closeCharacterCreatorDialog();
    });
}

function openCharacterCreatorDialog({ manual = false } = {}) {
    const cfg = settings();
    if (!manual && !cfg.enableCharacterCreator) return;
    setupCharacterCreatorDialog();
    if (!characterCreatorState || manual) {
        characterCreatorState = createCharacterCreatorState();
    }
    const current = tracker();
    current.characterCreator.offered = true;
    chat_metadata[METADATA_KEY] = current;
    saveTracker();
    renderCharacterCreatorDialog();
    $('#rp_engine_character_creator_modal').removeClass('rp-engine-settings-hidden');
}

function closeCharacterCreatorDialog() {
    $('#rp_engine_character_creator_modal').addClass('rp-engine-settings-hidden');
}

function createCharacterCreatorState() {
    const roll = rollCharacterCreatorStats();
    return {
        step: 'stats',
        roll,
        stats: structuredClone(roll.baseStats),
        rerolled: false,
        swapped: false,
        basics: normalizeCharacterBasics(rollCharacterCreatorBasics(), 'random'),
        basicsMode: 'random',
        draft: null,
        sheet: '',
        status: '',
    };
}

function renderCharacterCreatorDialog() {
    setupCharacterCreatorDialog();
    const state = characterCreatorState || createCharacterCreatorState();
    characterCreatorState = state;
    const body = $('#rp_engine_character_creator_modal .rp-engine-character-body');
    const stats = state.stats || { PHY: 3, MND: 3, CHA: 3 };
    const pool = state.roll?.pool || {};
    state.basics = normalizeCharacterBasics(state.basics, state.basicsMode);
    state.basicsMode = state.basics.mode;
    const basics = state.basics;
    const statRows = ['PHY', 'MND', 'CHA'].map(stat => `
        <tr>
            <th>${stat}</th>
            <td>${Array.isArray(pool[stat]) ? pool[stat].join(', ') : '-'}</td>
            <td>${stats[stat]}</td>
        </tr>
    `).join('');
    const sheetHtml = state.sheet
        ? `<textarea id="rp_engine_character_sheet" spellcheck="false">${escapeHtml(state.sheet)}</textarea>`
        : '<div class="rp-engine-muted">Generate the character details after stats are finalized.</div>';

    body.html(`
        <div class="rp-engine-muted">Stats are real d10 rolls made by the extension. Creative details are drafted as structured output, then the final sheet can be applied to the active Persona field.</div>
        <div class="rp-engine-character-basics">
            <div class="rp-engine-settings-row">
                <label>Basics
                    <select id="rp_engine_character_basics_mode">
                        <option value="random" ${basics.mode === 'random' ? 'selected' : ''}>Random</option>
                        <option value="manual" ${basics.mode === 'manual' ? 'selected' : ''}>Choose basics</option>
                    </select>
                </label>
                <button id="rp_engine_character_reroll_basics" type="button" ${basics.mode === 'random' ? '' : 'disabled'}>Reroll Race</button>
                <span class="rp-engine-muted">${basics.mode === 'random' ? `Race d100: ${basics.raceRoll}` : 'Selected race is enforced; remaining details are randomized.'}</span>
            </div>
            <div class="rp-engine-settings-row">
                <label>Race
                    <select id="rp_engine_character_race" ${basics.mode === 'random' ? 'disabled' : ''}>
                        ${CHARACTER_CREATOR_RACES.map(race => `<option value="${escapeHtml(race)}" ${race === basics.race ? 'selected' : ''}>${escapeHtml(race)}</option>`).join('')}
                        <option value="__custom" ${!CHARACTER_CREATOR_RACES.includes(basics.race) ? 'selected' : ''}>Custom humanoid fantasy race</option>
                    </select>
                </label>
                <input id="rp_engine_character_custom_race" type="text" placeholder="Custom race" value="${!CHARACTER_CREATOR_RACES.includes(basics.race) ? escapeHtml(basics.race) : ''}" ${basics.mode === 'manual' && !CHARACTER_CREATOR_RACES.includes(basics.race) ? '' : 'disabled'}>
                <span class="rp-engine-muted">Name, gender, appearance, traits, abilities, and inventory are drafted by the model, then editable in the final sheet before applying to Persona.</span>
            </div>
        </div>
        <table class="rp-engine-character-table">
            <thead><tr><th>Stat</th><th>Rolls</th><th>Current</th></tr></thead>
            <tbody>${statRows}</tbody>
        </table>
        <div class="rp-engine-settings-row">
            <label>Optional reroll
                <select id="rp_engine_character_reroll_stat" ${state.rerolled ? 'disabled' : ''}>
                    <option value="">No reroll</option>
                    <option value="PHY">PHY</option>
                    <option value="MND">MND</option>
                    <option value="CHA">CHA</option>
                </select>
            </label>
            <button id="rp_engine_character_apply_reroll" type="button" ${state.rerolled ? 'disabled' : ''}>Apply Reroll</button>
            <span class="rp-engine-muted">${state.rerolled ? `Reroll value used: ${state.roll.rerollValue}` : 'Reroll value is hidden until used or skipped.'}</span>
        </div>
        <div class="rp-engine-settings-row">
            <label>Swap
                <select id="rp_engine_character_swap_a" ${state.swapped ? 'disabled' : ''}>
                    <option value="">None</option><option value="PHY">PHY</option><option value="MND">MND</option><option value="CHA">CHA</option>
                </select>
            </label>
            <label>with
                <select id="rp_engine_character_swap_b" ${state.swapped ? 'disabled' : ''}>
                    <option value="">None</option><option value="PHY">PHY</option><option value="MND">MND</option><option value="CHA">CHA</option>
                </select>
            </label>
            <button id="rp_engine_character_apply_swap" type="button" ${state.swapped ? 'disabled' : ''}>Apply Swap</button>
        </div>
        <div class="rp-engine-settings-row">
            <button id="rp_engine_character_generate" type="button">Generate Details</button>
            <button id="rp_engine_character_apply_persona" type="button" ${state.sheet ? '' : 'disabled'}>Apply to Persona</button>
            <button id="rp_engine_character_copy" type="button" ${state.sheet ? '' : 'disabled'}>Copy Sheet</button>
            <button id="rp_engine_character_reset" type="button">Start Over</button>
        </div>
        ${state.status ? `<div class="rp-engine-muted">${escapeHtml(state.status)}</div>` : ''}
        ${sheetHtml}
    `);

    body.find('#rp_engine_character_basics_mode').on('change', () => {
        const mode = String(body.find('#rp_engine_character_basics_mode').val() || 'random');
        state.basicsMode = mode === 'manual' ? 'manual' : 'random';
        state.basics = state.basicsMode === 'random'
            ? normalizeCharacterBasics(rollCharacterCreatorBasics(), 'random')
            : { ...normalizeCharacterBasics(state.basics, 'manual'), mode: 'manual' };
        state.status = state.basicsMode === 'random' ? 'Race rerolled by the extension.' : 'Choose a race, or type a custom humanoid fantasy race.';
        state.sheet = '';
        renderCharacterCreatorDialog();
    });
    body.find('#rp_engine_character_reroll_basics').on('click', () => {
        state.basics = normalizeCharacterBasics(rollCharacterCreatorBasics(), 'random');
        state.basicsMode = 'random';
        state.status = 'Race rerolled by the extension.';
        state.sheet = '';
        renderCharacterCreatorDialog();
    });
    body.find('#rp_engine_character_race, #rp_engine_character_custom_race').on('change input', () => {
        state.basicsMode = String(body.find('#rp_engine_character_basics_mode').val() || 'random') === 'manual' ? 'manual' : 'random';
        const selectedRace = String(body.find('#rp_engine_character_race').val() || CHARACTER_CREATOR_RACES[0]);
        const customRace = cleanUiText(body.find('#rp_engine_character_custom_race').val());
        state.basics = normalizeCharacterBasics({
            mode: state.basicsMode,
            raceRoll: state.basics?.raceRoll || 1,
            race: selectedRace === '__custom' ? (customRace || 'Human') : selectedRace,
        }, state.basicsMode);
        if (state.basicsMode === 'manual' && selectedRace === '__custom') {
            body.find('#rp_engine_character_custom_race').prop('disabled', false);
        }
        state.sheet = '';
    });

    body.find('#rp_engine_character_apply_reroll').on('click', () => {
        const stat = String(body.find('#rp_engine_character_reroll_stat').val() || '');
        state.stats = stat ? applyCharacterCreatorReroll(state.stats, stat, state.roll.rerollValue) : state.stats;
        state.rerolled = true;
        state.status = stat ? `${stat} reroll revealed as ${state.roll.rerollValue}; higher value kept.` : `Reroll skipped. Hidden value was ${state.roll.rerollValue}.`;
        state.sheet = '';
        renderCharacterCreatorDialog();
    });
    body.find('#rp_engine_character_apply_swap').on('click', () => {
        const a = String(body.find('#rp_engine_character_swap_a').val() || '');
        const b = String(body.find('#rp_engine_character_swap_b').val() || '');
        state.stats = applyCharacterCreatorSwap(state.stats, a, b);
        state.swapped = Boolean(a && b && a !== b);
        state.status = state.swapped ? `${a} and ${b} swapped.` : 'No swap applied.';
        state.sheet = '';
        renderCharacterCreatorDialog();
    });
    body.find('#rp_engine_character_generate').on('click', generateCharacterDetails);
    body.find('#rp_engine_character_apply_persona').on('click', applyCharacterCreatorToPersona);
    body.find('#rp_engine_character_copy').on('click', async () => {
        const text = String(body.find('#rp_engine_character_sheet').val() || state.sheet || '');
        if (text) {
            await navigator.clipboard?.writeText(text);
            toastr.success('Character sheet copied.', 'RP Engine');
        }
    });
    body.find('#rp_engine_character_reset').on('click', () => {
        characterCreatorState = createCharacterCreatorState();
        renderCharacterCreatorDialog();
    });
}

async function generateCharacterDetails() {
    if (!characterCreatorState) characterCreatorState = createCharacterCreatorState();
    characterCreatorState.basics = normalizeCharacterBasics(characterCreatorState.basics, characterCreatorState.basicsMode);
    characterCreatorState.status = 'Generating character details...';
    renderCharacterCreatorDialog();
    const stats = characterCreatorState.stats;
    const basics = characterCreatorState.basics;
    let draft = null;
    const prompt = buildCharacterCreatorPrompt(stats, basics);
    try {
        const response = await generateQuietPromptWithTimeout({
            quietPrompt: prompt,
            skipWIAN: false,
            responseLength: 2400,
            jsonSchema: CHARACTER_CREATOR_SCHEMA,
            removeReasoning: true,
        }, Math.max(Number(settings().resolverTimeoutMs) || DEFAULT_SETTINGS.resolverTimeoutMs, 60000));
        draft = parseJsonResponse(response);
    } catch (error) {
        console.warn('[RP Engine Tracker] Character creator model pass failed; using fallback.', error);
    }
    if (!isUsableCharacterDraft(draft)) {
        try {
            const retryResponse = await generateQuietPromptWithTimeout({
                quietPrompt: `${prompt}\n\nReturn only one valid compact JSON object. No markdown, no prose, no commentary. The final answer content must begin with { and end with }.`,
                skipWIAN: false,
                responseLength: 2400,
                removeReasoning: true,
            }, Math.min(Math.max(Number(settings().resolverTimeoutMs) || DEFAULT_SETTINGS.resolverTimeoutMs, 60000), 90000));
            const retryDraft = parseJsonResponse(retryResponse);
            if (isUsableCharacterDraft(retryDraft)) {
                draft = retryDraft;
            }
        } catch (retryError) {
            console.warn('[RP Engine Tracker] Character creator plain JSON retry failed; using fallback.', retryError);
        }
    }
    if (!isUsableCharacterDraft(draft)) {
        draft = buildFallbackCharacterDraft(stats, basics);
        characterCreatorState.status = 'Model draft failed; deterministic fallback used.';
    } else {
        draft = applyCharacterBasicsToDraft(draft, basics);
        characterCreatorState.status = 'Character details generated.';
    }
    characterCreatorState.draft = draft;
    characterCreatorState.sheet = buildCharacterSheet(draft, stats);
    renderCharacterCreatorDialog();
}

function isUsableCharacterDraft(draft) {
    if (!draft || typeof draft !== 'object') return false;
    const basic = draft.basic && typeof draft.basic === 'object' ? draft.basic : draft;
    const hasBasic = ['name', 'race', 'gender', 'age'].some(key => String(basic[key] || '').trim());
    const hasTraits = Array.isArray(draft.traits) && draft.traits.length >= 1;
    const hasAbilities = Array.isArray(draft.abilities) && draft.abilities.length >= 1;
    const hasInventory = Array.isArray(draft.inventory) && draft.inventory.length >= 1;
    return hasBasic && hasTraits && hasAbilities && hasInventory;
}

function normalizeCharacterBasics(value, forcedMode = '') {
    const base = value && typeof value === 'object' ? value : {};
    const mode = forcedMode === 'manual' || base.mode === 'manual' ? 'manual' : 'random';
    const fallback = rollCharacterCreatorBasics(() => 0);
    const race = cleanUiText(base.race) || fallback.race;
    return {
        mode,
        raceRoll: clampUiInt(base.raceRoll, 1, 100),
        raceDie: 100,
        race,
    };
}

function applyCharacterBasicsToDraft(draft, basics) {
    const normalized = normalizeCharacterBasics(basics);
    const output = draft && typeof draft === 'object' ? structuredClone(draft) : {};
    const currentBasic = output.basic && typeof output.basic === 'object' ? output.basic : output;
    output.basic = {
        ...currentBasic,
        race: normalized.race,
        gender: cleanUiText(currentBasic.gender) || 'Unspecified',
        name: cleanUiText(currentBasic.name) || '{{user}}',
        age: cleanUiText(currentBasic.age) || 'young adult',
    };
    if (typeof output.appearance === 'string') {
        output.appearance = {
            distinctFeatures: cleanUiText(output.appearance),
        };
    }
    return output;
}

function cleanUiText(value) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function clampUiInt(value, min, max) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.min(Math.max(number, min), max);
}

function buildCharacterCreatorPrompt(stats, basics = {}) {
    const fixed = normalizeCharacterBasics(basics);
    const fixedLines = [
        `Race: ${fixed.race} (${fixed.mode === 'random' ? `extension dice d100=${fixed.raceRoll}` : 'user-selected'})`,
        'Name, gender, age, appearance, traits, abilities, inventory, and notes: generate them now.',
    ].filter(Boolean);
    return [
        'You are the hidden character creator for the RP Engine extension. Return JSON only.',
        '',
        'Create one fantasy/isekai user character that fits these fixed stats:',
        `PHY ${stats.PHY}, MND ${stats.MND}, CHA ${stats.CHA}`,
        '',
        'Fixed or preselected character basics:',
        ...fixedLines.map(line => `- ${line}`),
        '',
        'Rules:',
        '- Race is fixed by the extension or user. Copy it exactly into JSON. Do not replace it with a more common race.',
        '- Generate gender, age, appearance, traits, abilities, inventory, notes, and name unless they are already explicit in active user/persona context.',
        '- Do not mention dice, rolls, classes, levels, XP, cooldowns, damage formulas, bonuses, or penalties.',
        '- Traits are always-active narrative capabilities. Abilities require deliberate activation.',
        '- Traits and abilities grant narrative permission only. They never create numeric modifiers.',
        '- Ability use under risk is resolved later by the RP Engine through PHY, MND, or CHA.',
        '- Private senses are allowed, but they remain private to the user. Do not write that others dismiss, notice, sense, react to, infer, or explain private perceptions.',
        '- NPCs only perceive spirits, auras, hidden entities, or user-only information if an explicit later scene fact gives that NPC the same sense. Otherwise NPCs react only to observable user behavior.',
        '- Inventory must be fantasy/isekai travel gear. No modern Earth items. No currency amount.',
        '- Generate one clean fantasy/isekai proper name. Avoid generic modern-Western names.',
        '',
        'Return compact JSON matching the schema. Use two traits, two abilities, three to six inventory items, and concise notes.',
    ].join('\n');
}

function buildFallbackCharacterDraft(stats, basics = {}) {
    const high = Object.entries(stats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MND';
    const fixed = normalizeCharacterBasics(basics);
    const names = {
        PHY: 'Veyraka',
        MND: 'Saryndel',
        CHA: 'Lunaveth',
    };
    return applyCharacterBasicsToDraft({
        basic: {
            name: names[high] || 'Saryndel',
            race: fixed.race || (high === 'PHY' ? 'ash-blooded human' : high === 'CHA' ? 'moon-touched elf' : 'veil-marked human'),
            gender: 'Unspecified',
            age: 'young adult',
        },
        appearance: {
            height: high === 'PHY' ? 'tall' : 'average',
            build: high === 'PHY' ? 'compact muscle' : 'lean',
            hair: 'dark, tied back',
            eyes: high === 'MND' ? 'pale gray' : 'amber',
            skin: 'warm brown',
            distinctFeatures: high === 'MND' ? 'thin silver mark under one eye' : 'old travel scars across the hands',
        },
        traits: [
            { name: 'Road-Hardened Body', effect: 'Recovers footing quickly after rough travel, falls, or forced movement.' },
            { name: 'Low-Light Adaptation', effect: 'Sees shape and movement clearly in dim natural light.' },
        ],
        abilities: [
            { name: 'Threshold Sense', effect: 'When deliberately focused, senses whether a nearby boundary has been crossed recently.' },
            { name: 'Focused Burst', effect: 'Can force one short, deliberate surge of effort through body, mind, or presence.' },
        ],
        inventory: ['travel cloak', 'bedroll', 'flint kit', 'waterskin', 'small knife'],
        notes: ['Private perception remains private unless another entity explicitly shares that sense.'],
    }, fixed);
}

async function applyCharacterCreatorToPersona() {
    if (!characterCreatorState?.sheet) return;
    const sheet = String($('#rp_engine_character_sheet').val() || characterCreatorState.sheet || '').trim();
    if (!sheet) return;
    const name = parsePersonaName(sheet) || name1 || 'User';
    setUserName(name, { toastPersonaNameChange: false });

    power_user.persona_description = sheet;
    power_user.persona_description_position = persona_description_positions.IN_PROMPT;
    if (user_avatar) {
        if (!power_user.personas[user_avatar]) {
            initPersona(user_avatar, name, sheet, '');
        } else {
            power_user.personas[user_avatar] = name;
            power_user.persona_descriptions[user_avatar] = {
                ...(power_user.persona_descriptions[user_avatar] || {}),
                description: sheet,
                position: power_user.persona_descriptions[user_avatar]?.position ?? persona_description_positions.IN_PROMPT,
                depth: power_user.persona_descriptions[user_avatar]?.depth ?? 2,
                role: power_user.persona_descriptions[user_avatar]?.role ?? 0,
                lorebook: power_user.persona_descriptions[user_avatar]?.lorebook ?? '',
                title: power_user.persona_descriptions[user_avatar]?.title ?? '',
            };
        }
    }
    $('#persona_description').val(sheet);
    setPersonaDescription();
    await getUserAvatars(true, user_avatar);

    const current = tracker();
    current.characterCreator.completed = true;
    current.characterCreator.lastSheet = sheet;
    current.user.name = name;
    const stats = parseCoreStats(sheet);
    if (stats) current.user.stats = stats;
    chat_metadata[METADATA_KEY] = current;
    saveTracker();
    saveSettingsDebounced();
    renderPanel();
    closeCharacterCreatorDialog();
    toastr.success('Character sheet applied to Persona.', 'RP Engine');
}

function renderSettingsDialog() {
    const cfg = settings();
    const body = $('#rp_engine_settings_modal .rp-engine-settings-body');
    body.html(`
        <div class="rp-engine-settings-row">
            <label><input id="rp_engine_setting_enabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}> Enable engine</label>
            <label><input id="rp_engine_setting_inject" type="checkbox" ${cfg.injectHandoff ? 'checked' : ''}> Inject final payload</label>
            <label><input id="rp_engine_setting_show_panel" type="checkbox" ${cfg.showPanel ? 'checked' : ''}> Show tracker panel</label>
        </div>
        <div class="rp-engine-muted">This extension now injects mechanics only. Use your SillyTavern prompt or preset for prose style, POV, tense, and writing constraints.</div>
        <div class="rp-engine-settings-row">
            <label><input id="rp_engine_setting_time_enabled" type="checkbox" ${cfg.enableTimeTracking ? 'checked' : ''}> Enable world time tracking</label>
            <label>1 real minute =
                <input id="rp_engine_setting_time_scale" type="number" min="0.1" max="120" step="0.1" value="${Number(cfg.timeScaleWorldMinutesPerRealMinute) || DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute}">
                world minutes
            </label>
            <label>Max idle counted
                <input id="rp_engine_setting_time_cap" type="number" min="1" max="1440" step="1" value="${Number(cfg.timeTrackingMaxRealMinutes) || DEFAULT_SETTINGS.timeTrackingMaxRealMinutes}">
                real minutes
            </label>
        </div>
        <div class="rp-engine-muted">World time advances on generation, not continuously while idle. Explicit time skips or explicit scene times override the automatic tick.</div>
        <div class="rp-engine-settings-row">
            <label><input id="rp_engine_setting_creator_enabled" type="checkbox" ${cfg.enableCharacterCreator ? 'checked' : ''}> Enable character creator</label>
            <label><input id="rp_engine_setting_creator_offer" type="checkbox" ${cfg.autoOfferCharacterCreator ? 'checked' : ''}> Offer on empty new chats</label>
            <button id="rp_engine_setting_creator_open" type="button">Open Character Creator</button>
        </div>
        <div class="rp-engine-muted">Character creation rolls real d10s in the extension. The model only drafts race, appearance, traits, abilities, inventory, and notes; all risky ability use is still resolved by the core engine.</div>
        <div class="rp-engine-settings-row">
            <label><input id="rp_engine_setting_archive_enabled" type="checkbox" ${cfg.enableNpcArchive ? 'checked' : ''}> Enable NPC Lorebook archive</label>
            <label><input id="rp_engine_setting_archive_auto" type="checkbox" ${cfg.autoCreateNpcArchive ? 'checked' : ''}> Auto-create archive book</label>
            <label><input id="rp_engine_setting_archive_prune" type="checkbox" ${cfg.pruneArchivedAbsentNpcs ? 'checked' : ''}> Hide archived absent NPCs</label>
            <label><input id="rp_engine_setting_archive_rehydrate" type="checkbox" ${cfg.rehydrateArchivedNpcs ? 'checked' : ''}> Restore archived NPCs on mention</label>
            <label><input id="rp_engine_setting_archive_dead" type="checkbox" ${cfg.autoRetireDeadNpcs ? 'checked' : ''}> Auto-mark dead NPCs</label>
        </div>
        <div class="rp-engine-settings-row">
            <label>NPC Archive Lorebook
                <select id="rp_engine_setting_archive_world">${renderWorldOptions(cfg.npcArchiveWorld)}</select>
            </label>
            <button id="rp_engine_setting_archive_refresh" type="button">Refresh Books</button>
            <button id="rp_engine_setting_archive_create" type="button">Create Default Book</button>
            <button id="rp_engine_setting_archive_prune_forgotten" type="button">Prune Forgotten NPCs</button>
        </div>
        <div class="rp-engine-settings-footer">
            <button id="rp_engine_settings_save" type="button">Save</button>
            <button id="rp_engine_settings_cancel" type="button">Cancel</button>
        </div>
    `);

    body.find('#rp_engine_setting_archive_refresh').on('click', async () => {
        await updateWorldInfoList();
        body.find('#rp_engine_setting_archive_world').html(renderWorldOptions(settings().npcArchiveWorld));
    });
    body.find('#rp_engine_setting_archive_create').on('click', async () => {
        const worldName = await ensureNpcArchiveWorld({ createIfMissing: true });
        body.find('#rp_engine_setting_archive_world').html(renderWorldOptions(worldName || settings().npcArchiveWorld));
        if (worldName) body.find('#rp_engine_setting_archive_world').val(worldName);
    });
    body.find('#rp_engine_setting_archive_prune_forgotten').on('click', pruneForgottenNpcs);
    body.find('#rp_engine_setting_creator_open').on('click', () => openCharacterCreatorDialog({ manual: true }));
    body.find('#rp_engine_settings_cancel').on('click', closeSettingsDialog);
    body.find('#rp_engine_settings_save').on('click', () => {
        cfg.enabled = body.find('#rp_engine_setting_enabled').prop('checked');
        cfg.injectHandoff = body.find('#rp_engine_setting_inject').prop('checked');
        cfg.showPanel = body.find('#rp_engine_setting_show_panel').prop('checked');
        cfg.enableNpcArchive = body.find('#rp_engine_setting_archive_enabled').prop('checked');
        cfg.autoCreateNpcArchive = body.find('#rp_engine_setting_archive_auto').prop('checked');
        cfg.pruneArchivedAbsentNpcs = body.find('#rp_engine_setting_archive_prune').prop('checked');
        cfg.rehydrateArchivedNpcs = body.find('#rp_engine_setting_archive_rehydrate').prop('checked');
        cfg.autoRetireDeadNpcs = body.find('#rp_engine_setting_archive_dead').prop('checked');
        cfg.npcArchiveWorld = String(body.find('#rp_engine_setting_archive_world').val() || '');
        cfg.enableCharacterCreator = body.find('#rp_engine_setting_creator_enabled').prop('checked');
        cfg.autoOfferCharacterCreator = body.find('#rp_engine_setting_creator_offer').prop('checked');
        cfg.enableTimeTracking = body.find('#rp_engine_setting_time_enabled').prop('checked');
        cfg.timeScaleWorldMinutesPerRealMinute = Math.max(0.1, Number(body.find('#rp_engine_setting_time_scale').val()) || DEFAULT_SETTINGS.timeScaleWorldMinutesPerRealMinute);
        cfg.timeTrackingMaxRealMinutes = Math.max(1, Number(body.find('#rp_engine_setting_time_cap').val()) || DEFAULT_SETTINGS.timeTrackingMaxRealMinutes);
        saveSettingsDebounced();
        syncExtensionSettingsBlock();
        renderPanel();
        closeSettingsDialog();
        toastr.success('Settings saved.', 'RP Engine');
    });
}

function setupPanelDrag() {
    const root = $('#rp_engine_tracker_panel');
    const header = root.find('.rp-engine-header');

    header.off(`pointerdown.${EXT_ID}`).on(`pointerdown.${EXT_ID}`, (event) => {
        if ($(event.target).closest('button').length && !root.hasClass('rp-engine-collapsed')) return;
        const el = root[0];
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        panelDragMoved = false;

        root.addClass('rp-engine-dragging');
        event.preventDefault();

        $(document)
            .off(`pointermove.${EXT_ID} pointerup.${EXT_ID} pointercancel.${EXT_ID}`)
            .on(`pointermove.${EXT_ID}`, (moveEvent) => {
                if (Math.abs(moveEvent.clientX - event.clientX) > 3 || Math.abs(moveEvent.clientY - event.clientY) > 3) {
                    panelDragMoved = true;
                }
                const pos = constrainPanelPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY, el);
                root.css({ left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto' });
                settings().panelPosition = pos;
            })
            .on(`pointerup.${EXT_ID} pointercancel.${EXT_ID}`, () => {
                root.removeClass('rp-engine-dragging');
                saveSettingsDebounced();
                $(document).off(`pointermove.${EXT_ID} pointerup.${EXT_ID} pointercancel.${EXT_ID}`);
            });
    });
}

function applyPanelPosition() {
    const cfg = settings();
    const root = $('#rp_engine_tracker_panel');
    const el = root[0];
    if (!el) return;

    if (!isFinitePosition(cfg.panelPosition)) {
        root.css({ left: '', top: '', right: '' });
        return;
    }

    const pos = constrainPanelPosition(cfg.panelPosition.left, cfg.panelPosition.top, el);
    root.css({ left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto' });
    cfg.panelPosition = pos;
}

function constrainPanelPosition(left, top, el) {
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    return {
        left: Math.round(Math.min(Math.max(Number(left) || margin, margin), maxLeft)),
        top: Math.round(Math.min(Math.max(Number(top) || margin, margin), maxTop)),
    };
}

function isFinitePosition(value) {
    return !!value
        && typeof value === 'object'
        && Number.isFinite(Number(value.left))
        && Number.isFinite(Number(value.top));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[char]));
}

function escapeRegExpLocal(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNameLocal(value) {
    return String(value || '').trim().toLowerCase();
}

function uniqueLocal(list) {
    return [...new Map((Array.isArray(list) ? list : [])
        .map(x => String(x || '').trim())
        .filter(Boolean)
        .map(x => [normalizeNameLocal(x), x])).values()];
}

function cleanSceneNpcName(value) {
    const text = String(value || '')
        .trim()
        .replace(/[.,!?;:]+$/g, '')
        .replace(/\s+/g, ' ');
    if (!text || /^(?:I|Me|My|You|Your|The|A|An|As|Just|Halt|State|Gate|Door|Room|Road|Path|Street|Forest|Town|City)$/i.test(text)) {
        return '';
    }
    return text;
}

function preferKnownValue(primary, fallback, emptyValue = 'unknown') {
    const primaryText = String(primary || '').trim();
    if (primaryText && !/^(unknown|none|null|n\/a)$/i.test(primaryText)) return primaryText;
    const fallbackText = String(fallback || '').trim();
    if (fallbackText && !/^(unknown|none|null|n\/a)$/i.test(fallbackText)) return fallbackText;
    return emptyValue;
}

function shouldSkipMechanicsForGenerationType(type) {
    const normalized = String(type || 'normal').toLowerCase();
    return quietGenerationDepth > 0
        || normalized === 'quiet'
        || normalized === 'impersonate'
        || normalized === 'continue';
}

function clearMechanicsHandoff() {
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}

function setMechanicsHandoff(handoff) {
    setExtensionPrompt(PROMPT_KEY, handoff || '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}

async function rpEngineTrackerInterceptor(chat, contextSize, abort, type) {
    const cfg = settings();
    applyEngineContextPrompt();

    if (!cfg.enabled) {
        clearMechanicsHandoff();
        clearEngineContextPrompt();
        return;
    }

    if (shouldSkipMechanicsForGenerationType(type)) {
        return;
    }

    if (preparedMechanicsFailure) {
        const failure = preparedMechanicsFailure;
        preparedMechanicsFailure = null;
        if (typeof abort === 'function') abort(true);
        console.error('[RP Engine Tracker] Aborted final generation after failed prepared mechanics pass.', failure);
        return;
    }

    if (preparedMechanicsTurn) {
        const prepared = preparedMechanicsTurn;
        preparedMechanicsTurn = null;
        const currentLatest = latestUserMessageFromAvailableChats(chat);
        if (!currentLatest || currentLatest === prepared.latestUserMessage) {
            setMechanicsHandoff(prepared.handoff);
            chat_metadata[METADATA_KEY] = prepared.result.tracker;
            lastMechanicsHandoff = {
                handoff: prepared.handoff,
                trackerSnapshot: prepared.trackerSnapshot,
                display: prepared.display,
            };
            bindMechanicsDisplayToTrigger(prepared.display);
            pendingAuditDisplayAfterGeneration = structuredClone(prepared.display);
            saveTracker();
            pendingPanelRefreshAfterGeneration = true;
            console.debug('[RP Engine Tracker] Reused prepared Stepped-Thinking-style mechanics pass.');
            return;
        }
        console.warn('[RP Engine Tracker] Discarded prepared mechanics: latest user message changed before interceptor.', {
            prepared: prepared.latestUserMessage,
            currentLatest,
        });
    }

    if (isSameTurnRegeneration(type, chat)) {
        preserveSameTurnHandoffForRegeneration();
        console.debug('[RP Engine Tracker] Preserved mechanics handoff for same-turn regeneration.');
        return;
    }

    const latestUserMessage = latestUserMessageFromAvailableChats(chat);
    if (!latestUserMessage) {
        clearMechanicsHandoff();
        console.debug('[RP Engine Tracker] Skipped mechanics: no latest user message found.');
        return;
    }

    if (['regenerate', 'swipe'].includes(String(type || '').toLowerCase())) {
        const cached = cachedMechanicsForLatestUserMessage(chat, latestUserMessage);
        if (cached) {
            const handoff = cfg.injectHandoff
                ? buildFinalNarrationPayload({
                    packet: cached.packet,
                    npcHandoffs: cached.npcHandoffs,
                    chaosHandoff: cached.chaosHandoff,
                    proactivityHandoff: cached.proactivityHandoff,
                    aggressionResults: cached.aggressionResults,
                })
                : '';
            setMechanicsHandoff(handoff);
            chat_metadata[METADATA_KEY] = cached.tracker;
            lastMechanicsHandoff = {
                handoff,
                trackerSnapshot: trackerSnapshotForRollback(cached.tracker),
                display: buildMechanicsDisplayPayload(cached, handoff, latestUserMessage, chat),
            };
            bindMechanicsDisplayToTrigger(lastMechanicsHandoff.display);
            pendingAuditDisplayAfterGeneration = structuredClone(lastMechanicsHandoff.display);
            saveTracker();
            pendingPanelRefreshAfterGeneration = true;
            console.debug('[RP Engine Tracker] Reused bound mechanics artifact for regeneration/swipe.');
            return;
        }
    }

    if (resolving) {
        console.warn('[RP Engine Tracker] Skipped mechanics: resolver is already running.');
        return;
    }

    clearMechanicsHandoff();
    const preTurnSnapshot = trackerSnapshotForRollback(tracker());
    resolving = true;
    try {
        console.debug('[RP Engine Tracker] Interceptor start', {
            type,
            contextSize,
            latestUserMessage,
            userStats: tracker().user?.stats,
            userName: tracker().user?.name,
        });

        const result = await runResolver(chat);
        attachTurnRollback(result, latestUserMessage, preTurnSnapshot);
        chat_metadata[METADATA_KEY] = result.tracker;

        const handoff = cfg.injectHandoff
            ? buildFinalNarrationPayload({
                packet: result.packet,
                npcHandoffs: result.npcHandoffs,
                chaosHandoff: result.chaosHandoff,
                proactivityHandoff: result.proactivityHandoff,
                aggressionResults: result.aggressionResults,
            })
            : '';

        setMechanicsHandoff(handoff);
        lastMechanicsHandoff = {
            handoff,
            trackerSnapshot: trackerSnapshotForRollback(result.tracker),
            display: buildMechanicsDisplayPayload(result, handoff, latestUserMessage, chat),
        };
        bindMechanicsDisplayToTrigger(lastMechanicsHandoff.display);
        pendingAuditDisplayAfterGeneration = structuredClone(lastMechanicsHandoff.display);

        saveTracker();
        pendingPanelRefreshAfterGeneration = true;
        queueNpcArchiveSync(result);
        console.debug('[RP Engine Tracker] Interceptor complete', {
            injected: Boolean(handoff),
            goal: result.packet?.GOAL,
            outcome: result.packet?.Outcome,
            stakes: result.packet?.STAKES,
            userStats: result.tracker?.user?.stats,
        });
    } catch (error) {
        const current = tracker();
        const details = error?.details || {};
        const schemaFailure = Boolean(error?.rpEngineSchemaFailure);
        const auditExtraction = schemaFailure ? {
            resolverMode: 'schema_failed',
            mechanicsPassMode: 'SCHEMA_FAILED',
            modelSchema: details.modelSchema && typeof details.modelSchema === 'object' ? structuredClone(details.modelSchema) : null,
            originalModelSchema: details.originalModelSchema && typeof details.originalModelSchema === 'object' ? structuredClone(details.originalModelSchema) : null,
            schemaRepaired: details.repairResponse ? 'Y' : 'N',
            schemaValidationIssues: Array.isArray(details.validationIssues) ? [...details.validationIssues] : [],
            schemaRawResponse: String(details.rawResponse || '').slice(0, 6000),
            schemaRepairResponse: String(details.repairResponse || '').slice(0, 6000),
            expandedExtraction: details.expandedExtraction && typeof details.expandedExtraction === 'object' ? structuredClone(details.expandedExtraction) : null,
            latestUserMessage,
        } : null;
        current.lastAudit = {
            at: new Date().toISOString(),
            error: error?.message || String(error),
            latestUserMessage,
            schemaFailure,
            extraction: auditExtraction,
        };
        chat_metadata[METADATA_KEY] = current;
        pendingAuditDisplayAfterGeneration = {
            version: 1,
            at: current.lastAudit.at,
            triggerUserMessage: latestUserMessage,
            triggerUserMessageId: findLatestUserMessageIdByText(latestUserMessage, chat),
            resolverSchema: cloneAuditForDisplay(current.lastAudit),
            narrationHandoff: '',
            mechanicsArtifact: null,
        };
        saveTracker();
        pendingPanelRefreshAfterGeneration = true;
        clearMechanicsHandoff();
        if (schemaFailure && typeof abort === 'function') {
            abort(true);
        }
        console.error('[RP Engine Tracker] Mechanics interceptor failed.', error);
    } finally {
        resolving = false;
    }
}

globalThis.rpEngineTrackerInterceptor = rpEngineTrackerInterceptor;

jQuery(() => {
    const cfg = settings();
    tracker();
    if (cfg.enabled) {
        applyEngineContextPrompt();
    } else {
        clearEngineContextPrompt();
        clearMechanicsHandoff();
    }
    updateVisibleTrackerSnapshot();
    setupUi();
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, prepareMechanicsAtAfterCommands);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        tracker();
        updateVisibleTrackerSnapshot();
        renderPanel();
        renderMechanicsBlocks();
        maybeOfferCharacterCreator();
    });
    eventSource.on(event_types.MESSAGE_UPDATED, (messageId) => {
        if (!pendingPanelRefreshAfterGeneration) updateVisibleTrackerSnapshot();
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        if (!pendingPanelRefreshAfterGeneration) updateVisibleTrackerSnapshot();
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        if (pendingPanelRefreshAfterGeneration) {
            pendingPanelRefreshAfterGeneration = false;
            revealPendingAuditDisplay();
            updateVisibleTrackerSnapshot();
            renderPanel();
        }
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        rollbackLastTurnIfTriggerDeleted();
        updateVisibleTrackerSnapshot();
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.CHAT_DELETED, deleteNpcArchiveEntriesForChat);
    eventSource.on(event_types.GROUP_CHAT_DELETED, deleteNpcArchiveEntriesForChat);
});







