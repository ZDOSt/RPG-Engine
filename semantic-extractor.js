import { ENGINE_PROMPT_TEXT } from './engines.js';

export async function extractSemanticLedger(context, coreChat, type, trackerSnapshot) {
    if (!context?.generateRawData) {
        throw new Error('SillyTavern generateRawData API is unavailable.');
    }

    const prompt = buildSemanticPrompt(context, coreChat, type, trackerSnapshot);
    const raw = await generateSemanticRaw(context, prompt);

    let ledger;
    let semanticLedgerRepair = null;
    try {
        ledger = parseJson(raw);
        validateRawLedgerContract(ledger, raw);
    } catch (error) {
        const repairPrompt = buildSemanticRepairPrompt(raw, error);
        const repairRaw = await generateSemanticRaw(context, repairPrompt, 1600);
        try {
            ledger = parseJson(repairRaw);
            validateRawLedgerContract(ledger, repairRaw);
            semanticLedgerRepair = {
                source: 'prompt schema repair pass + local validation',
                reason: error instanceof Error ? error.message : String(error),
            };
        } catch (repairError) {
            throw new Error(`Semantic pass returned no valid ledger after repair. First error: ${error.message}. Repair error: ${repairError.message}`);
        }
    }

    if (!ledger || typeof ledger !== 'object') {
        throw new Error(`Semantic pass returned an invalid ledger object: ${String(raw).slice(0, 200)}`);
    }

    const normalized = normalizeLedger(ledger);
    validateNormalizedLedger(normalized, raw);
    normalized.deterministicOverrides = {
        ...(normalized.deterministicOverrides || {}),
        semanticLedgerExtraction: {
            source: 'SillyTavern generateRawData prompt schema + assistant prefill + local validation',
            schema: 'structured_preflight_name_anchored_prompt_schema_v3',
            strict: true,
        },
    };
    if (semanticLedgerRepair) {
        normalized.deterministicOverrides.semanticLedgerRepair = semanticLedgerRepair;
    }
    const personaCoreStats = extractPersonaCoreStats(context);
    if (personaCoreStats) {
        normalized.engineContext.userCoreStats = {
            ...normalized.engineContext.userCoreStats,
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

async function generateSemanticRaw(context, prompt, responseLength = 2600) {
    return await context.generateRawData({
        prompt,
        responseLength,
        prefill: SEMANTIC_JSON_PREFILL,
    });
}

function buildSemanticRepairPrompt(raw, error) {
    const candidates = extractTextCandidates(raw).join('\n\n---\n\n');

    return [
        {
            role: 'system',
            content:
                'You repair a failed semantic ledger response for a SillyTavern rules extension. ' +
                'The output contract is mandatory and non-negotiable. Any response that omits, renames, paraphrases, fences, or corrupts the required ledger is invalid. ' +
                'Return exactly one complete valid JSON object matching the supplied name-anchored prompt schema. ' +
                'No markdown, no prose, no narration, no dice, no calculations.',
        },
        {
            role: 'user',
            content:
                `The previous response could not be parsed.\nERROR=${error instanceof Error ? error.message : String(error)}\n\n` +
                `Previous raw text candidates:\n${clip(candidates, 6000)}\n\n` +
                STRICT_NAME_ANCHORED_FIELD_CONTRACT +
                '\n\nRepair it into this exact object shape and field names. Return only the JSON object. Do not wrap it in tags or markdown.\n' +
                SEMANTIC_LEDGER_TEMPLATE,
        },
    ];
}

const SEMANTIC_JSON_PREFILL = '{';

const STRICT_NAME_ANCHORED_FIELD_CONTRACT = [
    'STRICT NAME-ANCHORED FIELD CONTRACT:',
    '- Output exactly one JSON object. No markdown. No prose. No comments. No tags. No trailing explanation.',
    '- The JSON object must start with engineContext, resolutionEngine, relationshipEngine, chaosSemantic, nameSemantic, proactivitySemantic.',
    '- The schema is only a form. The Engine reference is the rule source. Read and execute the semantic/contextual engine functions first, then fill this form from those outputs.',
    '- Field names are literal engine anchors. Do not rename, paraphrase, flatten, omit, add fields, or output fully-qualified dot-path keys.',
    '- Use plain function/key names inside the correct engine section: identifyTargets -> ActionTargets, OppTargets.NPC, OppTargets.ENV, BenefitedObservers, HarmedObservers.',
    '- Use booleans true/false, numbers for numeric fields, arrays for list fields, and strings only where the template uses strings.',
    '- Use "(none)" only inside string/list values when the engine result is none. Do not use null except engineContext.trackerRelevantNPCs[].currentDisposition may be null.',
    '- Inside each RelationshipEngine entry, every stakeChangeByOutcome value must be exactly "benefit", "harm", or "none".',
    '- All genStats blocks must include Rank, MainStat, PHY, MND, CHA.',
    '- All mapStats blocks must include USER and OPP.',
    '- If you cannot find explicit evidence, use the engine default for that field; never invent missing facts.',
].join('\n');

const SEMANTIC_LEDGER_TEMPLATE = `{
  "engineContext": {
    "userCoreStats": {"Rank": "none", "MainStat": "none", "PHY": 1, "MND": 1, "CHA": 1},
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
  "resolutionEngine": {
    "identifyGoal": "plain final intent; use IntimacyAdvancePhysical/Verbal only for explicit direct intimate advances",
    "intimacyAdvance": "none|physical|verbal",
    "explicitMeans": "plain explicit means that determine success/failure",
    "identifyTargets": {
      "ActionTargets": ["living NPC names or (none)"],
      "OppTargets": {"NPC": ["living opposing NPC names or (none)"], "ENV": ["non-living obstacle names or (none)"]},
      "BenefitedObservers": ["living NPC names or (none)"],
      "HarmedObservers": ["living NPC names or (none)"]
    },
    "hasStakes": true,
    "actionCount": ["a1"],
    "mapStats": {"USER": "PHY|MND|CHA", "OPP": "PHY|MND|CHA|ENV"},
    "classifyHostilePhysicalIntent": false,
    "genStats": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
  },
  "relationshipEngine": [
    {
      "NPC": "living NPC name",
      "relevant": true,
      "initFlags": {"romanticOpen": false, "userBadRep": false, "userGoodRep": false, "userNonHuman": false, "fearImmunity": false},
      "newEncounterExplicit": false,
      "explicitIntimidationOrCoercion": false,
      "stakeChangeByOutcome": {"no_roll": "none", "success": "benefit|harm|none", "failure": "benefit|harm|none", "dominant_impact": "benefit|harm|none", "solid_impact": "benefit|harm|none", "light_impact": "benefit|harm|none", "struggle": "benefit|harm|none", "checked": "benefit|harm|none", "deflected": "benefit|harm|none", "avoided": "benefit|harm|none"},
      "overrideFlags": {"Exploitation": false, "Hedonist": false, "Transactional": false, "Established": false},
      "genStats": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
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
                'The output contract is mandatory and non-negotiable: return exactly one complete, valid JSON object matching the supplied name-anchored prompt schema. ' +
                'Any response that renames fields, returns prose, returns markdown fences, returns an empty object, or leaves required fields missing is completely invalid and will be discarded. ' +
                'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
                'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
                'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
                'hasStakes is contextual and FINAL: return true only when success or failure would materially change stakes under DEF.STAKES; return false for truly no-stakes acts. ' +
                'Living/non-living target separation is mandatory: ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, RelationshipEngine NPC entries, and NPCInScene candidates are living entities only; objects, terrain, hazards, wards, magic effects, rooms, tools, furniture, paths, and obstacles are OppTargets.ENV only. ' +
                'BenefitedObservers and HarmedObservers are living entities present in scene who are NOT already in ActionTargets or OppTargets.NPC. Do not put a direct target or opposing NPC in observer lists. ' +
                'Create one relationshipEngine entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or otherwise directly interacted with or materially affected by the last user input. ' +
                'For each living NPC in relationshipEngine, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. ' +
                'If a named NPC is a primary target and tracker currentCoreStats are missing, generate that NPC core stat block from explicit portrayal and copy the same block into ResolutionEngine genStats and the matching RelationshipEngine genStats. ' +
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
                'Mandatory engine execution order for this semantic pass: read the Engine reference above, then execute only the semantic/contextual portions of the engines. ' +
                'Execute ResolutionEngine(input) semantic functions in order: identifyGoal, classifyHostilePhysicalIntent, identifyTargets, checkIntimacyGate context, hasStakes, actionCount, mapStats, getUserCoreStats, getCurrentCoreStats/genStats. Copy those outputs into the ResolutionEngine section using the plain function/key names shown in the template. ' +
                'Do NOT execute ResolutionEngine.resolveOutcome, dice, margins, landed actions, or counter potential; deterministic code handles those after your JSON. ' +
                'Execute RelationshipEngine(npc, resolutionPacket) semantic functions in order for each relevant living NPC: relevant/current state context, initPreset flags, newEncounterExplicit, auditInteraction/stakeChangeByOutcome, route context flags, checkThreshold overrideFlags, genStats. Copy those outputs into the RelationshipEngine entries using the plain function/key names shown in the template. ' +
                'Then fill chaosSemantic, nameSemantic, and proactivitySemantic from their engine/contextual requirements. ' +
                'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
                'Do not use deterministic outcomes, dice, or guesses to change semantic stakes.',
        },
        {
            role: 'user',
            content:
                `Recent chat context, newest last:\n${chatContext}\n\n` +
                'Important classification reminders: Asking/proposing/requesting explicit intimacy is IntimacyAdvanceVerbal. Physical contact is IntimacyAdvancePhysical only when the final goal is an explicit direct intimate advance toward a specific NPC; non-explicit physical contact does not count as an intimacy advance by itself. classifyHostilePhysicalIntent is true for explicit non-consensual physical force against a living entity, including attacks, shoves, grabs, pins, restraint, immobilization, forced movement, blocking escape, or preventing casting/action; it is false for helpful/consensual touch, purely social pressure, ENV force, or purely mental/supernatural effects. For intimacy advances toward a named NPC, put that NPC in ActionTargets; if they resist, contest, oppose, or consent-gate the advance, also put that same NPC in OppTargets.NPC. ActionTargets and observers must be living entities only; non-living obstacles/objects/hazards/effects go only in OppTargets.ENV. BenefitedObservers and HarmedObservers must exclude direct ActionTargets and OppTargets.NPC; a complimented NPC is an ActionTarget, not a BenefitedObserver. A protected/rescued NPC is a BenefitedObserver unless {{user}} directly acts on that NPC. For hasStakes, apply DEF.STAKES directly and contextually: if success/failure materially affects safety, harm, danger, detection, material gain/loss, significant status/authority/trust, autonomy/physical freedom, hostile restraint/immobilization/confinement, obstacle resolution, or explicit goal advancement/failure for {{user}} or a living entity, return true; if success/failure would not materially change outcome, return false. Minor mood, flavor, casual rudeness, weak preference, or trivial convenience alone is not stakes. For mapStats, body-affecting magic against a living target (paralysis, poison, blindness, forced sleep, pain, muscle lock, disease, transmutation, bodily binding) is USER=MND and OPP=PHY; non-living hazards/effects remain OppTargets.ENV and OPP=ENV unless a living target explicitly resists. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by DEF.STAKES: benefit if that outcome materially improves their stakes, harm if it materially worsens their stakes, otherwise none, regardless of whether the NPC is a direct target, observer, or affected through an environmental obstacle.\n\n' +
                STRICT_NAME_ANCHORED_FIELD_CONTRACT +
                '\n\nMANDATORY OUTPUT CONTRACT: Return one complete JSON object with this exact shape and field names. Do not output anything before or after the JSON object.\n' +
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
    const rows = Array.isArray(coreChat) ? coreChat : [];
    const formatted = rows.map((message, index) => {
        const speaker = message?.is_user ? 'USER' : (message?.name || 'NPC');
        const text = clip(stripStructuredDebug(String(message?.mes ?? message?.message ?? message?.content ?? '')).trim(), 1200);
        return `${index + 1}. ${speaker}: ${text}`;
    });
    const newestFirst = [...formatted].reverse();
    const kept = [];
    let total = 0;

    for (const line of newestFirst) {
        const nextTotal = total + line.length + 1;
        if (kept.length && nextTotal > 12000) break;
        kept.push(line);
        total = nextTotal;
    }

    return kept.reverse().join('\n');
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
    if (raw && typeof raw === 'object' && hasLedgerShape(raw)) return raw;
    const candidates = extractTextCandidates(raw);
    const errors = [];

    for (const text of candidates) {
        try {
            return parseLedgerText(text);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(`Semantic pass did not return a valid mandatory JSON object. Candidates=${candidates.length}. Errors=${errors.slice(0, 4).join(' | ')}`);
}

function parseLedgerText(text) {
    const sourceText = String(text ?? '').trim();
    if (!sourceText) throw new Error('empty response text');
    if (/```/.test(sourceText)) {
        throw new Error('markdown fences in semantic ledger are invalid');
    }
    if (sourceText.startsWith('{')) {
        return JSON.parse(extractJsonObject(sourceText));
    }
    if (sourceText.startsWith('"engineContext"')) {
        return JSON.parse(extractJsonObject(`{${sourceText}`));
    }

    throw new Error('missing mandatory JSON object');
}

function extractTextCandidates(raw) {
    const values = [];
    const seen = new Set();
    const add = value => {
        if (value == null) return;
        if (typeof value === 'string') {
            const text = value.trim();
            if (text && !seen.has(text)) {
                seen.add(text);
                values.push(text);
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(add);
            return;
        }
        if (typeof value === 'object') {
            if (typeof value.text === 'string') add(value.text);
            if (typeof value.content === 'string') add(value.content);
            if (typeof value.reasoning === 'string') add(value.reasoning);
            if (typeof value.reasoning_content === 'string') add(value.reasoning_content);
            if (typeof value.reasoning_details === 'string') add(value.reasoning_details);
            if (typeof value.message === 'string') add(value.message);
            if (value.message && typeof value.message === 'object') add(value.message);
            if (value.delta && typeof value.delta === 'object') add(value.delta);
            if (value.output_text) add(value.output_text);
            if (value.response) add(value.response);
            if (value.choices) add(value.choices);
            if (value.content) add(value.content);
            if (value.output) add(value.output);
            if (value.data) add(value.data);
        }
    };

    add(raw);
    return values;
}

function hasLedgerShape(value) {
    return Boolean(value?.resolutionEngine && value?.relationshipEngine && value?.chaosSemantic && value?.nameSemantic && value?.proactivitySemantic);
}

function validateRawLedgerContract(ledger, raw) {
    const missing = [];
    if (!ledger?.engineContext) missing.push('engineContext');
    if (!ledger?.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!Array.isArray(ledger?.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger?.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger?.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger?.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (typeof ledger?.resolutionEngine?.hasStakes !== 'boolean') missing.push('resolutionEngine.hasStakes:boolean');
    if (!Array.isArray(ledger?.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!ledger?.resolutionEngine?.mapStats?.USER) missing.push('resolutionEngine.mapStats.USER');
    if (!ledger?.resolutionEngine?.mapStats?.OPP) missing.push('resolutionEngine.mapStats.OPP');
    if (typeof ledger?.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (!Array.isArray(ledger?.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger?.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger?.nameSemantic) missing.push('nameSemantic');
    if (!ledger?.proactivitySemantic) missing.push('proactivitySemantic');

    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
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
    ledger.engineContext = ledger.engineContext || {};
    ledger.engineContext.userCoreStats = normalizeCore(ledger.engineContext.userCoreStats);
    ledger.engineContext.trackerRelevantNPCs = Array.isArray(ledger.engineContext.trackerRelevantNPCs)
        ? ledger.engineContext.trackerRelevantNPCs
        : [];
    ledger.resolutionEngine = ledger.resolutionEngine || {};
    ledger.resolutionEngine.identifyGoal = ledger.resolutionEngine.identifyGoal || 'Normal_Interaction';
    ledger.resolutionEngine.identifyTargets = ledger.resolutionEngine.identifyTargets || {};
    ledger.resolutionEngine.identifyTargets.OppTargets = ledger.resolutionEngine.identifyTargets.OppTargets || {};
    ledger.resolutionEngine.actionCount = normalizeActionMarkers(ledger.resolutionEngine.actionCount);
    ledger.resolutionEngine.mapStats = ledger.resolutionEngine.mapStats || {};
    ledger.resolutionEngine.hasStakes = toBoolean(ledger.resolutionEngine.hasStakes, false);
    ledger.resolutionEngine.classifyHostilePhysicalIntent = toBoolean(ledger.resolutionEngine.classifyHostilePhysicalIntent, false);
    delete ledger.resolutionEngine.hostilePhysicalIntent;
    ledger.resolutionEngine.genStats = normalizeCore(ledger.resolutionEngine.genStats);
    ledger.relationshipEngine = Array.isArray(ledger.relationshipEngine) ? ledger.relationshipEngine : [];
    ledger.relationshipEngine.forEach(item => {
        item.initFlags = item.initFlags || {};
        item.stakeChangeByOutcome = item.stakeChangeByOutcome || {};
        item.overrideFlags = item.overrideFlags || {};
        item.genStats = normalizeCore(item.genStats);
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

function validateNormalizedLedger(ledger, raw) {
    const missing = [];
    if (!ledger.engineContext) missing.push('engineContext');
    if (!ledger.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!Array.isArray(ledger.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (typeof ledger.resolutionEngine?.hasStakes !== 'boolean') missing.push('resolutionEngine.hasStakes:boolean');
    if (!Array.isArray(ledger.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!ledger.resolutionEngine?.mapStats?.USER) missing.push('resolutionEngine.mapStats.USER');
    if (!ledger.resolutionEngine?.mapStats?.OPP) missing.push('resolutionEngine.mapStats.OPP');
    if (typeof ledger.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (!Array.isArray(ledger.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger.nameSemantic) missing.push('nameSemantic');
    if (!ledger.proactivitySemantic) missing.push('proactivitySemantic');

    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

function toBoolean(value, fallback) {
    if (value === true || value === 'Y' || value === 'y' || value === 'true') return true;
    if (value === false || value === 'N' || value === 'n' || value === 'false') return false;
    return fallback;
}

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
