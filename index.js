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
} from './engine.js?v=0.1.187';

const EXT_ID = 'rpEngineTracker';
const PROMPT_KEY = 'RP_ENGINE_TRACKER_HANDOFF';
const GROUNDING_PROMPT_KEY = 'RP_ENGINE_TRACKER_GROUNDED_WRITING_EARLY';
const MESSAGE_MECHANICS_KEY = 'rp_engine_mechanics';
const DEFAULT_ARCHIVE_WORLD = 'RP Engine NPC Archive';
const ARCHIVE_COMMENT_PREFIX = '[RPE NPC]';
const MECHANICS_PASS_SCHEMA = Object.freeze({
    name: 'rp_engine_mechanics_pass_v2',
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            mode: { type: 'string', enum: ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'] },
            reason: { type: 'string' },
            goal: { type: 'string' },
            goalKind: { type: 'string', enum: ['Normal', 'IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'] },
            goalEvidence: { type: 'string' },
            decisiveAction: { type: 'string' },
            decisiveActionEvidence: { type: 'string' },
            outcomeOnSuccess: { type: 'string' },
            outcomeOnFailure: { type: 'string' },
            stakesEvidence: { type: 'string' },
            actionTargets: { type: 'array', items: { type: 'string' } },
            oppTargetsNpc: { type: 'array', items: { type: 'string' } },
            oppTargetsEnv: { type: 'array', items: { type: 'string' } },
            benefitedObservers: { type: 'array', items: { type: 'string' } },
            harmedObservers: { type: 'array', items: { type: 'string' } },
            npcInScene: { type: 'array', items: { type: 'string' } },
            actionCount: { type: 'integer', minimum: 1, maximum: 3 },
            userStat: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
            userStatEvidence: { type: 'string' },
            oppStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
            oppStatEvidence: { type: 'string' },
            hostilePhysicalHarm: { type: 'string', enum: ['Y', 'N'] },
            newEncounter: { type: 'string', enum: ['Y', 'N'] },
            timeDeltaMinutes: { type: 'integer', minimum: -10080, maximum: 10080 },
            timeSkipReason: { type: 'string' },
            scene: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    location: { type: 'string' },
                    time: { type: 'string' },
                    weather: { type: 'string' },
                },
                required: ['location', 'time', 'weather'],
            },
            npcFacts: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: { type: 'string' },
                        present: { type: 'boolean' },
                        position: { type: 'string' },
                        condition: { type: 'string' },
                        knowsUser: { type: 'string' },
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
                    required: ['name', 'position', 'condition', 'knowsUser', 'explicitPreset', 'rank', 'mainStat', 'override'],
                },
            },
            inventoryDeltas: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['gain', 'lose', 'equip', 'unequip', 'use', 'damage'] },
                        item: { type: 'string' },
                        evidence: { type: 'string' },
                    },
                    required: ['action', 'item', 'evidence'],
                },
            },
            taskDeltas: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['add', 'complete', 'cancel'] },
                        task: { type: 'string' },
                        due: { type: 'string' },
                        source: { type: 'string' },
                        evidence: { type: 'string' },
                    },
                    required: ['action', 'task', 'due', 'source', 'evidence'],
                },
            },
        },
        required: [
            'mode',
            'reason',
            'goal',
            'goalKind',
            'goalEvidence',
            'decisiveAction',
            'decisiveActionEvidence',
            'outcomeOnSuccess',
            'outcomeOnFailure',
            'stakesEvidence',
            'actionTargets',
            'oppTargetsNpc',
            'oppTargetsEnv',
            'benefitedObservers',
            'harmedObservers',
            'npcInScene',
            'actionCount',
            'userStat',
            'userStatEvidence',
            'oppStat',
            'oppStatEvidence',
            'hostilePhysicalHarm',
            'newEncounter',
            'timeDeltaMinutes',
            'timeSkipReason',
            'scene',
            'npcFacts',
            'inventoryDeltas',
            'taskDeltas'
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
    if (!['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'].includes(value.mode)) return false;
    const goal = String(value.goal || '').trim();
    const decisiveAction = String(value.decisiveAction || '').trim();
    if (!goal || /^(unspecified|unknown|none|null|n\/a)/i.test(goal)) return false;
    if (!decisiveAction || /^(unspecified|unknown|none|null|n\/a)/i.test(decisiveAction)) return false;
    return true;
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

function buildMechanicsPassPrompt({ chatExcerpt, latestUserMessage, tracker, userName, characterName }) {
    return [
        'You are the single hidden Mechanics Pass for a SillyTavern roleplay mechanics extension. Return JSON only.',
        '',
        'PURPOSE:',
        '- Use semantic/contextual language understanding to classify the latest user action once.',
        '- Return mode=NO_STAKES when no dice roll is needed, but still provide the short packet needed by Relationship, Chaos, Proactivity, tracker updates, and narration handoff.',
        '- Return mode=STAKES when success/failure has meaningful stakes or an explicit intimacy gate, combat, opposition, risk, obstacle, or contested action matters.',
        '- Return mode=SYSTEM_UPDATE for pure tracker/continuity updates with no live contested action.',
        '- Return mode=OOC_STOP only for double-parentheses OOC.',
        '- The JavaScript engine will roll dice and enforce mechanical guardrails after you return JSON; your job is to identify correct explicit facts and semantic categories.',
        '- Do not copy literal phrasing when it hides the real action. Normalize to the actual attempted action while preserving explicit evidence.',
        '- FIRST-YES-WINS. For ordered rule ladders, the first explicit matching rule is final. Do not reconsider later.',
        '- EXPLICIT-ONLY. Never invent targets, stakes, stats, NPC facts, scene facts, motives, outcomes, or relationship changes.',
        '- Uncertain = conservative defaults. If a roll might be needed, use STAKES and fill the full semantic fields. If no explicit target/fact exists, leave lists empty.',
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
        '- No-roll can still be relationship-relevant. Include exact actionTargets and npcInScene for NPCs the user directly addresses or acts toward.',
        '- Include benefitedObservers/harmedObservers only if explicit material stakes improve/worsen. Pleasant tone alone is not a benefit.',
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
        '- goal: short practical intent of the latest user message. If setup plus payoff exist, goal is the practical end state, not necessarily the first verb.',
        '- decisiveAction: the explicit action-attempt whose success/failure determines the result. For NO_STAKES this is usually the same harmless speech/action.',
        '- If the user says something as a tactic, distinguish tactic from goal: a lie may be decisiveAction while theft, escape, entry, or intimacy is the final goal.',
        '- If there is a clear enabling action, decisiveAction is that enabling action even when final goal is different.',
        '- Setup, movement, approach, flourish, drawing a weapon, taking a breath, repositioning, or recovery are not decisive unless they are the actual contested/risky step.',
        '- Combat exception: for hostile attack sequences, decisiveAction summarizes the whole sequence and actionCount counts distinct attempted attacks.',
        '- outcomeOnSuccess/outcomeOnFailure: brief plain results bounded by explicit stakes only.',
        '- goalKind: IntimacyAdvancePhysical or IntimacyAdvanceVerbal only for explicit direct intimacy advances toward a specific NPC; otherwise Normal.',
        '- If the user uses deception, distraction, stealth, pressure, or setup to enable a kiss, touch, embrace, cuddle, grope, or similar physical intimacy toward a specific NPC, goalKind is still IntimacyAdvancePhysical.',
        '- Flirting, compliments, teasing, affectionate tone, romance-coded attention, and non-explicit social behavior do not count as intimacy advances.',
        '- actionTargets: living entities directly targeted by the user action.',
        '- oppTargetsNpc: living entities actively/passively opposing, resisting, refusing, guarding, perceiving, defending, or attacked. Empty for NO_STAKES unless opposition matters, in which case use STAKES.',
        '- oppTargetsEnv: nonliving obstacle/hazard/object/terrain directly obstructing the action. Empty for NO_STAKES unless obstruction matters, in which case use STAKES.',
        '- Never put a living being in oppTargetsEnv. If a guard, witness, owner, victim, pursuer, target, or observer is the thing the action must get past, use oppTargetsNpc.',
        '- benefitedObservers/harmedObservers: living observers whose material stakes improve/worsen; never use for mere mood or pleasant tone.',
        '- npcInScene: NPCs directly interacted with plus benefited/harmed observers.',
        '- actionCount: 1 for noncombat; 1-3 only for explicit hostile/combat attack sequences.',
        '- Do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as combat actions.',
        '- userStat/oppStat: for NO_STAKES use MND/ENV defaults unless explicit semantics are clear. For STAKES, map from decisive action using PHY/MND/CHA definitions.',
        '- hostilePhysicalHarm=Y only for explicit hostile physical action meant to hurt or injure.',
        '- npcFacts: only exact explicit facts. For a new visible ordinary NPC, use explicitPreset neutralDefault only if no better explicit preset exists; rank/mainStat unknown unless explicit.',
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
        '- Mark benefitedObservers only when the user materially improves an NPC stakes: safety, resources, status, autonomy, or explicit goal progress.',
        '- Mark harmedObservers only when the user materially worsens an NPC stakes: safety, resources, status, autonomy, trust, property, or explicit goal progress.',
        '- Do not mark Bond just because of compliments, flirting, affectionate tone, or pleasant conversation; those are no-stakes unless explicit benefit exists.',
        '- Intimidation, coercion, menacing threats, forced submission, terror displays, blackmail, and leverage must be clear in goal/decisiveAction/evidence so Relationship can route Fear.',
        '- Direct attacks, injury attempts, hostile physical contact, theft from an NPC, autonomy violations, or denied intimacy must be clear in targets/evidence so Relationship can route Hostility or FearHostility.',
        '',
        'NPC INITIALIZATION GUIDANCE:',
        '- Use npcFacts only for NPCs present/relevant this turn.',
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
        '- timeDeltaMinutes is only for explicit in-scene time passage or time skips: waiting, sleeping, travel time, after X minutes/hours/days, or similar.',
        '',
        `USER NAME: ${userName || '{{user}}'}`,
        `CHARACTER/ASSISTANT NAME: ${characterName || '{{char}}'}`,
        '',
        'CURRENT TRACKER JSON:',
        JSON.stringify(tracker),
        '',
        'LATEST USER MESSAGE TO RESOLVE:',
        latestUserMessage || '(none)',
        '',
        'RECENT CHAT EXCERPT:',
        chatExcerpt,
        '',
        'Return only valid JSON matching the schema.',
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
        return {
            mode: pass.mode,
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

function expandMechanicsPass(pass, latestUserMessage) {
    const mode = ['NO_STAKES', 'STAKES', 'SYSTEM_UPDATE', 'OOC_STOP'].includes(pass?.mode) ? pass.mode : 'NO_STAKES';
    const text = String(latestUserMessage || '').trim();
    const fallbackGoal = text.slice(0, 140) || 'latest user action';
    const isOocStop = mode === 'OOC_STOP';
    const isSystemUpdate = mode === 'SYSTEM_UPDATE';
    const hasStakes = mode === 'STAKES' ? 'Y' : 'N';
    const oocInstruction = isOocStop ? extractDoubleParenInner(text) || String(pass.reason || '').trim().slice(0, 300) : '';
    return {
        ooc: isOocStop ? 'Y' : 'N',
        oocMode: isOocStop ? 'STOP' : 'IC',
        oocInstruction,
        goal: String(pass.goal || '').trim() || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        goalKind: ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(pass.goalKind) ? pass.goalKind : 'Normal',
        goalEvidence: String(pass.goalEvidence || '').trim() || text,
        decisiveAction: String(pass.decisiveAction || '').trim() || (isOocStop ? 'OOC clarification or instruction' : fallbackGoal),
        decisiveActionEvidence: String(pass.decisiveActionEvidence || '').trim() || text,
        outcomeOnSuccess: String(pass.outcomeOnSuccess || '').trim(),
        outcomeOnFailure: String(pass.outcomeOnFailure || '').trim(),
        actionTargets: arrayFromCompact(pass.actionTargets),
        oppTargetsNpc: hasStakes === 'Y' ? arrayFromCompact(pass.oppTargetsNpc) : [],
        oppTargetsEnv: hasStakes === 'Y' ? arrayFromCompact(pass.oppTargetsEnv) : [],
        benefitedObservers: arrayFromCompact(pass.benefitedObservers),
        harmedObservers: arrayFromCompact(pass.harmedObservers),
        npcInScene: arrayFromCompact(pass.npcInScene),
        hasStakes,
        stakesEvidence: String(pass.stakesEvidence || pass.reason || '').trim() || (hasStakes === 'Y'
            ? 'Mechanics pass found explicit meaningful stakes.'
            : 'Mechanics pass classified this as no-roll with no meaningful contested stakes.'),
        actionCount: Math.max(1, Math.min(3, Number(pass.actionCount) || 1)),
        userStat: ['PHY', 'MND', 'CHA'].includes(pass.userStat) ? pass.userStat : 'MND',
        userStatEvidence: String(pass.userStatEvidence || '').trim(),
        oppStat: ['PHY', 'MND', 'CHA', 'ENV'].includes(pass.oppStat) ? pass.oppStat : 'ENV',
        oppStatEvidence: String(pass.oppStatEvidence || '').trim(),
        hostilePhysicalHarm: pass.hostilePhysicalHarm === 'Y' ? 'Y' : 'N',
        newEncounter: pass.newEncounter === 'Y' ? 'Y' : 'N',
        timeDeltaMinutes: Number.isFinite(Number(pass.timeDeltaMinutes)) ? Number(pass.timeDeltaMinutes) : 0,
        timeSkipReason: String(pass.timeSkipReason || '').trim(),
        systemOnlyUpdate: isSystemUpdate ? 'Y' : 'N',
        systemOnlyUpdateReason: isSystemUpdate ? String(pass.reason || 'Mechanics pass classified this as a pure tracker/continuity update.').trim() : '',
        scene: {
            location: String(pass.scene?.location || '').trim(),
            time: String(pass.scene?.time || '').trim(),
            weather: String(pass.scene?.weather || '').trim(),
        },
        npcFacts: Array.isArray(pass.npcFacts) ? pass.npcFacts : [],
        inventoryDeltas: Array.isArray(pass.inventoryDeltas) ? pass.inventoryDeltas : [],
        taskDeltas: Array.isArray(pass.taskDeltas) ? pass.taskDeltas : [],
        resolverMode: 'mechanics_pass',
        mechanicsPassMode: mode,
        mechanicsPassReason: String(pass.reason || '').trim(),
    };
}

function arrayFromCompact(value) {
    return Array.isArray(value) ? value.map(x => String(x || '').trim()).filter(Boolean) : [];
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
    let fallback = inferFallbackExtraction(latestUserMessage, name2, current);
    fallback = await guardDeadArchiveReentry(fallback, latestUserMessage);
    console.debug('[RP Engine Tracker] Resolver start', { latestUserMessage, hasFallback: Object.keys(fallback).length > 0 });

    if (fallback.resolverBypass) {
        const resolved = resolveTurn(fallback, current, { userStats });
        applyTimeTracking(resolved.tracker, current, resolved.audit?.extraction);
        resolved.packet.SceneTime = resolved.tracker.scene?.time || '';
        resolved.packet.TimeAdvance = resolved.tracker.worldClock?.lastAdvance || '';
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
    parsed = await guardDeadArchiveReentry(parsed, latestUserMessage);
    const resolved = resolveTurn(parsed, current, { userStats });
    applyTimeTracking(resolved.tracker, current, resolved.audit?.extraction);
    resolved.packet.SceneTime = resolved.tracker.scene?.time || '';
    resolved.packet.TimeAdvance = resolved.tracker.worldClock?.lastAdvance || '';
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

    const restored = createTracker(snapshot);
    restored.lastAudit = {
        at: new Date().toISOString(),
        rollback: true,
        reason: 'Deleted user message removed the mechanics it triggered.',
        deletedTrigger: trigger.slice(0, 300),
    };
    chat_metadata[METADATA_KEY] = restored;
    saveTracker();
    renderPanel();
    console.info('[RP Engine Tracker] Rolled back mechanics for deleted triggering user message.');
    return true;
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
        clock.lastAdvance = clock.enabled ? clock.lastAdvance : 'World time tracking off.';
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
    const latestUserMessage = latestUserMessageFromAvailableChats(chat);
    const triggerUserMessage = lastMechanicsHandoff.trackerSnapshot?.lastAudit?.triggerUserMessage
        || tracker()?.lastAudit?.triggerUserMessage
        || '';
    return !!latestUserMessage && !!triggerUserMessage && latestUserMessage === triggerUserMessage;
}

function preserveSameTurnHandoffForRegeneration() {
    setExtensionPrompt(PROMPT_KEY, lastMechanicsHandoff.handoff, extension_prompt_types.IN_PROMPT, 0, false, extension_prompt_roles.SYSTEM);
    chat_metadata[METADATA_KEY] = structuredClone(lastMechanicsHandoff.trackerSnapshot);
    const display = lastMechanicsHandoff.display ? structuredClone(lastMechanicsHandoff.display) : null;
    if (display) {
        display.triggerUserMessageId = findLatestUserMessageIdByText(display.triggerUserMessage);
        bindMechanicsDisplayToTrigger(display);
    }
    saveTracker();
    renderPanel();
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
    if (!Number.isFinite(id)) return false;
    const message = getMessageById(id);
    if (!isUserMessage(message)) return false;

    message[MESSAGE_MECHANICS_KEY] = structuredClone(payload);
    saveChatDebounced();
    renderMechanicsBlocks();
    return true;
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
    const sourceChat = Array.isArray(getContext().chat) ? getContext().chat : [];
    $('#chat .mes').each((_, element) => {
        const messageId = Number(element.getAttribute('mesid'));
        if (!Number.isFinite(messageId)) return;
        const message = sourceChat[messageId];
        const payload = message?.[MESSAGE_MECHANICS_KEY];
        if (!payload) return;
        $(element).after(renderMechanicsBlock(payload));
    });
}

function renderMechanicsBlock(payload) {
    const audit = payload?.resolverSchema || null;
    const handoff = String(payload?.narrationHandoff || '').trim();
    const summaryBits = mechanicsSummaryBits(audit, payload);
    const title = summaryBits.length ? `Mechanics | ${summaryBits.join(' | ')}` : 'Mechanics';
    return `
        <div class="rp-engine-message-mechanics">
            <details>
                <summary>${escapeHtml(title)}</summary>
                <div class="rp-engine-message-mechanics-body">
                    ${audit ? renderMechanicsSummary(audit) : '<div class="rp-engine-muted">No mechanics summary stored.</div>'}
                    <details>
                        <summary>Narration Handoff</summary>
                        ${handoff ? `<pre>${escapeHtml(handoff)}</pre>` : '<div class="rp-engine-muted">No narration handoff injected.</div>'}
                    </details>
                </div>
            </details>
        </div>
    `;
}

function renderMechanicsSummary(audit) {
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

    return `
        <div class="rp-engine-audit-card">
            <div class="rp-engine-audit-title">Mechanics Summary</div>
            ${renderKv('Resolver', resolverModeLabel(extraction))}
            ${renderKv('Goal', packet.GOAL || extraction.goal)}
            ${renderKv('Action', packet.DecisiveAction || extraction.decisiveAction)}
            ${renderKv('Stakes', packet.STAKES || extraction.hasStakes)}
            ${renderKv('Target', listText(packet.ActionTargets || extraction.actionTargets))}
            ${renderKv('Opposition', listText([...(packet.OppTargets?.NPC || extraction.oppTargetsNpc || []), ...(packet.OppTargets?.ENV || extraction.oppTargetsEnv || [])]))}
            ${renderKv('Benefited', listText(packet.BenefitedObservers || extraction.benefitedObservers))}
            ${renderKv('Harmed', listText(packet.HarmedObservers || extraction.harmedObservers))}
            ${renderKv('Roll', rollLine)}
            ${renderKv('Outcome', `${packet.OutcomeTier || 'NONE'} / ${packet.Outcome || 'no_roll'}`)}
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

function resolverModeLabel(extraction) {
    if (extraction?.resolverMode === 'mechanics_pass') return `mechanics pass ${extraction.mechanicsPassMode || ''}`.trim();
    return extraction?.resolverMode || 'full';
}

function mechanicsSummaryBits(audit, payload) {
    const packet = audit?.resolutionPacket || {};
    const chaos = audit?.chaosHandoff?.CHAOS || {};
    return [
        packet.GOAL || audit?.extraction?.goal || '',
        packet.STAKES === 'Y' ? (packet.Outcome || packet.OutcomeTier || 'resolved') : 'no roll',
        chaos.triggered ? `chaos ${chaos.band || 'event'}` : '',
        payload?.at ? new Date(payload.at).toLocaleTimeString() : '',
    ].filter(Boolean).slice(0, 4);
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

    const data = summarizeTracker(tracker());
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
            <div class="rp-engine-muted">${escapeHtml(data.user.condition || 'unknown condition')}</div>
        </section>
        <details>
            <summary>Inventory for ${escapeHtml(userLabel)}</summary>
            ${inventoryHtml}
        </details>
        <details open>
            <summary>Pending Tasks for ${escapeHtml(userLabel)}</summary>
            ${pendingHtml}
        </details>
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
    return `
        <div class="rp-engine-npc">
            <div class="rp-engine-npc-title">${escapeHtml(npc.name || npc.id)}</div>
            <div>B${d.B}/F${d.F}/H${d.H} | Rapport ${npc.rapport ?? 0} | Gate ${escapeHtml(npc.intimacyGate || 'SKIP')}</div>
            <div class="rp-engine-muted">Feels: ${escapeHtml(npc.feelsTowardUser || describeNpcFeeling(npc))}</div>
            <div class="rp-engine-statline">PHY ${s.PHY} | MND ${s.MND} | CHA ${s.CHA}</div>
            <div class="rp-engine-muted">${escapeHtml(npc.condition || 'unknown')} ${npc.position ? `| ${escapeHtml(npc.position)}` : ''}</div>
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
                    <strong class="rp-engine-title">RP Engine</strong>
                    <div class="rp-engine-actions">
                        <button id="rp_engine_tracker_collapse" title="Collapse tracker"><i class="fa-solid fa-book-open"></i></button>
                    </div>
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
        await syncNpcArchive(result);

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

        saveTracker();
        renderPanel();
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
        saveTracker();
        renderPanel();
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
    setupUi();
    eventSource.on(event_types.CHAT_CHANGED, () => {
        tracker();
        renderPanel();
        renderMechanicsBlocks();
        maybeOfferCharacterCreator();
    });
    eventSource.on(event_types.MESSAGE_UPDATED, (messageId) => {
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        rollbackLastTurnIfTriggerDeleted();
        renderPanel();
        renderMechanicsBlocks();
    });
    eventSource.on(event_types.CHAT_DELETED, deleteNpcArchiveEntriesForChat);
    eventSource.on(event_types.GROUP_CHAT_DELETED, deleteNpcArchiveEntriesForChat);
});
