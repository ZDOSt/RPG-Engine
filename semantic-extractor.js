import { ENGINE_PROMPT_TEXT } from './engines.js';

export async function extractSemanticLedger(context, coreChat, type, trackerSnapshot) {
    if (!context?.generateRawData) {
        throw new Error('SillyTavern generateRawData API is unavailable.');
    }

    const prompt = buildSemanticPrompt(context, coreChat, type, trackerSnapshot);
    const raw = await generateSemanticRaw(context, prompt);

    let ledger;
    try {
        ledger = parseJson(raw);
        validateRawLedgerContract(ledger, raw);
    } catch (error) {
        const repairPrompt = buildSemanticRepairPrompt(raw, error);
        const repairRaw = await generateSemanticRaw(context, repairPrompt, 1600);
        try {
            ledger = parseJson(repairRaw);
            validateRawLedgerContract(ledger, repairRaw);
            ledger.deterministicOverrides = {
                ...(ledger.deterministicOverrides || {}),
                semanticLedgerRepair: {
                    source: 'generateRawData repair pass',
                    reason: error instanceof Error ? error.message : String(error),
                },
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

async function generateSemanticRaw(context, prompt, responseLength = 2600) {
    return await context.generateRawData({
        prompt,
        responseLength,
        prefill: '<semantic_ledger>\n{',
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
                'Return exactly one complete valid JSON object wrapped in <semantic_ledger>...</semantic_ledger>. ' +
                'No markdown, no prose, no narration, no dice, no calculations.',
        },
        {
            role: 'user',
            content:
                `The previous response could not be parsed.\nERROR=${error instanceof Error ? error.message : String(error)}\n\n` +
                `Previous raw text candidates:\n${clip(candidates, 6000)}\n\n` +
                'Repair it into this exact object shape and field names. The assistant prefill is "<semantic_ledger>\\n{", so continue the object from its first property, close it with "}", then close </semantic_ledger>.\n' +
                SEMANTIC_LEDGER_TEMPLATE,
        },
    ];
}

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
    "identifyGoal": "plain final intent; use IntimacyAdvancePhysical/Verbal only for explicit direct intimate advances",
    "intimacyAdvance": "none|physical|verbal",
    "explicitMeans": "plain explicit means that determine success/failure",
    "identifyTargets": {
      "ActionTargets": ["living NPC names or (none)"],
      "OppTargets": {"NPC": ["living opposing NPC names or (none)"], "ENV": ["non-living obstacle names or (none)"]},
      "BenefitedObservers": ["living NPC names or (none)"],
      "HarmedObservers": ["living NPC names or (none)"]
    },
    "hasStakesCandidate": true,
    "actionCount": ["a1"],
    "mapStats": {"USER": "PHY|MND|CHA", "OPP": "PHY|MND|CHA|ENV"},
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
                'The output contract is mandatory and non-negotiable: return exactly one complete, valid JSON object wrapped in <semantic_ledger>...</semantic_ledger>. ' +
                'Any response that omits the tags, renames fields, returns prose, returns markdown fences, returns an empty object, or leaves required fields missing is completely invalid and will be discarded. ' +
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
                'MANDATORY OUTPUT CONTRACT: Return one complete JSON object with this exact shape and field names. The assistant prefill is "<semantic_ledger>\\n{", so continue the object from its first property, close it with "}", then close </semantic_ledger>. Do not output anything before or after the closing tag.\n' +
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

    throw new Error(`Semantic pass did not return a valid mandatory <semantic_ledger> JSON block. Candidates=${candidates.length}. Errors=${errors.slice(0, 4).join(' | ')}`);
}

function parseLedgerText(text) {
    const sourceText = String(text ?? '').trim();
    if (!sourceText) throw new Error('empty response text');

    const tagged = sourceText.match(/<semantic_ledger>\s*([\s\S]*?)\s*<\/semantic_ledger>/i);
    const prefilled = !tagged && sourceText.endsWith('</semantic_ledger>') && sourceText.startsWith('"');
    if (!tagged && !prefilled) throw new Error('missing mandatory <semantic_ledger> contract or exact prefill continuation');

    const inside = tagged
        ? tagged[1].trim()
        : `{${sourceText.slice(0, -'</semantic_ledger>'.length).trim()}`;
    if (/```/.test(inside)) {
        throw new Error('markdown fences inside semantic_ledger are invalid');
    }

    const candidate = extractJsonObject(restoreOpeningBrace(inside));
    return JSON.parse(candidate);
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
    return Boolean(value?.resolutionSemantic && value?.relationshipSemantic && value?.chaosSemantic && value?.nameSemantic && value?.proactivitySemantic);
}

function validateRawLedgerContract(ledger, raw) {
    const missing = [];
    if (!ledger?.engineContext) missing.push('engineContext');
    if (!ledger?.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!ledger?.resolutionSemantic) missing.push('resolutionSemantic');
    if (!ledger?.resolutionSemantic?.identifyGoal) missing.push('resolutionSemantic.identifyGoal');
    if (!ledger?.resolutionSemantic?.identifyTargets) missing.push('resolutionSemantic.identifyTargets');
    if (!Array.isArray(ledger?.resolutionSemantic?.identifyTargets?.ActionTargets)) missing.push('resolutionSemantic.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger?.resolutionSemantic?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionSemantic.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger?.resolutionSemantic?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionSemantic.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger?.resolutionSemantic?.identifyTargets?.BenefitedObservers)) missing.push('resolutionSemantic.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger?.resolutionSemantic?.identifyTargets?.HarmedObservers)) missing.push('resolutionSemantic.identifyTargets.HarmedObservers');
    if (typeof ledger?.resolutionSemantic?.hasStakesCandidate !== 'boolean') missing.push('resolutionSemantic.hasStakesCandidate:boolean');
    if (!Array.isArray(ledger?.resolutionSemantic?.actionCount)) missing.push('resolutionSemantic.actionCount');
    if (!ledger?.resolutionSemantic?.mapStats?.USER) missing.push('resolutionSemantic.mapStats.USER');
    if (!ledger?.resolutionSemantic?.mapStats?.OPP) missing.push('resolutionSemantic.mapStats.OPP');
    if (!Array.isArray(ledger?.relationshipSemantic)) missing.push('relationshipSemantic');
    if (!ledger?.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger?.nameSemantic) missing.push('nameSemantic');
    if (!ledger?.proactivitySemantic) missing.push('proactivitySemantic');

    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
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
    ledger.resolutionSemantic.goal = ledger.resolutionSemantic.goal || ledger.resolutionSemantic.identifyGoal || 'Normal_Interaction';
    ledger.resolutionSemantic.targets = ledger.resolutionSemantic.targets || ledger.resolutionSemantic.identifyTargets || {};
    ledger.resolutionSemantic.targets.OppTargets = ledger.resolutionSemantic.targets.OppTargets || {};
    ledger.resolutionSemantic.actionMarkers = normalizeActionMarkers(ledger.resolutionSemantic.actionMarkers || ledger.resolutionSemantic.actionCount);
    const mappedStats = ledger.resolutionSemantic.mapStats || {};
    ledger.resolutionSemantic.userStat = ledger.resolutionSemantic.userStat || mappedStats.USER || 'PHY';
    ledger.resolutionSemantic.oppStat = ledger.resolutionSemantic.oppStat || mappedStats.OPP || 'ENV';
    ledger.resolutionSemantic.hasStakesCandidate = toBoolean(ledger.resolutionSemantic.hasStakesCandidate, false);
    ledger.resolutionSemantic.hostilePhysicalIntent = toBoolean(ledger.resolutionSemantic.hostilePhysicalIntent, false);
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

function validateNormalizedLedger(ledger, raw) {
    const missing = [];
    if (!ledger.resolutionSemantic) missing.push('resolutionSemantic');
    if (!ledger.resolutionSemantic?.goal) missing.push('resolutionSemantic.identifyGoal');
    if (!ledger.resolutionSemantic?.targets) missing.push('resolutionSemantic.identifyTargets');
    if (!Array.isArray(ledger.resolutionSemantic?.targets?.ActionTargets)) missing.push('resolutionSemantic.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger.resolutionSemantic?.targets?.OppTargets?.NPC)) missing.push('resolutionSemantic.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger.resolutionSemantic?.targets?.OppTargets?.ENV)) missing.push('resolutionSemantic.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger.resolutionSemantic?.targets?.BenefitedObservers)) missing.push('resolutionSemantic.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger.resolutionSemantic?.targets?.HarmedObservers)) missing.push('resolutionSemantic.identifyTargets.HarmedObservers');
    if (typeof ledger.resolutionSemantic?.hasStakesCandidate !== 'boolean') missing.push('resolutionSemantic.hasStakesCandidate:boolean');
    if (!Array.isArray(ledger.resolutionSemantic?.actionMarkers)) missing.push('resolutionSemantic.actionCount');
    if (!Array.isArray(ledger.relationshipSemantic)) missing.push('relationshipSemantic');
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
