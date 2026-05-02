import {
    amount_gen,
    chat as liveChat,
    chat_metadata,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    Generate,
    main_api,
    name1,
    name2,
    saveChatDebounced,
    saveSettingsDebounced,
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
    inferFallbackExtraction,
    mergeExtractionWithFallback,
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
} from './engine.js?v=0.1.207';

const EXT_ID = 'rpEngineTracker';
const EXT_VERSION = '0.1.207';
const MECHANICS_ARTIFACT_VERSION = 5;
const PROMPT_KEY = 'RP_ENGINE_TRACKER_HANDOFF';
const GROUNDING_PROMPT_KEY = 'RP_ENGINE_TRACKER_GROUNDED_WRITING_EARLY';
const MESSAGE_MECHANICS_KEY = 'rp_engine_mechanics';
const DEFAULT_ARCHIVE_WORLD = 'RP Engine NPC Archive';
const ARCHIVE_COMMENT_PREFIX = '[RPE NPC]';
const MECHANICS_PASS_SCHEMA = Object.freeze({
    name: 'rp_engine_mechanics_pass_v3_clear',
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            mode: { type: 'string', enum: ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'] },
            identifyGoal: { type: 'string', maxLength: 140 },
            goalKind: { type: 'string', enum: ['Normal', 'IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'] },
            decisiveAction: { type: 'string', maxLength: 140 },
            why: { type: 'string', maxLength: 180 },
            outcomeOnSuccess: { type: 'string', maxLength: 160 },
            outcomeOnFailure: { type: 'string', maxLength: 160 },
            ActionTargets: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
            OppTargetsNPC: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
            OppTargetsENV: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 80 } },
            BenefitedObservers: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
            HarmedObservers: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 60 } },
            NPCInScene: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 60 } },
            actionCount: { type: 'integer', minimum: 1, maximum: 3 },
            USER: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
            OPP: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
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
            'goalKind',
            'decisiveAction',
            'ActionTargets',
            'OppTargetsNPC',
            'OppTargetsENV',
            'BenefitedObservers',
            'HarmedObservers',
            'NPCInScene',
            'actionCount',
            'USER',
            'OPP',
            'hostilePhysicalHarm',
            'newEncounterExplicit'
        ],
    },
});
const CHARACTER_CREATOR_SCHEMA = {
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
};

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

function clearLegacyWritingPrompt() {
    setExtensionPrompt(
        GROUNDING_PROMPT_KEY,
        '',
        extension_prompt_types.BEFORE_PROMPT,
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
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidates = [
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

function isUsefulMechanicsPass(value) {
    if (!value || typeof value !== 'object') return false;
    const mode = expandMechanicsMode(value.m || value.mode);
    if (!['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'].includes(mode)) return false;
    const goal = String(value.identifyGoal || value.g || value.goal || '').trim();
    const decisiveAction = String(value.a || value.decisiveAction || '').trim();
    if (!goal || /^(unspecified|unknown|none|null|n\/a)/i.test(goal)) return false;
    if (!decisiveAction || /^(unspecified|unknown|none|null|n\/a)/i.test(decisiveAction)) return false;
    return true;
}

function expandMechanicsMode(value) {
    const mode = String(value || '').trim();
    if (mode === 'N') return 'NO_STAKES';
    if (mode === 'S') return 'STAKES';
    if (mode === 'U') return 'SYSTEM_UPDATE';
    if (mode === 'O') return 'OOC_STOP';
    return ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'].includes(mode) ? mode : 'NO_STAKES';
}

function shouldUseDeterministicFallback(latestUserMessage, fallback = {}) {
    const text = String(latestUserMessage || '').trim();
    if (!text) return false;
    if (fallback?.resolverBypass) return true;
    if (fallback?.goalKind && fallback.goalKind !== 'Normal') return false;
    if (fallback?.hostilePhysicalHarm === 'Y') return false;
    if (Array.isArray(fallback?.oppTargetsNpc) && fallback.oppTargetsNpc.length) return false;
    if (Array.isArray(fallback?.oppTargetsEnv) && fallback.oppTargetsEnv.length) return false;
    if (fallback?.hasStakes === 'Y') return false;

    if (/^\s*\(\((?!\()[\s\S]*?(?<!\))\)\)\s*$/.test(text)) return true;
    if (/^\s*\(\(\(/.test(text)) return false;

    const highRisk = /\b(attack|strike|hit|punch|kick|slap|stab|slash|cut|shoot|kill|wound|injure|hurt|slam|knee|swing|swipe|thrust|grapple|tackle|restrain|pin|drag|yank|shove|force|break|smash|jump|leap|climb|swim|dodge|chase|sneak|stealth|hide|pickpocket|steal|snatch|palm|deceive|lie|bluff|trick|distract|misdirect|threaten|intimidate|coerce|blackmail|demand|order|persuade|convince|negotiate|bargain|plead|let me pass|allow me|permission|restricted|kiss|touch|grope|fondle|caress|undress|strip|seduce|spell|magic|cast|channel|curse|hex|charm|glamou?r|compel|dominate|ward|dispel|counterspell|summon|teleport|trap|lock|locked|chasm|ravine|pit|hazard|poison|fire|combat)\b/i;
    if (highRisk.test(text)) return false;

    const simpleIntent = /\b(say|tell|ask|answer|reply|greet|wave|smile|nod|bow|thank|apologize|compliment|praise|chat|talk|sit|stand|wait|rest|sleep|travel|walk|look|listen|watch|observe|inspect casually|hand|give|offer|return|accept|decline|take a seat|leave|enter)\b/i;
    const systemIntent = /\b(no longer present|enters?|arrives?|leaves?|exits?|dead|forgotten|retired|inactive|wait(?:ing)?|sleep|rest|travel|later|after \d+|time skip|timeskip|minutes?|hours?|days?|accept(?:ed)? (?:the )?(?:task|quest|job)|complete(?:d)? (?:the )?(?:task|quest|job)|cancel(?:ed|led)? (?:the )?(?:task|quest|job))\b/i;

    return fallback?.hasStakes === 'N' && (simpleIntent.test(text) || systemIntent.test(text));
}

const MECHANICS_PASS_STATIC_PROMPT = Object.freeze([
    'You are the single hidden Mechanics Pass for a SillyTavern roleplay mechanics extension. Return JSON only.',
    '',
    'PURPOSE:',
    '- Use semantic/contextual language understanding to classify the latest user action once.',
    '- Return mode=NO_STAKES when no dice roll is needed, but still provide the short packet needed by Relationship, Chaos, Proactivity, tracker updates, and narration handoff.',
    '- Return mode=STAKES when success/failure has meaningful stakes or an explicit intimacy gate, combat, opposition, risk, obstacle, or contested action matters.',
    '- Return mode=SYSTEM_UPDATE for pure tracker/continuity updates with no live contested action.',
    '- Return mode=OOC_STOP only for double-parentheses OOC.',
    '- The JavaScript engine will roll dice and enforce mechanical guardrails after you return JSON; your job is to identify correct explicit facts and semantic categories.',
    '- Do not copy literal phrasing when it hides the real action. Normalize to the actual attempted action.',
    '- FIRST-YES-WINS. For ordered rule ladders, the first explicit matching rule is final. Do not reconsider later.',
    '- EXPLICIT-ONLY. Never invent targets, stakes, stats, NPC facts, scene facts, motives, outcomes, or relationship changes.',
    '- Uncertain = conservative defaults. If a roll might be needed, use mode=STAKES. If no explicit target/fact exists, leave lists empty.',
    '',
    'RESOLUTION ORDER:',
    '1. Check OOC.',
    '2. Identify final goal and intimacy category.',
    '3. Identify the decisive action or combat attack sequence.',
    '4. Identify living and environmental targets/opposition.',
    '5. Decide whether meaningful stakes exist.',
    '6. Count combat actions only when the input is a hostile attack sequence.',
    '7. Map stats from decisive action and opposition mode.',
    '8. Extract only explicit NPC, inventory, task, scene, and time facts needed for tracker updates.',
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
    '- BenefitedObservers/HarmedObservers: living observers whose material stakes improve/worsen; never use for mere mood or pleasant tone.',
    '- NPCInScene: NPCs directly interacted with plus benefited/harmed observers. Include newly introduced scene NPCs only when explicitly present or directly interacted with.',
    '- If multiple same-role unnamed NPCs are present, use the exact tracker label, alias, or descriptor that identifies the intended one: Goblin 1, Goblin 2, Guard 1, the wounded goblin, the younger guard.',
    '- If "the goblin", "the guard", or a similar role phrase is ambiguous among multiple present NPCs and context does not identify one, do not invent certainty. Use the explicit group phrase only if the user acts on the group; otherwise keep target lists conservative and state ambiguity in why.',
    '- If currentInteractionTarget is present in tracker context and the latest user message uses a pronoun, reply/answer, payment, offer, gesture, or quoted speech that clearly continues the previous exchange, use currentInteractionTarget as the NPC target even if the role/name is not repeated.',
    '- actionCount: 1 for noncombat; 1-3 only for explicit hostile/combat attack sequences.',
    '- Do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as combat actions.',
    '- USER/OPP: for NO_STAKES use MND/ENV defaults unless explicit semantics are clear. For STAKES, map from decisiveAction using PHY/MND/CHA definitions.',
    '- hostilePhysicalHarm=Y only for explicit hostile physical action meant to hurt or injure.',
    '- npcFacts: only exact explicit facts. For a new visible ordinary NPC, use explicitPreset=neutralDefault only if no better explicit preset exists; rank/mainStat unknown unless explicit.',
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
    '- Mark BenefitedObservers only when the user materially improves an NPC stakes: safety, resources, status, autonomy, or explicit goal progress.',
    '- Mark HarmedObservers only when the user materially worsens an NPC stakes: safety, resources, status, autonomy, trust, property, or explicit goal progress.',
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
    '- Use clear engine field names, but keep values short. Do not write paragraphs.',
    '- mode: NO_STAKES/STAKES/SYSTEM_UPDATE/OOC_STOP.',
    '- identifyGoal: final goal. goalKind: Normal/IntimacyAdvancePhysical/IntimacyAdvanceVerbal. decisiveAction: decisive action. why: short evidence/why, optional.',
    '- ActionTargets, OppTargetsNPC, OppTargetsENV, BenefitedObservers, HarmedObservers, NPCInScene are short name lists.',
    '- actionCount, USER, OPP, hostilePhysicalHarm, newEncounterExplicit are compact enum/number answers.',
    '- outcomeOnSuccess/outcomeOnFailure are optional short consequence meanings. scene/npcFacts/inventoryDeltas/taskDeltas are optional and only for explicit updates.',
    '',
    'ENGINE FIELD MAP:',
    '- identifyGoal -> identifyGoal.',
    '- identifyTargets.ActionTargets -> ActionTargets.',
    '- identifyTargets.OppTargets.NPC -> OppTargetsNPC.',
    '- identifyTargets.OppTargets.ENV -> OppTargetsENV.',
    '- identifyTargets.BenefitedObservers -> BenefitedObservers.',
    '- identifyTargets.HarmedObservers -> HarmedObservers.',
    '- NPCInScene -> NPCInScene.',
    '- mapStats.USER -> USER; mapStats.OPP -> OPP.',
    '- hostile/combat intent to hurt or injure -> hostilePhysicalHarm.',
    '- newEncounterExplicit -> newEncounterExplicit.',
    '- Output compact JSON only. Prefer short names, enums, empty arrays, and omitted optional objects over prose.',
]).join('\n');

function buildMechanicsPassPrompt({ chatExcerpt, latestUserMessage, tracker, userName, characterName }) {
    const resolverContext = buildResolverContext(tracker, latestUserMessage, chatExcerpt);
    return [
        MECHANICS_PASS_STATIC_PROMPT,
        '',
        `USER NAME: ${userName || '{{user}}'}`,
        `CHARACTER/ASSISTANT NAME: ${characterName || '{{char}}'}`,
        '',
        'CURRENT TRACKER CONTEXT JSON:',
        JSON.stringify(resolverContext),
        '',
        'CONTEXT NOTE:',
        '- The tracker context is a compact relevant slice for speed. Use it as current explicit state.',
        '- If a fact is absent from this compact context, treat it as unknown/no new evidence. Absence is never permission to invent facts, targets, stats, motives, outcomes, or relationship state.',
        '',
        'LATEST USER MESSAGE TO RESOLVE:',
        latestUserMessage || '(none)',
        '',
        'RECENT CHAT EXCERPT:',
        chatExcerpt,
        '',
        'Return only compact valid JSON matching the schema. No markdown, no explanation.',
    ].join('\n');
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
    try {
        response = await generateQuietPromptWithTimeout({
            quietPrompt: prompt,
            skipWIAN: false,
            responseLength: mechanicsPassResponseLength(),
            jsonSchema: MECHANICS_PASS_SCHEMA,
            removeReasoning: true,
        }, Math.min(Number(settings().resolverTimeoutMs) || DEFAULT_SETTINGS.resolverTimeoutMs, 45000));
        const pass = parseJsonResponse(response);
        if (!isUsefulMechanicsPass(pass)) return null;
        const mode = expandMechanicsMode(pass.m || pass.mode);
        return {
            mode,
            pass,
            response,
            extraction: expandMechanicsPass(pass, latestUserMessage),
        };
    } catch (error) {
        console.warn('[RP Engine Tracker] Mechanics pass failed or timed out; falling back to deterministic extraction.', error);
        return null;
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
        presentNpcNames: (current.presentNpcIds || [])
            .map(id => current.npcs?.[id]?.name)
            .filter(Boolean),
        currentInteractionTarget: current.currentInteractionTarget || '',
        relevantNpcs,
        inventory: relevantListForResolver(current.inventory, text, 16),
        pendingTasks: relevantTasksForResolver(current.pendingTasks, text, 8),
        recentAudit: compactAuditForResolver(current.lastAudit),
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
    const hasStakes = mode === 'STAKES' ? 'Y' : 'N';
    const reason = compactString(pass?.why ?? pass?.e ?? pass?.reason, 300);
    const goal = compactString(pass?.identifyGoal ?? pass?.g ?? pass?.goal, 140);
    const decisiveAction = compactString(pass?.a ?? pass?.decisiveAction, 140);
    const oocInstruction = isOocStop ? extractDoubleParenInner(text) || reason : '';
    return {
        ooc: isOocStop ? 'Y' : 'N',
        oocMode: isOocStop ? 'STOP' : 'IC',
        oocInstruction,
        goal: goal || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        goalKind: ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(pass?.k || pass?.goalKind) ? (pass.k || pass.goalKind) : 'Normal',
        goalEvidence: reason || compactString(pass?.goalEvidence, 300) || text,
        decisiveAction: decisiveAction || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        decisiveActionEvidence: reason || compactString(pass?.decisiveActionEvidence, 300) || text,
        outcomeOnSuccess: compactString(pass?.win ?? pass?.outcomeOnSuccess, 160),
        outcomeOnFailure: compactString(pass?.fail ?? pass?.outcomeOnFailure, 160),
        actionTargets: arrayFromCompact(pass?.ActionTargets ?? pass?.at ?? pass?.actionTargets),
        oppTargetsNpc: hasStakes === 'Y' ? arrayFromCompact(pass?.OppTargetsNPC ?? pass?.on ?? pass?.oppTargetsNpc) : [],
        oppTargetsEnv: hasStakes === 'Y' ? arrayFromCompact(pass?.OppTargetsENV ?? pass?.oe ?? pass?.oppTargetsEnv) : [],
        benefitedObservers: arrayFromCompact(pass?.BenefitedObservers ?? pass?.bo ?? pass?.benefitedObservers),
        harmedObservers: arrayFromCompact(pass?.HarmedObservers ?? pass?.ho ?? pass?.harmedObservers),
        npcInScene: arrayFromCompact(pass?.NPCInScene ?? pass?.ns ?? pass?.npcInScene),
        hasStakes,
        stakesEvidence: compactString(pass?.stakesEvidence ?? reason, 300) || (hasStakes === 'Y'
            ? 'Mechanics pass found explicit meaningful stakes.'
            : 'Mechanics pass classified this as no-roll with no meaningful contested stakes.'),
        actionCount: Math.max(1, Math.min(3, Number(pass?.ac ?? pass?.actionCount) || 1)),
        userStat: ['PHY', 'MND', 'CHA'].includes(pass?.USER || pass?.us || pass?.userStat) ? (pass.USER || pass.us || pass.userStat) : 'MND',
        userStatEvidence: compactString(pass?.userStatEvidence, 160),
        oppStat: ['PHY', 'MND', 'CHA', 'ENV'].includes(pass?.OPP || pass?.os || pass?.oppStat) ? (pass.OPP || pass.os || pass.oppStat) : 'ENV',
        oppStatEvidence: compactString(pass?.oppStatEvidence, 160),
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
        npcFacts: expandCompactNpcFacts(pass?.npcFacts ?? pass?.nf),
        inventoryDeltas: expandCompactInventoryDeltas(pass?.inventoryDeltas ?? pass?.inv),
        taskDeltas: expandCompactTaskDeltas(pass?.taskDeltas ?? pass?.tasks),
        resolverMode: 'mechanics_pass',
        mechanicsPassMode: mode,
        mechanicsPassReason: reason,
    };
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

function currentSpeakerLabel(message) {
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
    current.currentInteractionTarget = inferCurrentInteractionTargetFromChat(sourceChat);
    let fallback = inferFallbackExtraction(latestUserMessage, name2, current);
    fallback = await guardDeadArchiveReentry(fallback, latestUserMessage);
    console.debug('[RP Engine Tracker] Resolver start', { latestUserMessage, hasFallback: Object.keys(fallback).length > 0 });

    if (fallback.resolverBypass) {
        fallback = validateTimeExtractionForLatestUserMessage(fallback, latestUserMessage);
        const resolved = resolveTurn(fallback, current, { userStats });
        applyTimeTracking(resolved.tracker, current, resolved.audit?.extraction);
        resolved.packet.SceneTime = resolved.tracker.scene?.time || '';
        resolved.packet.TimeAdvance = resolved.tracker.worldClock?.lastAdvance || '';
        scrubUnauthorizedTimeAdvance(resolved, latestUserMessage);
        console.debug('[RP Engine Tracker] Resolver bypassed for deterministic fallback', resolved.packet);
        return resolved;
    }

    let parsed = null;
    const useFallbackOnly = shouldUseDeterministicFallback(latestUserMessage, fallback);
    const mechanicsResult = useFallbackOnly
        ? null
        : await runMechanicsPass({
            sourceChat,
            latestUserMessage,
            current,
            userName,
            characterName: name2,
        });
    if (mechanicsResult?.extraction) {
        parsed = mechanicsResult.extraction;
    }

    if (!parsed && Object.keys(fallback).length) {
        console.debug('[RP Engine Tracker] Using deterministic fallback extraction');
        parsed = fallback;
    }

    if (!parsed) {
        console.warn('[RP Engine Tracker] Resolver returned no usable structure; using fail-closed no-roll extraction.');
        parsed = buildFailClosedExtraction(latestUserMessage, mechanicsResult?.response || '');
    }

    parsed = mechanicsResult?.extraction ? mergeMechanicsPassWithFallback(parsed, fallback) : mergeExtractionWithFallback(parsed, fallback);
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
        mechanicsPassMode: mechanicsResult?.mode || (useFallbackOnly ? 'deterministic' : 'fallback'),
    });
    return resolved;
}

function mergeMechanicsPassWithFallback(parsed, fallback) {
    const merged = mergeExtractionWithFallback(parsed, fallback);
    if (!parsed || !fallback || !Object.keys(fallback).length) return merged;

    if (parsed.resolverMode === 'mechanics_pass') {
        merged.resolverMode = parsed.resolverMode;
        merged.mechanicsPassMode = parsed.mechanicsPassMode;
        merged.mechanicsPassReason = parsed.mechanicsPassReason;

        if (parsed.mechanicsPassMode === 'NO_STAKES') {
            merged.hasStakes = 'N';
            merged.oppTargetsNpc = [];
            merged.oppTargetsEnv = [];
            merged.hostilePhysicalHarm = 'N';
            merged.actionCount = 1;
            if (fallback.actionTargets?.length && !parsed.actionTargets?.length) {
                merged.actionTargets = fallback.actionTargets;
            }
            if (fallback.npcInScene?.length && !parsed.npcInScene?.length) {
                merged.npcInScene = fallback.npcInScene;
            }
            if (fallback.npcFacts?.length && !parsed.npcFacts?.length) {
                merged.npcFacts = fallback.npcFacts;
            }
            if (fallback.goal && (!parsed.goal || isRawUserMessageLike(parsed.goal, fallback.goalEvidence || ''))) {
                merged.goal = fallback.goal;
            }
            if (fallback.decisiveAction && (!parsed.decisiveAction || isRawUserMessageLike(parsed.decisiveAction, fallback.decisiveActionEvidence || ''))) {
                merged.decisiveAction = fallback.decisiveAction;
            }
            merged.outcomeOnSuccess = parsed.outcomeOnSuccess || '';
            merged.outcomeOnFailure = parsed.outcomeOnFailure || '';
            merged.userStat = parsed.userStat || 'MND';
            merged.oppStat = parsed.oppStat || 'ENV';
            merged.userStatEvidence = parsed.userStatEvidence || '';
            merged.oppStatEvidence = parsed.oppStatEvidence || '';
        }
    }

    return merged;
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

function buildFailClosedExtraction(latestUserMessage, response = '') {
    const text = String(latestUserMessage || '').trim().slice(0, 300);
    const evidence = String(response || '').trim().slice(0, 300);
    return {
        ooc: 'N',
        oocMode: 'IC',
        oocInstruction: '',
        goal: text || 'unresolved action',
        goalKind: 'Normal',
        goalEvidence: text || evidence,
        decisiveAction: text || 'unresolved action',
        decisiveActionEvidence: text || evidence,
        outcomeOnSuccess: '',
        outcomeOnFailure: '',
        actionTargets: [],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        npcInScene: [],
        hasStakes: 'N',
        stakesEvidence: 'Resolver failed closed; no explicit structured stakes were available.',
        actionCount: 1,
        userStat: 'MND',
        userStatEvidence: '',
        oppStat: 'ENV',
        oppStatEvidence: '',
        hostilePhysicalHarm: 'N',
        newEncounter: 'N',
        timeDeltaMinutes: 0,
        timeSkipReason: '',
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
    setExtensionPrompt(PROMPT_KEY, handoff, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
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
                    <summary>Simplified Schema</summary>
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
            ${renderKv('IntimacyGate', packet.IntimacyConsent || firstNpcGate(npcs) || 'N')}
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
        clearLegacyWritingPrompt();
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
    clearLegacyWritingPrompt();
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
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
}

async function rpEngineTrackerInterceptor(chat, contextSize, abort, type) {
    const cfg = settings();
    clearLegacyWritingPrompt();

    if (!cfg.enabled) {
        clearMechanicsHandoff();
        return;
    }

    if (shouldSkipMechanicsForGenerationType(type)) {
        return;
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
            setExtensionPrompt(PROMPT_KEY, handoff, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
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

        setExtensionPrompt(PROMPT_KEY, handoff, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
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
        current.lastAudit = {
            at: new Date().toISOString(),
            error: error?.message || String(error),
            latestUserMessage,
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
        console.error('[RP Engine Tracker] Mechanics interceptor failed.', error);
    } finally {
        resolving = false;
    }
}

globalThis.rpEngineTrackerInterceptor = rpEngineTrackerInterceptor;

jQuery(() => {
    settings();
    tracker();
    updateVisibleTrackerSnapshot();
    setupUi();
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







