import { ENGINE_PROMPT_TEXT } from './engines.js';

export async function extractSemanticLedger(context, coreChat, type, trackerSnapshot) {
    if (!context?.generateRaw) {
        throw new Error('SillyTavern generateRaw API is unavailable.');
    }

    const prompt = buildSemanticPrompt(context, coreChat, type, trackerSnapshot);
    const raw = await context.generateRaw({
        prompt,
        responseLength: 4500,
        trimNames: false,
        prefill: '{',
        jsonSchema: SEMANTIC_LEDGER_SCHEMA,
    });

    const ledger = parseJson(raw);
    if (!ledger || typeof ledger !== 'object' || !ledger.resolutionSemantic) {
        throw new Error(`Semantic pass returned an invalid ledger object: ${String(raw).slice(0, 200)}`);
    }

    const normalized = normalizeLedger(ledger);
    const personaCoreStats = extractPersonaCoreStats(context);
    if (personaCoreStats) {
        normalized.userCoreStats = {
            ...normalized.userCoreStats,
            ...personaCoreStats,
        };
        normalized.deterministicOverrides = {
            ...(normalized.deterministicOverrides || {}),
            userCoreStats: {
                source: 'getCharacterCardFields().persona',
                ...personaCoreStats,
            },
        };
    }

    return normalized;
}

const CORE_SCHEMA = Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: {
        Rank: { type: 'string', enum: ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'none'] },
        MainStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'Balanced', 'none'] },
        PHY: { type: 'integer', minimum: 1, maximum: 10 },
        MND: { type: 'integer', minimum: 1, maximum: 10 },
        CHA: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['PHY', 'MND', 'CHA'],
});

const SEMANTIC_LEDGER_SCHEMA = Object.freeze({
    name: 'structured_preflight_semantic_ledger',
    description: 'Semantic predicates for the Structured Preflight deterministic runner.',
    strict: true,
    value: {
        type: 'object',
        additionalProperties: false,
        properties: {
            engineContext: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    userCoreStats: CORE_SCHEMA,
                    trackerRelevantNPCs: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                NPC: { type: 'string' },
                                currentDisposition: { type: ['string', 'null'] },
                                currentRapport: { type: 'integer', minimum: 0, maximum: 5 },
                                rapportEncounterLock: { type: 'string', enum: ['Y', 'N'] },
                                intimacyGate: { type: 'string', enum: ['ALLOW', 'DENY', 'SKIP'] },
                                currentCoreStats: CORE_SCHEMA,
                            },
                            required: ['NPC'],
                        },
                    },
                },
                required: ['userCoreStats', 'trackerRelevantNPCs'],
            },
            resolutionSemantic: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    goal: { type: 'string' },
                    intimacyAdvance: { type: 'string', enum: ['none', 'physical', 'verbal'] },
                    explicitMeans: { type: 'string' },
                    targets: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            ActionTargets: { type: 'array', items: { type: 'string' } },
                            OppTargets: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    NPC: { type: 'array', items: { type: 'string' } },
                                    ENV: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['NPC', 'ENV'],
                            },
                            BenefitedObservers: { type: 'array', items: { type: 'string' } },
                            HarmedObservers: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['ActionTargets', 'OppTargets', 'BenefitedObservers', 'HarmedObservers'],
                    },
                    hasStakesCandidate: { type: 'boolean' },
                    actionMarkers: { type: 'array', items: { type: 'string', enum: ['a1', 'a2', 'a3'] } },
                    userStat: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
                    oppStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
                    primaryOppTarget: { type: 'string' },
                    hostilePhysicalIntent: { type: 'boolean' },
                    genStatsIfNeeded: CORE_SCHEMA,
                },
                required: [
                    'goal',
                    'intimacyAdvance',
                    'explicitMeans',
                    'targets',
                    'hasStakesCandidate',
                    'actionMarkers',
                    'userStat',
                    'oppStat',
                    'primaryOppTarget',
                    'hostilePhysicalIntent',
                    'genStatsIfNeeded',
                ],
            },
            relationshipSemantic: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        NPC: { type: 'string' },
                        relevant: { type: 'boolean' },
                        initFlags: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                romanticOpen: { type: 'boolean' },
                                userBadRep: { type: 'boolean' },
                                userGoodRep: { type: 'boolean' },
                                userNonHuman: { type: 'boolean' },
                                fearImmunity: { type: 'boolean' },
                            },
                            required: ['romanticOpen', 'userBadRep', 'userGoodRep', 'userNonHuman', 'fearImmunity'],
                        },
                        newEncounterExplicit: { type: 'boolean' },
                        explicitIntimidationOrCoercion: { type: 'boolean' },
                        stakeChangeByOutcome: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                no_roll: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                success: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                failure: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                dominant_impact: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                solid_impact: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                light_impact: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                struggle: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                checked: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                deflected: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                                avoided: { type: 'string', enum: ['benefit', 'harm', 'none'] },
                            },
                            required: ['no_roll', 'success', 'failure', 'dominant_impact', 'solid_impact', 'light_impact', 'struggle', 'checked', 'deflected', 'avoided'],
                        },
                        overrideFlags: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                Exploitation: { type: 'boolean' },
                                Hedonist: { type: 'boolean' },
                                Transactional: { type: 'boolean' },
                                Established: { type: 'boolean' },
                            },
                            required: ['Exploitation', 'Hedonist', 'Transactional', 'Established'],
                        },
                        coreStatsIfNeeded: CORE_SCHEMA,
                    },
                    required: [
                        'NPC',
                        'relevant',
                        'initFlags',
                        'newEncounterExplicit',
                        'explicitIntimidationOrCoercion',
                        'stakeChangeByOutcome',
                        'overrideFlags',
                        'coreStatsIfNeeded',
                    ],
                },
            },
            chaosSemantic: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    sceneSummary: { type: 'string' },
                },
                required: ['sceneSummary'],
            },
            nameSemantic: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    nameRequired: { type: 'boolean' },
                    explicitNameKnown: { type: 'boolean' },
                    isLocation: { type: 'boolean' },
                    seed: { type: 'string' },
                    normalizeSeed: { type: 'string' },
                    detectMode: { type: 'string', enum: ['none', 'PERSON', 'LOCATION'] },
                    generatedName: { type: 'string' },
                },
                required: ['nameRequired', 'explicitNameKnown', 'isLocation', 'seed', 'normalizeSeed', 'detectMode', 'generatedName'],
            },
            proactivitySemantic: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    cap: { type: 'integer', minimum: 1, maximum: 3 },
                },
                required: ['cap'],
            },
        },
        required: ['engineContext', 'resolutionSemantic', 'relationshipSemantic', 'chaosSemantic', 'nameSemantic', 'proactivitySemantic'],
    },
});

const SEMANTIC_LEDGER_TEMPLATE = `{
  "engineContext": {
    "userCoreStats": {"PHY": 1, "MND": 1, "CHA": 1},
    "trackerRelevantNPCs": [
      {
        "NPC": "name",
        "currentDisposition": "B#/F#/H# or null",
        "currentRapport": 0,
        "rapportEncounterLock": "Y|N",
        "intimacyGate": "ALLOW|DENY|SKIP",
        "currentCoreStats": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
      }
    ]
  },
  "resolutionSemantic": {
    "goal": "plain final intent; use IntimacyAdvancePhysical/Verbal only for explicit direct intimate advances",
    "intimacyAdvance": "none|physical|verbal",
    "explicitMeans": "plain explicit means that determine success/failure",
    "targets": {
      "ActionTargets": ["living NPC names or (none)"],
      "OppTargets": {"NPC": ["living opposing NPC names or (none)"], "ENV": ["non-living obstacle names or (none)"]},
      "BenefitedObservers": ["living NPC names or (none)"],
      "HarmedObservers": ["living NPC names or (none)"]
    },
    "hasStakesCandidate": true,
    "actionMarkers": ["a1"],
    "userStat": "PHY|MND|CHA",
    "oppStat": "PHY|MND|CHA|ENV",
    "primaryOppTarget": "name or (none)",
    "hostilePhysicalIntent": false,
    "genStatsIfNeeded": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
  },
  "relationshipSemantic": [
    {
      "NPC": "living NPC name",
      "relevant": true,
      "initFlags": {"romanticOpen": false, "userBadRep": false, "userGoodRep": false, "userNonHuman": false, "fearImmunity": false},
      "newEncounterExplicit": false,
      "explicitIntimidationOrCoercion": false,
      "stakeChangeByOutcome": {"no_roll": "none", "success": "benefit|harm|none", "failure": "benefit|harm|none", "dominant_impact": "benefit|harm|none", "solid_impact": "benefit|harm|none", "light_impact": "benefit|harm|none", "struggle": "benefit|harm|none", "checked": "benefit|harm|none", "deflected": "benefit|harm|none", "avoided": "benefit|harm|none"},
      "overrideFlags": {"Exploitation": false, "Hedonist": false, "Transactional": false, "Established": false},
      "coreStatsIfNeeded": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
    }
  ],
  "chaosSemantic": {"sceneSummary": "short scene summary"},
  "nameSemantic": {"nameRequired": false, "explicitNameKnown": true, "isLocation": false, "seed": "(none)", "normalizeSeed": "(none)", "detectMode": "none|PERSON|LOCATION", "generatedName": "(none)"},
  "proactivitySemantic": {"cap": 1}
}`;

function buildSemanticPrompt(context, coreChat, type, trackerSnapshot) {
    const chatContext = formatChatContext(coreChat);
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const cardContext = formatCardContext(context);

    return [
        {
            role: 'system',
            content:
                'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
                'Return exactly one complete, valid JSON object. Do not wrap it in markdown. Do not return an empty object. ' +
                'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
                'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
                'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
                'hasStakesCandidate is contextual and FINAL: return true only when success or failure would materially change stakes under DEF.STAKES; return false for truly no-stakes acts. ' +
                'Living/non-living target separation is mandatory: ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, relationshipSemantic.NPC entries, and NPCInScene candidates are living entities only; objects, terrain, hazards, wards, magic effects, rooms, tools, furniture, paths, and obstacles are OppTargets.ENV only. ' +
                'Create one relationshipSemantic entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or otherwise directly interacted with or materially affected by the last user input. ' +
                'For each living NPC in relationshipSemantic, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. ' +
                'If a named NPC is a primary target and tracker currentCoreStats are missing, generate that NPC core stat block from explicit portrayal and copy the same block into resolutionSemantic.genStatsIfNeeded and the matching relationshipSemantic.coreStatsIfNeeded. ' +
                'Do not leave a named portrayed NPC as Rank none or 1/1/1 unless the card, scene, and tracker give no explicit portrayal at all.',
        },
        {
            role: 'system',
            content: `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nTracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}`,
        },
        {
            role: 'system',
            content:
                'Explicit character/persona context from SillyTavern getCharacterCardFields(). ' +
                'Use it for explicit-only stats, presets, portrayal, and relationship flags. ' +
                'If a stat is not explicit here or in chat/tracker, use the engine default/fallback.\n' +
                cardContext,
        },
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
        },
        {
            role: 'system',
            content:
                'Semantic extraction order mirrors the original engine dependency order. ' +
                'First read engineContext/tracker/persona/card/chat. Then fill ResolutionEngine semantic fields in this order: identifyGoal, identifyTargets, checkIntimacyGate context, hasStakes, actionCount, mapStats, getUserCoreStats, getCurrentCoreStats/genStats. ' +
                'Then fill RelationshipEngine semantic fields in this order: relevant NPCs, current state context, init flags, new encounter flag, auditInteraction/stakeChangeByOutcome, route context flags, override flags, coreStatsIfNeeded. ' +
                'Then fill chaosSemantic, nameSemantic, and proactivitySemantic. ' +
                'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
                'Do not use deterministic outcomes, dice, or guesses to change semantic stakes.',
        },
        {
            role: 'user',
            content:
                `Recent chat context, newest last:\n${chatContext}\n\n` +
                'Important classification reminders: Asking/proposing/requesting explicit intimacy is IntimacyAdvanceVerbal. Physical contact is IntimacyAdvancePhysical only when the final goal is an explicit direct intimate advance toward a specific NPC; non-explicit physical contact does not count as an intimacy advance by itself. For intimacy advances toward a named NPC, primaryOppTarget must be that NPC, even if OppTargets.NPC is (none). ActionTargets and observers must be living entities only; non-living obstacles/objects go only in OppTargets.ENV. For hasStakesCandidate, apply DEF.STAKES directly and contextually: if success/failure materially affects safety, harm, danger, detection, material gain/loss, status, autonomy, obstacle resolution, or explicit goal advancement/failure for {{user}} or a living entity, return true; if success/failure would not materially change outcome, return false. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by DEF.STAKES: benefit if that outcome materially improves their stakes, harm if it materially worsens their stakes, otherwise none, regardless of whether the NPC is a direct target, observer, or affected through an environmental obstacle.\n\n' +
                'Return one complete JSON object with this exact shape. The assistant prefill is "{", so continue the object from its first property and close it with "}".\n' +
                SEMANTIC_LEDGER_TEMPLATE,
        },
    ];
}

function formatCardContext(context) {
    const fields = getCharacterCardFields(context);

    const payload = {
        persona: clip(fields.persona, 1200),
        description: clip(fields.description, 2200),
        personality: clip(fields.personality, 1400),
        scenario: clip(fields.scenario, 1200),
        firstMessage: clip(fields.firstMessage, 1200),
        creatorNotes: clip(fields.creatorNotes, 900),
        charDepthPrompt: clip(fields.charDepthPrompt, 900),
    };

    return JSON.stringify(payload, null, 2);
}

function extractPersonaCoreStats(context) {
    const fields = getCharacterCardFields(context);
    const persona = String(fields.persona ?? '').trim();
    const parsed = parseCoreStatsBlock(persona);
    return parsed
        ? { Rank: 'none', MainStat: 'none', ...parsed }
        : null;
}

function getCharacterCardFields(context) {
    try {
        return typeof context.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function parseCoreStatsBlock(text) {
    const source = String(text ?? '');
    if (!source.trim()) return null;

    const stats = {};
    for (const stat of ['PHY', 'MND', 'CHA']) {
        const match = source.match(new RegExp(`\\b${stat}\\s*[:=\\-]?\\s*(10|[1-9])\\b`, 'i'));
        if (!match) return null;
        stats[stat] = Number(match[1]);
    }

    return stats;
}

function formatChatContext(coreChat) {
    const rows = Array.isArray(coreChat) ? coreChat.slice(-14) : [];
    return rows.map((message, index) => {
        const speaker = message?.is_user ? 'USER' : (message?.name || 'NPC');
        const text = stripStructuredDebug(String(message?.mes ?? message?.message ?? message?.content ?? '')).trim();
        return `${index + 1}. ${speaker}: ${text}`;
    }).join('\n');
}

function clip(value, maxLength) {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n[truncated]`;
}

function stripStructuredDebug(text) {
    return String(text ?? '')
        .replace(/````text\s*&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/g, '')
        .replace(/````text\s*<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/g, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/g, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/g, '');
}

function parseJson(raw) {
    if (raw && typeof raw === 'object') return raw;
    const text = String(raw ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : extractJsonObject(restoreOpeningBrace(text));
    return JSON.parse(candidate);
}

function restoreOpeningBrace(text) {
    const value = String(text ?? '').trim();
    if (value.startsWith('{')) return value;
    if (value.startsWith('"')) return `{${value}`;
    return value;
}

function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) {
        throw new Error(`Semantic pass did not return JSON: ${text.slice(0, 200)}`);
    }
    return text.slice(start, end + 1);
}

function normalizeLedger(ledger) {
    if (ledger.engineContext && !ledger.userCoreStats) {
        ledger.userCoreStats = ledger.engineContext.userCoreStats;
    }
    delete ledger.engineContext;
    ledger.userCoreStats = normalizeCore(ledger.userCoreStats);
    ledger.resolutionSemantic = ledger.resolutionSemantic || {};
    ledger.resolutionSemantic.targets = ledger.resolutionSemantic.targets || {};
    ledger.resolutionSemantic.targets.OppTargets = ledger.resolutionSemantic.targets.OppTargets || {};
    ledger.resolutionSemantic.actionMarkers = normalizeActionMarkers(ledger.resolutionSemantic.actionMarkers);
    ledger.resolutionSemantic.genStatsIfNeeded = normalizeCore(ledger.resolutionSemantic.genStatsIfNeeded);
    ledger.relationshipSemantic = Array.isArray(ledger.relationshipSemantic) ? ledger.relationshipSemantic : [];
    ledger.relationshipSemantic.forEach(item => {
        item.initFlags = item.initFlags || {};
        item.stakeChangeByOutcome = item.stakeChangeByOutcome || {};
        item.overrideFlags = item.overrideFlags || {};
        item.coreStatsIfNeeded = normalizeCore(item.coreStatsIfNeeded);
    });
    ledger.chaosSemantic = ledger.chaosSemantic || { sceneSummary: '' };
    ledger.nameSemantic = ledger.nameSemantic || {};
    ledger.proactivitySemantic = ledger.proactivitySemantic || {};
    return ledger;
}

function normalizeCore(core) {
    return {
        Rank: core?.Rank ?? 'none',
        MainStat: core?.MainStat ?? 'none',
        PHY: toNumber(core?.PHY, 1),
        MND: toNumber(core?.MND, 1),
        CHA: toNumber(core?.CHA, 1),
    };
}

function normalizeActionMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return ['a1'];
    return markers.slice(0, 3).map((_, index) => `a${index + 1}`);
}

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
