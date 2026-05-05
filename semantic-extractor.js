import { ENGINE_PROMPT_TEXT } from './engines.js';

export async function extractSemanticLedger(context, promptContext, type, trackerSnapshot, options = {}) {
    if (!context?.generateRawData) {
        throw new Error('SillyTavern generateRawData API is unavailable.');
    }

    const prompt = options?.assembledPrompt
        ? buildSemanticPromptFromAssembledChat(context, promptContext, type, trackerSnapshot)
        : buildSemanticPrompt(context, promptContext, type, trackerSnapshot);
    const raw = await generateSemanticRaw(context, prompt);

    let ledger;
    try {
        ledger = parseSemanticLedger(raw, trackerSnapshot);
        validateRawLedgerContract(ledger, raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Semantic pass returned no valid ledger. Generation aborted before narration. ${message}`);
    }

    if (!ledger || typeof ledger !== 'object') {
        throw new Error(`Semantic pass returned an invalid ledger object: ${String(raw).slice(0, 200)}`);
    }

    const normalized = normalizeLedger(ledger);
    validateNormalizedLedger(normalized, raw);
    normalized.deterministicOverrides = {
        ...(normalized.deterministicOverrides || {}),
        semanticLedgerExtraction: {
            source: 'SillyTavern generateRawData compact preflight ledger + local validation',
            schema: 'compact_engine_name_anchored_preflight_ledger_v1',
            strict: true,
        },
    };
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

async function generateSemanticRaw(context, prompt, responseLength = null) {
    const options = { prompt };
    if (Number.isFinite(responseLength) && responseLength > 0) {
        options.responseLength = responseLength;
    }
    return await context.generateRawData(options);
}

const COMPACT_LEDGER_CONTRACT = [
    'STRICT COMPACT PREFLIGHT LEDGER CONTRACT:',
    '- Output only the ledger block. No markdown. No prose. No JSON. No comments. No explanations.',
    '- Begin with BEGIN_SEMANTIC_PREFLIGHT and end with END_SEMANTIC_PREFLIGHT.',
    '- Fill every required line exactly once. Keep the exact function/key names shown below.',
    '- The ledger is only a form. The Engine reference is the rule source. Read and execute the semantic/contextual engine functions first, then fill the lines from those outputs.',
    '- Use comma-separated names or (none) for lists. Use Y/N for booleans. Use benefit/harm/none for stakeChangeByOutcome values.',
    '- RelationshipEngine entries must use RelationshipEngine[0], RelationshipEngine[1], etc. Include one entry for each relevant living NPC.',
    '- If no living NPC is relevant, output RelationshipEngine.count=0 and no RelationshipEngine[index] lines.',
    '- All genStats groups must include Rank, MainStat, PHY, MND, CHA.',
    '- Do not output primaryOppTarget or primaryOpposition. The only opposing living target list is identifyTargets.OppTargets.NPC.',
    '- If you cannot find explicit evidence, use the engine default for that line; never invent missing facts.',
].join('\n');

const COMPACT_LEDGER_TEMPLATE = `BEGIN_SEMANTIC_PREFLIGHT
engineContext.getUserCoreStats.Rank=none
engineContext.getUserCoreStats.MainStat=none
engineContext.getUserCoreStats.PHY=1
engineContext.getUserCoreStats.MND=1
engineContext.getUserCoreStats.CHA=1
ResolutionEngine.identifyGoal=Normal_Interaction
ResolutionEngine.identifyChallenge=Normal_Interaction
ResolutionEngine.intimacyAdvance=none
ResolutionEngine.explicitMeans=(none)
ResolutionEngine.identifyTargets.ActionTargets=(none)
ResolutionEngine.identifyTargets.OppTargets.NPC=(none)
ResolutionEngine.identifyTargets.OppTargets.ENV=(none)
ResolutionEngine.identifyTargets.BenefitedObservers=(none)
ResolutionEngine.identifyTargets.HarmedObservers=(none)
ResolutionEngine.checkIntimacyGate=N
ResolutionEngine.hasStakes=N
ResolutionEngine.actionCount=a1
ResolutionEngine.mapStats.USER=PHY
ResolutionEngine.mapStats.OPP=ENV
ResolutionEngine.classifyHostilePhysicalIntent=N
ResolutionEngine.genStats.Rank=none
ResolutionEngine.genStats.MainStat=none
ResolutionEngine.genStats.PHY=1
ResolutionEngine.genStats.MND=1
ResolutionEngine.genStats.CHA=1
RelationshipEngine.count=1
RelationshipEngine[0].NPC=NPC name or (none)
RelationshipEngine[0].relevant=Y
RelationshipEngine[0].initPreset.romanticOpen=N
RelationshipEngine[0].initPreset.userBadRep=N
RelationshipEngine[0].initPreset.userGoodRep=N
RelationshipEngine[0].initPreset.userNonHuman=N
RelationshipEngine[0].initPreset.fearImmunity=N
RelationshipEngine[0].newEncounterExplicit=N
RelationshipEngine[0].auditInteraction=N
RelationshipEngine[0].explicitIntimidationOrCoercion=N
RelationshipEngine[0].stakeChangeByOutcome.no_roll=none
RelationshipEngine[0].stakeChangeByOutcome.success=none
RelationshipEngine[0].stakeChangeByOutcome.failure=none
RelationshipEngine[0].stakeChangeByOutcome.dominant_impact=none
RelationshipEngine[0].stakeChangeByOutcome.solid_impact=none
RelationshipEngine[0].stakeChangeByOutcome.light_impact=none
RelationshipEngine[0].stakeChangeByOutcome.struggle=none
RelationshipEngine[0].stakeChangeByOutcome.checked=none
RelationshipEngine[0].stakeChangeByOutcome.deflected=none
RelationshipEngine[0].stakeChangeByOutcome.avoided=none
RelationshipEngine[0].checkThreshold.Exploitation=N
RelationshipEngine[0].checkThreshold.Hedonist=N
RelationshipEngine[0].checkThreshold.Transactional=N
RelationshipEngine[0].checkThreshold.Established=N
RelationshipEngine[0].genStats.Rank=none
RelationshipEngine[0].genStats.MainStat=none
RelationshipEngine[0].genStats.PHY=1
RelationshipEngine[0].genStats.MND=1
RelationshipEngine[0].genStats.CHA=1
CHAOS_INTERRUPT.sceneSummary=short scene summary
NameGenerationEngine.nameRequired=N
NameGenerationEngine.explicitNameKnown=Y
NameGenerationEngine.isLocation=N
NameGenerationEngine.seed=(none)
NameGenerationEngine.normalizeSeed=(none)
NameGenerationEngine.detectMode=none
NameGenerationEngine.generatedName=(none)
NPCProactivityEngine.cap=1
END_SEMANTIC_PREFLIGHT`;

function buildSemanticPrompt(context, coreChat, type, trackerSnapshot) {
    const chatContext = formatChatContext(coreChat);
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const cardContext = formatCardContext(context);

    return [
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
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
            content:
                `Recent chat context, newest last:\n${chatContext}`,
        },
        {
            role: 'system',
            content:
                buildSemanticContractText(userName, charName, type, trackerSnapshot),
        },
        {
            role: 'user',
            content:
                'MANDATORY OUTPUT CONTRACT: Return one compact ledger block with these exact field names. Do not output anything before BEGIN_SEMANTIC_PREFLIGHT or after END_SEMANTIC_PREFLIGHT. Your first visible output token must be BEGIN_SEMANTIC_PREFLIGHT.\n' +
                COMPACT_LEDGER_TEMPLATE,
        },
    ];
}

function buildSemanticPromptFromAssembledChat(context, assembledChat, type, trackerSnapshot) {
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const assembledMessages = normalizeAssembledPromptMessages(assembledChat);

    return [
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
        },
        {
            role: 'system',
            content:
                'The following messages are the fully assembled SillyTavern prompt for the pending narration pass. ' +
                'They include the active preset, character card, persona, scenario, lore/world info, depth prompts, and visible chat history that fit the current ST context budget. ' +
                'Use them only as context for semantic extraction. Do not answer, continue, or narrate these messages.',
        },
        ...assembledMessages,
        {
            role: 'system',
            content: buildSemanticContractText(userName, charName, type, trackerSnapshot),
        },
        {
            role: 'user',
            content:
                'MANDATORY OUTPUT CONTRACT: Return one compact ledger block with these exact field names. Do not output anything before BEGIN_SEMANTIC_PREFLIGHT or after END_SEMANTIC_PREFLIGHT. Your first visible output token must be BEGIN_SEMANTIC_PREFLIGHT.\n' +
                COMPACT_LEDGER_TEMPLATE,
        },
    ];
}

function buildSemanticContractText(userName, charName, type, trackerSnapshot) {
    return `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nTracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}\n\n` +
        'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
        'The output contract is mandatory and non-negotiable: return exactly one compact preflight ledger block matching the supplied engine-name-anchored lines. ' +
        'Any response that renames fields, returns JSON, returns prose, returns markdown fences, returns an empty block, or leaves required lines missing is completely invalid and will be discarded. ' +
        'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
        'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
        'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
        'hasStakes is contextual and FINAL: return true only when success or failure would materially change stakes under DEF.STAKES; return false for truly no-stakes acts. ' +
        'Living/non-living target separation is mandatory: ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, RelationshipEngine NPC entries, and NPCInScene candidates are living entities only; objects, terrain, hazards, wards, magic effects, rooms, tools, furniture, paths, and obstacles are OppTargets.ENV only. ' +
        'OppTargets.NPC is only for stakes-bearing living opposition/resistance/contest. If hasStakes=false, OppTargets.NPC must be ["(none)"] unless a hard intimacy gate rule makes stakes true. If a living ActionTarget meaningfully resists/opposes a stakes-bearing action, that same NPC may also appear in OppTargets.NPC. ' +
        'BenefitedObservers and HarmedObservers are living entities present in scene who are NOT already in ActionTargets or OppTargets.NPC. Do not put a direct target or opposing NPC in observer lists. ' +
        'Create one relationshipEngine entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or otherwise directly interacted with or materially affected by the last user input. ' +
        'For each living NPC in relationshipEngine, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. For denied intimacy advances toward a direct/opposing NPC target, successful or landed outcomes worsen that NPC boundary/autonomy/trust stakes, so use harm and not none. ' +
        'If a named NPC is a primary target and tracker currentCoreStats are missing, generate that NPC core stat block from explicit portrayal and copy the same block into ResolutionEngine genStats and the matching RelationshipEngine genStats. ' +
        'Do not leave a named portrayed NPC as Rank none or 1/1/1 unless the card, scene, and tracker give no explicit portrayal at all. ' +
        'Mandatory engine execution order for this semantic pass: read the Engine reference above, then execute only the semantic/contextual portions of the engines. ' +
        'Execute ResolutionEngine(input) semantic functions in order: identifyGoal, identifyChallenge, identifyTargets, classifyHostilePhysicalIntent, checkIntimacyGate context, hasStakes, actionCount, mapStats, getUserCoreStats, getCurrentCoreStats/genStats. Copy those outputs into the ResolutionEngine lines using the exact function/key names shown in the template. ' +
        'Do NOT execute ResolutionEngine.resolveOutcome, dice, margins, landed actions, or counter potential; deterministic code handles those after your ledger. ' +
        'Execute RelationshipEngine(npc, resolutionPacket) semantic functions in order for each relevant living NPC: relevant/current state context, initPreset flags, newEncounterExplicit, auditInteraction/stakeChangeByOutcome, route context flags, checkThreshold override flags, genStats. Copy those outputs into the RelationshipEngine[index] lines using the exact function/key names shown in the template. ' +
        'Then fill CHAOS_INTERRUPT.sceneSummary, NameGenerationEngine lines, and NPCProactivityEngine.cap from their engine/contextual requirements. ' +
        'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
        'Do not use deterministic outcomes, dice, or guesses to change semantic stakes. ' +
        'Important classification reminders: Asking/proposing/requesting explicit intimacy is IntimacyAdvanceVerbal. Physical contact is IntimacyAdvancePhysical only when the final goal is an explicit direct intimate advance toward a specific NPC; non-explicit physical contact does not count as an intimacy advance by itself. identifyChallenge is the explicit stakes-bearing action/challenge; ignore incidental gestures, setup, delivery method, movement, or flavor unless that act itself carries stakes. classifyHostilePhysicalIntent is true for explicit non-consensual physical force against a living entity, including attacks, shoves, grabs, pins, restraint, immobilization, forced movement, blocking escape, or preventing casting/action; it is false for helpful/consensual touch, purely social pressure, ENV force, or purely mental/supernatural effects. For intimacy advances toward a named NPC, put that NPC in ActionTargets; if they resist, contest, oppose, or consent-gate the advance, also put that same NPC in OppTargets.NPC. If IntimacyConsent=false/IntimacyGate=DENY, successful or landed intimacy outcomes for that target worsen boundary/autonomy/trust stakes; stakeChangeByOutcome for success/dominant_impact/solid_impact/light_impact must be harm, not none. ActionTargets and observers must be living entities only; non-living obstacles/objects/hazards/effects go only in OppTargets.ENV. OppTargets.NPC requires stakes-bearing living opposition; no-stakes social attention, casual banter, compliments, or flavor actions should keep the NPC as ActionTarget only. BenefitedObservers and HarmedObservers must exclude direct ActionTargets and OppTargets.NPC; a complimented NPC is an ActionTarget, not a BenefitedObserver. A protected/rescued NPC is a BenefitedObserver unless {{user}} directly acts on that NPC. For hasStakes, apply DEF.STAKES directly and contextually: if success/failure of the final goal or explicit challenge materially affects safety, harm, danger, detection, material gain/loss, significant status/authority/trust, autonomy/physical freedom, hostile restraint/immobilization/confinement, obstacle resolution, or explicit goal advancement/failure for {{user}} or a living entity, return true; if success/failure would not materially change outcome, return false. Minor mood, flavor, casual rudeness, weak preference, or trivial convenience alone is not stakes. For mapStats, map the stat from the final goal or explicit challenge that carries stakes, not incidental gestures, flavor, delivery method, or setup. Denied/opposed IntimacyAdvancePhysical is USER=PHY and OPP=PHY even when the approach includes romantic, seductive, verbal, or social framing. Positive social opposition such as persuasion, negotiation, diplomacy, bargaining, reassurance, reconciliation, or good-faith appeal against a living opposing target is USER=CHA and OPP=CHA; negative social opposition such as bluff, deception, intimidation, coercion, threat, blackmail, manipulation, interrogation, humiliation, or forced submission against a living opposing target is USER=CHA and OPP=MND. Body-affecting magic against a living target (paralysis, poison, blindness, forced sleep, pain, muscle lock, disease, transmutation, bodily binding) is USER=MND and OPP=PHY; non-living hazards/effects remain OppTargets.ENV and OPP=ENV unless a living target explicitly resists. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by DEF.STAKES: benefit only if that outcome significantly and concretely improves their stakes; harm if it materially worsens their stakes; otherwise none. Do not mark benefit for compliments, flirting, mood improvement, politeness, ordinary conversation, user self-advancement, successful negotiation for the user, choosing not to harm the NPC, failing to harm the NPC, de-escalation without a concrete NPC gain, or the NPC merely surviving/remaining safe.\n\n' +
        COMPACT_LEDGER_CONTRACT;
}

function normalizeAssembledPromptMessages(assembledChat) {
    const rows = Array.isArray(assembledChat) ? assembledChat : [];
    return rows
        .map(message => {
            const role = ['system', 'user', 'assistant', 'tool'].includes(message?.role) ? message.role : 'system';
            const content = sanitizeAssembledContent(message?.content);
            if (isEmptyContent(content)) return null;
            return {
                role,
                content,
                ...(message?.name ? { name: message.name } : {}),
            };
        })
        .filter(Boolean);
}

function sanitizeAssembledContent(content) {
    if (typeof content === 'string') {
        return stripStructuredDebug(content).trim();
    }
    if (Array.isArray(content)) {
        return content.map(part => {
            if (part && typeof part === 'object' && typeof part.text === 'string') {
                return { ...part, text: stripStructuredDebug(part.text).trim() };
            }
            return part;
        }).filter(part => !isEmptyContent(part?.text ?? part));
    }
    return content;
}

function isEmptyContent(content) {
    if (content == null) return true;
    if (typeof content === 'string') return !content.trim();
    if (Array.isArray(content)) return content.length === 0;
    return false;
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

function parseSemanticLedger(raw, trackerSnapshot) {
    if (raw && typeof raw === 'object' && hasLedgerShape(raw)) return raw;
    const candidates = extractTextCandidates(raw);
    const errors = [];

    for (const text of candidates) {
        try {
            return parseLedgerText(text, trackerSnapshot);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(`Semantic pass did not return a valid mandatory compact ledger. Candidates=${candidates.length}. Errors=${errors.slice(0, 4).join(' | ')}`);
}

function parseLedgerText(text, trackerSnapshot) {
    const sourceText = String(text ?? '').trim();
    if (!sourceText) throw new Error('empty response text');
    if (/```/.test(sourceText)) {
        throw new Error('markdown fences in semantic ledger are invalid');
    }
    if (/BEGIN_SEMANTIC_PREFLIGHT/i.test(sourceText)) {
        return parseCompactLedger(sourceText, trackerSnapshot);
    }
    if (sourceText.startsWith('{')) {
        return JSON.parse(extractJsonObject(sourceText));
    }
    if (sourceText.startsWith('"engineContext"')) {
        return JSON.parse(extractJsonObject(`{${sourceText}`));
    }

    throw new Error('missing mandatory compact ledger block');
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
    if (!ledger?.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!['none', 'physical', 'verbal'].includes(ledger?.resolutionEngine?.intimacyAdvance)) missing.push('resolutionEngine.intimacyAdvance');
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
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
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

const STAKE_OUTCOME_KEYS = [
    'no_roll',
    'success',
    'failure',
    'dominant_impact',
    'solid_impact',
    'light_impact',
    'struggle',
    'checked',
    'deflected',
    'avoided',
];

function parseCompactLedger(text, trackerSnapshot) {
    const match = String(text).match(/BEGIN_SEMANTIC_PREFLIGHT([\s\S]*?)END_SEMANTIC_PREFLIGHT/i);
    if (!match) throw new Error('missing BEGIN_SEMANTIC_PREFLIGHT/END_SEMANTIC_PREFLIGHT block');

    const fields = new Map();
    for (const rawLine of match[1].split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const equals = line.indexOf('=');
        if (equals < 1) continue;
        const key = line.slice(0, equals).trim();
        const value = line.slice(equals + 1).trim();
        if (key) fields.set(key, value);
    }

    const required = [
        'engineContext.getUserCoreStats.Rank',
        'engineContext.getUserCoreStats.MainStat',
        'engineContext.getUserCoreStats.PHY',
        'engineContext.getUserCoreStats.MND',
        'engineContext.getUserCoreStats.CHA',
        'ResolutionEngine.identifyGoal',
        'ResolutionEngine.identifyChallenge',
        'ResolutionEngine.intimacyAdvance',
        'ResolutionEngine.explicitMeans',
        'ResolutionEngine.identifyTargets.ActionTargets',
        'ResolutionEngine.identifyTargets.OppTargets.NPC',
        'ResolutionEngine.identifyTargets.OppTargets.ENV',
        'ResolutionEngine.identifyTargets.BenefitedObservers',
        'ResolutionEngine.identifyTargets.HarmedObservers',
        'ResolutionEngine.checkIntimacyGate',
        'ResolutionEngine.hasStakes',
        'ResolutionEngine.actionCount',
        'ResolutionEngine.mapStats.USER',
        'ResolutionEngine.mapStats.OPP',
        'ResolutionEngine.classifyHostilePhysicalIntent',
        'ResolutionEngine.genStats.Rank',
        'ResolutionEngine.genStats.MainStat',
        'ResolutionEngine.genStats.PHY',
        'ResolutionEngine.genStats.MND',
        'ResolutionEngine.genStats.CHA',
        'RelationshipEngine.count',
        'CHAOS_INTERRUPT.sceneSummary',
        'NameGenerationEngine.nameRequired',
        'NameGenerationEngine.explicitNameKnown',
        'NameGenerationEngine.isLocation',
        'NameGenerationEngine.seed',
        'NameGenerationEngine.normalizeSeed',
        'NameGenerationEngine.detectMode',
        'NameGenerationEngine.generatedName',
        'NPCProactivityEngine.cap',
    ];
    const missing = required.filter(key => !fields.has(key));
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const relCount = clampNumber(readNumber(fields, 'RelationshipEngine.count', 0), 0, 20);
    for (let index = 0; index < relCount; index += 1) {
        const prefix = `RelationshipEngine[${index}]`;
        const relRequired = [
            `${prefix}.NPC`,
            `${prefix}.relevant`,
            `${prefix}.initPreset.romanticOpen`,
            `${prefix}.initPreset.userBadRep`,
            `${prefix}.initPreset.userGoodRep`,
            `${prefix}.initPreset.userNonHuman`,
            `${prefix}.initPreset.fearImmunity`,
            `${prefix}.newEncounterExplicit`,
            `${prefix}.auditInteraction`,
            `${prefix}.explicitIntimidationOrCoercion`,
            `${prefix}.checkThreshold.Exploitation`,
            `${prefix}.checkThreshold.Hedonist`,
            `${prefix}.checkThreshold.Transactional`,
            `${prefix}.checkThreshold.Established`,
            `${prefix}.genStats.Rank`,
            `${prefix}.genStats.MainStat`,
            `${prefix}.genStats.PHY`,
            `${prefix}.genStats.MND`,
            `${prefix}.genStats.CHA`,
        ];
        for (const outcomeKey of STAKE_OUTCOME_KEYS) {
            relRequired.push(`${prefix}.stakeChangeByOutcome.${outcomeKey}`);
        }
        for (const key of relRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const relationshipEngine = [];
    for (let index = 0; index < relCount; index += 1) {
        const prefix = `RelationshipEngine[${index}]`;
        const npc = cleanScalar(fields.get(`${prefix}.NPC`));
        if (!npc || isNoneValue(npc)) continue;
        const stakeChangeByOutcome = {};
        for (const outcomeKey of STAKE_OUTCOME_KEYS) {
            stakeChangeByOutcome[outcomeKey] = normalizeStakeChangeValue(fields.get(`${prefix}.stakeChangeByOutcome.${outcomeKey}`));
        }

        relationshipEngine.push({
            NPC: npc,
            relevant: readBoolean(fields, `${prefix}.relevant`, true),
            auditInteraction: readBoolean(fields, `${prefix}.auditInteraction`, false),
            initFlags: {
                romanticOpen: readBoolean(fields, `${prefix}.initPreset.romanticOpen`, false),
                userBadRep: readBoolean(fields, `${prefix}.initPreset.userBadRep`, false),
                userGoodRep: readBoolean(fields, `${prefix}.initPreset.userGoodRep`, false),
                userNonHuman: readBoolean(fields, `${prefix}.initPreset.userNonHuman`, false),
                fearImmunity: readBoolean(fields, `${prefix}.initPreset.fearImmunity`, false),
            },
            newEncounterExplicit: readBoolean(fields, `${prefix}.newEncounterExplicit`, false),
            explicitIntimidationOrCoercion: readBoolean(fields, `${prefix}.explicitIntimidationOrCoercion`, false),
            stakeChangeByOutcome,
            overrideFlags: {
                Exploitation: readBoolean(fields, `${prefix}.checkThreshold.Exploitation`, false),
                Hedonist: readBoolean(fields, `${prefix}.checkThreshold.Hedonist`, false),
                Transactional: readBoolean(fields, `${prefix}.checkThreshold.Transactional`, false),
                Established: readBoolean(fields, `${prefix}.checkThreshold.Established`, false),
            },
            genStats: readCoreGroup(fields, `${prefix}.genStats`),
        });
    }

    const resolutionEngine = {
        identifyGoal: cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        identifyChallenge: cleanScalar(fields.get('ResolutionEngine.identifyChallenge')) || cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        intimacyAdvance: normalizeIntimacyAdvance(fields.get('ResolutionEngine.intimacyAdvance')),
        explicitMeans: cleanScalar(fields.get('ResolutionEngine.explicitMeans')) || '(none)',
        identifyTargets: {
            ActionTargets: readList(fields, 'ResolutionEngine.identifyTargets.ActionTargets'),
            OppTargets: {
                NPC: readList(fields, 'ResolutionEngine.identifyTargets.OppTargets.NPC'),
                ENV: readList(fields, 'ResolutionEngine.identifyTargets.OppTargets.ENV'),
            },
            BenefitedObservers: readList(fields, 'ResolutionEngine.identifyTargets.BenefitedObservers'),
            HarmedObservers: readList(fields, 'ResolutionEngine.identifyTargets.HarmedObservers'),
        },
        checkIntimacyGate: readBoolean(fields, 'ResolutionEngine.checkIntimacyGate', false),
        hasStakes: readBoolean(fields, 'ResolutionEngine.hasStakes', false),
        actionCount: readList(fields, 'ResolutionEngine.actionCount', ['a1']),
        mapStats: {
            USER: normalizeUserStat(fields.get('ResolutionEngine.mapStats.USER')),
            OPP: normalizeOppStat(fields.get('ResolutionEngine.mapStats.OPP')),
        },
        classifyHostilePhysicalIntent: readBoolean(fields, 'ResolutionEngine.classifyHostilePhysicalIntent', false),
        genStats: readCoreGroup(fields, 'ResolutionEngine.genStats'),
    };
    validateRelationshipCoverage(resolutionEngine, relationshipEngine);

    return {
        engineContext: {
            userCoreStats: readCoreGroup(fields, 'engineContext.getUserCoreStats'),
            trackerRelevantNPCs: trackerSnapshotToLedgerEntries(trackerSnapshot),
        },
        resolutionEngine,
        relationshipEngine,
        chaosSemantic: {
            sceneSummary: cleanScalar(fields.get('CHAOS_INTERRUPT.sceneSummary')) || '',
        },
        nameSemantic: {
            nameRequired: readBoolean(fields, 'NameGenerationEngine.nameRequired', false),
            explicitNameKnown: readBoolean(fields, 'NameGenerationEngine.explicitNameKnown', true),
            isLocation: readBoolean(fields, 'NameGenerationEngine.isLocation', false),
            seed: cleanScalar(fields.get('NameGenerationEngine.seed')) || '(none)',
            normalizeSeed: cleanScalar(fields.get('NameGenerationEngine.normalizeSeed')) || '(none)',
            detectMode: normalizeDetectMode(fields.get('NameGenerationEngine.detectMode')),
            generatedName: cleanScalar(fields.get('NameGenerationEngine.generatedName')) || '(none)',
        },
        proactivitySemantic: {
            cap: clampNumber(readNumber(fields, 'NPCProactivityEngine.cap', 1), 1, 3),
        },
    };
}

function trackerSnapshotToLedgerEntries(trackerSnapshot) {
    return Object.entries(trackerSnapshot || {}).map(([NPC, entry]) => ({
        NPC,
        currentDisposition: entry?.currentDisposition
            ? `B${entry.currentDisposition.B}/F${entry.currentDisposition.F}/H${entry.currentDisposition.H}`
            : null,
        currentRapport: Number(entry?.currentRapport ?? 0),
        rapportEncounterLock: entry?.rapportEncounterLock === 'Y' ? 'Y' : 'N',
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(entry?.intimacyGate) ? entry.intimacyGate : 'SKIP',
        currentCoreStats: entry?.currentCoreStats
            ? readCoreObject(entry.currentCoreStats)
            : { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 },
    }));
}

function validateRelationshipCoverage(resolutionEngine, relationshipEngine) {
    const requiredNames = [
        ...resolutionEngine.identifyTargets.ActionTargets,
        ...resolutionEngine.identifyTargets.OppTargets.NPC,
        ...resolutionEngine.identifyTargets.BenefitedObservers,
        ...resolutionEngine.identifyTargets.HarmedObservers,
    ].filter(name => name && !isNoneValue(name));
    const relationshipNames = new Set(relationshipEngine.map(item => normalizeNameKey(item.NPC)));
    const missing = requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
    if (missing.length) {
        throw new Error(`compact ledger missing RelationshipEngine entry for target/observer names: ${missing.join(', ')}`);
    }
}

function readCoreGroup(fields, prefix) {
    return {
        Rank: normalizeRank(fields.get(`${prefix}.Rank`)),
        MainStat: normalizeMainStat(fields.get(`${prefix}.MainStat`)),
        PHY: clampNumber(readNumber(fields, `${prefix}.PHY`, 1), 1, 10),
        MND: clampNumber(readNumber(fields, `${prefix}.MND`, 1), 1, 10),
        CHA: clampNumber(readNumber(fields, `${prefix}.CHA`, 1), 1, 10),
    };
}

function readCoreObject(value) {
    return {
        Rank: normalizeRank(value?.Rank),
        MainStat: normalizeMainStat(value?.MainStat),
        PHY: clampNumber(Number(value?.PHY ?? 1), 1, 10),
        MND: clampNumber(Number(value?.MND ?? 1), 1, 10),
        CHA: clampNumber(Number(value?.CHA ?? 1), 1, 10),
    };
}

function readBoolean(fields, key, fallback) {
    return toBoolean(fields.get(key), fallback);
}

function readNumber(fields, key, fallback) {
    const number = Number(String(fields.get(key) ?? '').trim());
    return Number.isFinite(number) ? number : fallback;
}

function readList(fields, key, fallback = []) {
    const value = cleanScalar(fields.get(key));
    if (!value || isNoneValue(value)) return fallback;
    return value
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(/[;,]/)
        .map(cleanScalar)
        .filter(item => item && !isNoneValue(item));
}

function cleanScalar(value) {
    return String(value ?? '')
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
}

function isNoneValue(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === '(none)' || text === 'none' || text === 'null' || text === 'n/a';
}

function normalizeRank(value) {
    const text = cleanScalar(value).toLowerCase();
    const map = { weak: 'Weak', average: 'Average', trained: 'Trained', elite: 'Elite', boss: 'Boss', none: 'none' };
    return map[text] || 'none';
}

function normalizeMainStat(value) {
    const text = cleanScalar(value).toLowerCase();
    const map = { phy: 'PHY', mnd: 'MND', cha: 'CHA', balanced: 'Balanced', none: 'none' };
    return map[text] || 'none';
}

function normalizeUserStat(value) {
    const text = cleanScalar(value).toUpperCase();
    return ['PHY', 'MND', 'CHA'].includes(text) ? text : 'PHY';
}

function normalizeOppStat(value) {
    const text = cleanScalar(value).toUpperCase();
    return ['PHY', 'MND', 'CHA', 'ENV'].includes(text) ? text : 'ENV';
}

function normalizeStakeChangeValue(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['benefit', 'harm', 'none'].includes(text) ? text : 'none';
}

function normalizeIntimacyAdvance(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['physical', 'verbal', 'none'].includes(text) ? text : 'none';
}

function normalizeDetectMode(value) {
    const text = cleanScalar(value).toLowerCase();
    if (text === 'person') return 'PERSON';
    if (text === 'location') return 'LOCATION';
    return 'none';
}

function normalizeNameKey(name) {
    return cleanScalar(name).toLowerCase();
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function normalizeLedger(ledger) {
    ledger.engineContext = ledger.engineContext || {};
    ledger.engineContext.userCoreStats = normalizeCore(ledger.engineContext.userCoreStats);
    ledger.engineContext.trackerRelevantNPCs = Array.isArray(ledger.engineContext.trackerRelevantNPCs)
        ? ledger.engineContext.trackerRelevantNPCs
        : [];
    ledger.resolutionEngine = ledger.resolutionEngine || {};
    ledger.resolutionEngine.identifyGoal = ledger.resolutionEngine.identifyGoal || 'Normal_Interaction';
    ledger.resolutionEngine.identifyChallenge = ledger.resolutionEngine.identifyChallenge || ledger.resolutionEngine.explicitMeans || ledger.resolutionEngine.identifyGoal;
    ledger.resolutionEngine.intimacyAdvance = normalizeIntimacyAdvance(ledger.resolutionEngine.intimacyAdvance);
    ledger.resolutionEngine.identifyTargets = ledger.resolutionEngine.identifyTargets || {};
    ledger.resolutionEngine.identifyTargets.OppTargets = ledger.resolutionEngine.identifyTargets.OppTargets || {};
    ledger.resolutionEngine.actionCount = normalizeActionMarkers(ledger.resolutionEngine.actionCount);
    ledger.resolutionEngine.mapStats = ledger.resolutionEngine.mapStats || {};
    ledger.resolutionEngine.hasStakes = toBoolean(ledger.resolutionEngine.hasStakes, false);
    ledger.resolutionEngine.classifyHostilePhysicalIntent = toBoolean(ledger.resolutionEngine.classifyHostilePhysicalIntent, false);
    delete ledger.resolutionEngine.hostilePhysicalIntent;
    delete ledger.resolutionEngine.primaryOppTarget;
    delete ledger.resolutionEngine.primaryOpposition;
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
    if (!ledger.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!['none', 'physical', 'verbal'].includes(ledger.resolutionEngine?.intimacyAdvance)) missing.push('resolutionEngine.intimacyAdvance');
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
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger.nameSemantic) missing.push('nameSemantic');
    if (!ledger.proactivitySemantic) missing.push('proactivitySemantic');

    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

function toBoolean(value, fallback) {
    const text = String(value ?? '').trim().toLowerCase();
    if (value === true || text === 'y' || text === 'yes' || text === 'true') return true;
    if (value === false || text === 'n' || text === 'no' || text === 'false') return false;
    return fallback;
}

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
