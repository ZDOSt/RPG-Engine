import { ENGINE_PROMPT_TEXT } from './engines.js';

export async function extractSemanticLedger(context, coreChat, type, trackerSnapshot) {
    if (!context?.generateRaw) {
        throw new Error('SillyTavern generateRaw API is unavailable.');
    }

    const prompt = buildSemanticPrompt(context, coreChat, type, trackerSnapshot);
    const raw = await context.generateRaw({
        prompt,
        responseLength: 3500,
        trimNames: false,
    });

    return normalizeLedger(parseJson(raw));
}

function buildSemanticPrompt(context, coreChat, type, trackerSnapshot) {
    const chatContext = formatChatContext(coreChat);
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';

    return [
        {
            role: 'system',
            content:
                'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
                'Return JSON only. Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
                'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference.',
        },
        {
            role: 'system',
            content: `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nTracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}`,
        },
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
        },
        {
            role: 'user',
            content:
                `Recent chat context, newest last:\n${chatContext}\n\n` +
                'Return one JSON object with this shape:\n' +
                `{
  "userCoreStats": {"PHY": 1, "MND": 1, "CHA": 1},
  "resolutionSemantic": {
    "goal": "plain final intent",
    "intimacyAdvance": "none|physical|verbal",
    "explicitMeans": "plain explicit means",
    "targets": {
      "ActionTargets": ["NPC names or (none)"],
      "OppTargets": {"NPC": ["NPC names or (none)"], "ENV": ["obstacle names or (none)"]},
      "BenefitedObservers": ["NPC names or (none)"],
      "HarmedObservers": ["NPC names or (none)"]
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
      "NPC": "name",
      "relevant": true,
      "initFlags": {"romanticOpen": false, "userBadRep": false, "userGoodRep": false, "userNonHuman": false, "fearImmunity": false},
      "newEncounterExplicit": false,
      "explicitIntimidationOrCoercion": false,
      "stakeChangeByOutcome": {"no_roll": "none", "success": "benefit|harm|none", "failure": "benefit|harm|none", "dominant_impact": "benefit|harm|none", "solid_impact": "benefit|harm|none", "light_impact": "benefit|harm|none", "checked": "benefit|harm|none", "deflected": "benefit|harm|none", "avoided": "benefit|harm|none"},
      "overrideFlags": {"Exploitation": false, "Hedonist": false, "Transactional": false, "Established": false},
      "coreStatsIfNeeded": {"Rank": "Weak|Average|Trained|Elite|Boss|none", "MainStat": "PHY|MND|CHA|Balanced|none", "PHY": 1, "MND": 1, "CHA": 1}
    }
  ],
  "chaosSemantic": {"sceneSummary": "short scene summary"},
  "nameSemantic": {"nameRequired": false, "explicitNameKnown": true, "isLocation": false, "seed": "(none)", "normalizeSeed": "(none)", "detectMode": "none|PERSON|LOCATION", "generatedName": "(none)"},
  "proactivitySemantic": {"cap": 1}
}`,
        },
    ];
}

function formatChatContext(coreChat) {
    const rows = Array.isArray(coreChat) ? coreChat.slice(-14) : [];
    return rows.map((message, index) => {
        const speaker = message?.is_user ? 'USER' : (message?.name || 'NPC');
        const text = String(message?.mes ?? message?.message ?? message?.content ?? '').trim();
        return `${index + 1}. ${speaker}: ${text}`;
    }).join('\n');
}

function parseJson(raw) {
    if (raw && typeof raw === 'object') return raw;
    const text = String(raw ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : extractJsonObject(text);
    return JSON.parse(candidate);
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
