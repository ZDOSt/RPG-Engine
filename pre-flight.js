export function formatPreFlightPending() {
    return String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - AUDIT ONLY]
DO NOT EXECUTE THIS BLOCK.
No computed handoff is available yet. The extension will replace this with a computed audit block immediately before generation.
</pre_flight>`;
}

export function formatNarratorPromptPending() {
    return String.raw`[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.4 - PENDING]
No computed handoff is available yet.
Narrate normally.`;
}

export function formatPreFlightError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - AUDIT ONLY]
DO NOT EXECUTE THIS BLOCK.
The deterministic pre-flight runner failed before narration.
ERROR=${message}
</pre_flight>`;
}

export function formatNarratorPromptError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return String.raw`[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.4 - ERROR]
The deterministic pre-flight runner failed before narration.
ERROR=${message}
Narrate normally from available chat context.`;
}

export function formatPreFlightDebug(report) {
    const semanticLedger = buildReadableSemanticDebug(report?.semanticLedger ?? {});
    const deterministic = buildReadableDeterministicDebug(report?.finalNarrativeHandoff ?? {});

    const lines = [
        '<pre_flight>',
        '[STRUCTURED_PREFLIGHT_RUNTIME v0.9 - SIMPLE DEBUG]',
        'DO NOT EXECUTE THIS BLOCK.',
        'This shows model-filled semantic fields, then deterministic engine decisions.',
        'Use the narrator prompt context echo below as the final authoritative narration handoff.',
        '==MODEL_FILLED_FIELDS==',
        '',
        ...semanticLedger,
        '',
        '==DETERMINISTIC_ENGINE_OUTPUT==',
        '',
        ...deterministic,
        '</pre_flight>',
    ];

    return lines.join('\n');
}

function buildReadableSemanticDebug(ledger) {
    const resolution = ledger?.resolutionEngine ?? {};
    const targets = resolution.identifyTargets ?? {};
    const oppTargets = targets.OppTargets ?? {};
    const relationships = Array.isArray(ledger?.relationshipEngine) ? ledger.relationshipEngine : [];
    const chaos = ledger?.chaosSemantic ?? {};
    const name = ledger?.nameSemantic ?? {};
    const proactivity = ledger?.proactivitySemantic ?? {};
    const userCore = ledger?.engineContext?.userCoreStats ?? {};
    const trackerNpcs = Array.isArray(ledger?.engineContext?.trackerRelevantNPCs)
        ? ledger.engineContext.trackerRelevantNPCs
        : [];

    const lines = [
        'engineContext.userCoreStats=' + inline({
            PHY: userCore.PHY ?? 1,
            MND: userCore.MND ?? 1,
            CHA: userCore.CHA ?? 1,
        }),
        'engineContext.trackerRelevantNPCs=' + (trackerNpcs.map(npc => [
            npc.NPC ?? '(none)',
            npc.currentDisposition ?? 'null',
            `rapport:${npc.currentRapport ?? 0}`,
            `gate:${npc.intimacyGate ?? 'SKIP'}`,
        ].join('/')).join('; ') || 'none'),
        '',
        'ResolutionEngine:',
        'identifyGoal=' + valueOrNone(resolution.identifyGoal),
        'identifyChallenge=' + valueOrNone(resolution.identifyChallenge),
        'intimacyAdvance=' + valueOrNone(resolution.intimacyAdvance),
        'explicitMeans=' + valueOrNone(resolution.explicitMeans),
        'identifyTargets:',
        'ActionTargets=' + list(targets.ActionTargets),
        'OppTargets.NPC=' + list(oppTargets.NPC),
        'OppTargets.ENV=' + list(oppTargets.ENV),
        'BenefitedObservers=' + list(targets.BenefitedObservers),
        'HarmedObservers=' + list(targets.HarmedObservers),
        'hasStakes=' + String(Boolean(resolution.hasStakes)),
        'actionCount=' + list(resolution.actionCount),
        'mapStats=' + inline(resolution.mapStats ?? {}),
        'classifyHostilePhysicalIntent=' + String(Boolean(resolution.classifyHostilePhysicalIntent)),
        'genStats=' + coreLine(resolution.genStats),
        '',
        'RelationshipEngine:',
        relationships.length ? '' : 'none',
        ...relationships.flatMap((item, index) => [
            `NPC[${index}]=${valueOrNone(item.NPC)}`,
            `relevant=${Boolean(item.relevant)}`,
            `initFlags=${inline(item.initFlags ?? {})}`,
            `newEncounterExplicit=${Boolean(item.newEncounterExplicit)}`,
            `explicitIntimidationOrCoercion=${Boolean(item.explicitIntimidationOrCoercion)}`,
            `stakeChangeByOutcome=${inline(item.stakeChangeByOutcome ?? {})}`,
            `overrideFlags=${inline(item.overrideFlags ?? {})}`,
            `genStats=${coreLine(item.genStats)}`,
            '',
        ]),
        '',
        'chaosSemantic.sceneSummary=' + valueOrNone(chaos.sceneSummary),
        'nameSemantic=' + inline(name),
        'proactivitySemantic=' + inline(proactivity),
    ];

    return lines;
}

function buildReadableDeterministicDebug(handoff) {
    const resolution = handoff?.resolutionPacket ?? {};
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const chaos = handoff?.chaosHandoff?.CHAOS ?? {};
    const proactivity = handoff?.proactivityResults ?? {};
    const aggression = handoff?.aggressionResults ?? {};

    return [
        'resolutionPacket.GOAL=' + valueOrNone(resolution.GOAL),
        'resolutionPacket.IntimacyConsent=' + valueOrNone(resolution.IntimacyConsent),
        'resolutionPacket.STAKES=' + valueOrNone(resolution.STAKES),
        'resolutionPacket.actions=' + list(resolution.actions),
        'resolutionPacket.OutcomeTier=' + valueOrNone(resolution.OutcomeTier),
        'resolutionPacket.Outcome=' + valueOrNone(resolution.Outcome),
        'resolutionPacket.LandedActions=' + valueOrNone(resolution.LandedActions),
        'resolutionPacket.CounterPotential=' + valueOrNone(resolution.CounterPotential),
        'resolutionPacket.classifyHostilePhysicalIntent=' + valueOrNone(resolution.classifyHostilePhysicalIntent),
        'resolutionPacket.ActionTargets=' + list(resolution.ActionTargets),
        'resolutionPacket.OppTargets.NPC=' + list(resolution.OppTargets?.NPC),
        'resolutionPacket.OppTargets.ENV=' + list(resolution.OppTargets?.ENV),
        'resolutionPacket.BenefitedObservers=' + list(resolution.BenefitedObservers),
        'resolutionPacket.HarmedObservers=' + list(resolution.HarmedObservers),
        'resolutionPacket.NPCInScene=' + list(resolution.NPCInScene),
        'resultLine=' + valueOrNone(handoff?.resultLine),
        '',
        'npcHandoffs=' + (npcs.length ? '' : 'none'),
        ...npcs.flatMap((npc, index) => [
            `npcHandoffs[${index}].NPC=${valueOrNone(npc.NPC)}`,
            `npcHandoffs[${index}].FinalState=${valueOrNone(npc.FinalState)}`,
            `npcHandoffs[${index}].Lock=${valueOrNone(npc.Lock)}`,
            `npcHandoffs[${index}].Behavior=${valueOrNone(npc.Behavior)}`,
            `npcHandoffs[${index}].Target=${valueOrNone(npc.Target)}`,
            `npcHandoffs[${index}].NPC_STAKES=${valueOrNone(npc.NPC_STAKES)}`,
            `npcHandoffs[${index}].IntimacyGate=${valueOrNone(npc.IntimacyGate)}`,
            `npcHandoffs[${index}].RelationToUserAction=${inline(npc.RelationToUserAction ?? {})}`,
            `npcHandoffs[${index}].PressureMode=${valueOrNone(npc.PressureMode)}`,
        ]),
        '',
        'chaosHandoff=' + inline({
            triggered: Boolean(chaos.triggered),
            band: chaos.band ?? 'None',
            magnitude: chaos.magnitude ?? 'None',
            anchor: chaos.anchor ?? 'None',
            vector: chaos.vector ?? 'None',
        }),
        'proactivityResults=' + inline(formatProactivityForNarration(proactivity)),
        'aggressionResults=' + inline(aggression),
        'trackerUpdate=' + inline(handoff?.sceneTrackerUpdate ?? {}),
    ];
}

export function formatNarratorPromptContext(report) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const summary = buildNarratorSummary(handoff, resolution, report?.semanticLedger ?? {});

    const lines = [
        '[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.6 - MINIMAL AUTHORITATIVE]',
        'Use this mechanics summary. Do not reroll or expose mechanics unless OOC.',
        'Write final narration immediately. No analysis. Final message must be non-empty.',
        'The GUIDE is mandatory and authoritative; follow it exactly when interpreting success, denial, proactivity, and aggression.',
        'For intimacy, IntimacyGate=DENY means no cooperation, reciprocation, or compliance even when the roll succeeds.',
        'Never narrate voluntary {{user}} actions, counterattacks, thoughts, feelings, decisions, or dialogue beyond the explicit user input.',
        'Involuntary reflexive physical reactions caused directly by computed external impact/restraint are allowed; keep them immediate/passive and do not turn them into choices, tactics, counters, or dialogue.',
        'Length target: 80-140 words unless the scene requires less.',
        '',
        'User Actions: ' + summary.userAction,
        'Result: ' + summary.result,
        'Action Count: ' + summary.actions,
        'Stakes: ' + summary.stakes,
        'Intimacy Consent: ' + summary.consent,
        'Targets: ' + summary.targets,
        'Counter Potential: ' + summary.counter,
        'NPC State: ' + summary.npc,
        'Chaos: ' + summary.chaos,
        'Proactivity: ' + summary.proactive,
        'Aggression: ' + summary.aggression,
        'Aggression Guide: ' + summary.aggressionGuide,
        'GUIDE=' + summary.guide,
    ];

    return lines.join('\n');
}

function buildNarratorSummary(handoff, resolution, ledger = {}) {
    const semanticResolution = ledger?.resolutionEngine ?? {};
    const userAction = readableActionDescription(semanticResolution, resolution);
    const npcText = (handoff.npcHandoffs ?? []).map(h => [
        h.NPC,
        h.FinalState,
        h.Behavior,
        h.Target,
        `gate:${h.IntimacyGate}`,
        `stakes:${h.NPC_STAKES}`,
        `landed:${h.Landed}`,
        `pressure:${h.HostilePressure ?? 0}/${h.HostileLandedPressure ?? 0}/${h.DominantLock ?? 'None'}/${h.PressureMode ?? 'none'}`,
    ].join('/')).join(';') || 'none';

    const chaos = handoff.chaosHandoff?.CHAOS ?? {};
    const chaosText = chaos.triggered
        ? `${chaos.band}/${chaos.magnitude}/${chaos.anchor}/${chaos.vector}`
        : 'none';

    const proactiveText = Object.entries(formatProactivityForNarration(handoff.proactivityResults ?? {}))
        .filter(([, value]) => value?.Proactive === 'Y')
        .map(([name, value]) => [
            `${name}: ${value.Intent}`,
            `impulse:${value.Impulse}`,
            `triggersAggressionRoll:${value.triggersAggressionRoll}`,
        ].join('/')).join(';') || 'none';

    const aggressionText = Object.entries(handoff.aggressionResults ?? {}).map(([name, value]) =>
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}`,
    ).join(';') || 'none';
    const aggressionGuide = aggressionText === 'none'
        ? buildNoAggressionGuide(resolution, handoff)
        : buildAggressionGuide(handoff.aggressionResults);

    const result = handoff.resultLine ?? `${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}`;
    const guide = buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, chaosText, aggressionText });

    return {
        userAction,
        result,
        actions: list(resolution.actions),
        stakes: resolution.STAKES ?? 'N',
        consent: intimacyConsentSummary(resolution),
        targets: targetSummary(resolution),
        counter: resolution.CounterPotential ?? 'none',
        npc: npcText,
        chaos: chaosText,
        proactive: proactiveText,
        aggression: aggressionText,
        aggressionGuide,
        guide,
    };
}

function readableActionDescription(semanticResolution, resolution) {
    const challenge = valueOrNone(semanticResolution.identifyChallenge);
    if (challenge !== '(none)') return challenge;
    const explicit = valueOrNone(semanticResolution.explicitMeans);
    if (explicit !== '(none)') return explicit;
    const goal = valueOrNone(resolution.GOAL);
    const targets = list(resolution.ActionTargets);
    return targets && targets !== 'none' ? `${goal} toward ${targets}` : goal;
}

function targetSummary(resolution) {
    const parts = [];
    const actionTargets = list(resolution.ActionTargets);
    const oppNpc = list(resolution.OppTargets?.NPC);
    const oppEnv = list(resolution.OppTargets?.ENV);
    const benefited = list(resolution.BenefitedObservers);
    const harmed = list(resolution.HarmedObservers);
    if (!isNoneText(actionTargets)) parts.push(`action:${actionTargets}`);
    if (!isNoneText(oppNpc)) parts.push(`opposes:${oppNpc}`);
    if (!isNoneText(oppEnv)) parts.push(`env:${oppEnv}`);
    if (!isNoneText(benefited)) parts.push(`benefits:${benefited}`);
    if (!isNoneText(harmed)) parts.push(`harms:${harmed}`);
    return parts.join('; ') || 'none';
}

function buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, chaosText, aggressionText }) {
    const goal = resolution.GOAL ?? 'normal';
    const outcome = `${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}`;
    const primaryNpc = handoff.npcHandoffs?.[0];
    const npcName = primaryNpc?.NPC || list(resolution.ActionTargets) || 'the NPC';
    const state = primaryNpc ? `${primaryNpc.Behavior}/${primaryNpc.Target}` : npcText;
    const gate = strongestIntimacyGate(handoff, resolution);
    const isIntimacyAdvance = goal === 'IntimacyAdvancePhysical' || goal === 'IntimacyAdvanceVerbal';
    const intimacyDenied = isIntimacyAdvance
        && (resolution.IntimacyConsent !== 'Y' || gate === 'DENY');
    const intimacyAllowed = isIntimacyAdvance
        && !intimacyDenied
        && (resolution.IntimacyConsent === 'Y' || resolution.STAKES === 'N' || gate === 'ALLOW');
    const chaosNote = chaosText !== 'none' ? ' Include the listed chaos beat without changing that gate result.' : '';
    const aggressionNote = aggressionText !== 'none'
        ? ' Then narrate the listed NPC attack result exactly and stop at the aggression guide boundary.'
        : '';
    const proactiveNote = aggressionText === 'none' && proactiveText !== 'none'
        ? ' Then let the listed proactive NPC action happen only as denial, boundary, refusal, retreat, resistance, or escalation consistent with the gate.'
        : '';

    if (intimacyDenied) {
        if (goal === 'IntimacyAdvancePhysical') {
            return `The user action is ${userAction}; resolve it as ${outcome}. IntimacyGate=DENY: any successful physical attempt may land or create contact/positioning, but ${npcName} does not cooperate, reciprocate, or become willing; narrate rejection, recoil, pushing away, rebuke, resistance, flight, or escalation according to ${state}.${aggressionNote}${proactiveNote}${chaosNote}`;
        }
        return `The user action is ${userAction}; resolve it as ${outcome}. IntimacyGate=DENY: any successful verbal attempt may affect ${npcName}, but the request is refused; narrate a boundary, rebuke, annoyance, anger, fear, or refusal according to ${state}, never compliance with the intimacy request.${aggressionNote}${proactiveNote}${chaosNote}`;
    }

    if (aggressionText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}, then narrate the listed NPC attack result. Stop at the aggression guide boundary and do not invent any user follow-up.`;
    }

    if (proactiveText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}. Then let the listed proactive NPC action happen naturally without treating triggersAggressionRoll:N as "not directed at the user."`;
    }

    if (isIntimacyAdvance) {
        const gateText = intimacyAllowed
            ? `${npcName} may receive it according to the current gate and relationship state`
            : `${npcName} refuses or sets a boundary because the intimacy gate is not allowing it`;
        return `The user action is ${userAction}; resolve it as ${outcome}. ${gateText}.${chaosNote}`;
    }

    if (resolution.STAKES === 'N') {
        const chaosNote = chaosText !== 'none' ? ' and include the listed chaos beat as a brief scene event' : '';
        return `The user action is ${userAction}; no roll is needed. Keep ${npcName}'s response consistent with ${state}, with no invented hostility or extra mechanics${chaosNote}.`;
    }

    if (chaosText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}. Include the listed chaos beat while keeping NPC state anchored to ${state}.`;
    }

    return `The user action is ${userAction}; resolve it as ${outcome}. Narrate the NPC response according to ${state} and the listed targets.`;
}

function strongestIntimacyGate(handoff, resolution) {
    const targets = toComparableSet(resolution?.ActionTargets);
    const targetHandoffs = (handoff?.npcHandoffs ?? []).filter(h => targets.has(String(h?.NPC ?? '').toLowerCase()));
    const relevantHandoffs = targetHandoffs.length ? targetHandoffs : (handoff?.npcHandoffs ?? []);
    const gates = relevantHandoffs.map(h => h?.IntimacyGate);
    if (gates.includes('DENY')) return 'DENY';
    if (gates.includes('ALLOW')) return 'ALLOW';
    return gates.find(Boolean) || 'SKIP';
}

function toComparableSet(value) {
    const items = Array.isArray(value) ? value : [value];
    return new Set(items
        .map(item => String(item ?? '').trim())
        .filter(item => !isNoneText(item))
        .map(item => item.toLowerCase()));
}

function intimacyConsentSummary(resolution) {
    if (resolution.GOAL !== 'IntimacyAdvancePhysical' && resolution.GOAL !== 'IntimacyAdvanceVerbal') return 'not applicable';
    return resolution.IntimacyConsent ?? 'N';
}

function formatProactivityForNarration(proactivity) {
    const formatted = {};
    for (const [name, value] of Object.entries(proactivity ?? {})) {
        formatted[name] = {
            Proactive: value?.Proactive ?? 'N',
            Intent: value?.Intent ?? 'NONE',
            Impulse: value?.Impulse ?? 'NONE',
            triggersAggressionRoll: value?.TargetsUser === 'Y' ? 'Y' : 'N',
            ProactivityTier: value?.ProactivityTier,
            ProactivityDie: value?.ProactivityDie,
            Threshold: value?.Threshold,
        };
    }
    return formatted;
}

function buildAggressionGuide(aggressionResults) {
    const parts = Object.entries(aggressionResults ?? {}).map(([name, value]) => {
        const attackType = value.AttackType === 'Retaliation'
            ? 'retaliation after the user action'
            : value.AttackType === 'CounterAttack'
                ? `counterattack exploiting the opening (${value.CounterPotential}+${value.CounterBonus})`
                : 'immediate NPC attack';
        if (value.ReactionOutcome === 'npc_overpowers') {
            return `${name}: ${attackType} strongly succeeds/overpowers; narrate clear NPC advantage. Do not narrate any follow-up action or dialogue by {{user}}.`;
        }
        if (value.ReactionOutcome === 'npc_succeeds') {
            return `${name}: ${attackType} succeeds modestly; narrate proportional effect. Do not narrate any follow-up action or dialogue by {{user}}.`;
        }
        if (value.ReactionOutcome === 'stalemate') {
            return `${name}: ${attackType} meets equal resistance; narrate a cinematic stalemate, clash, bind, or struggle. Stop in the deadlock. Do not narrate {{user}}'s counterattack, choices, thoughts, feelings, or dialogue.`;
        }
        if (value.ReactionOutcome === 'user_resists') {
            return `${name}: ${attackType} is partly resisted; stop at the moment of impact/contact/near-contact. Do not narrate {{user}}'s counterattack, actions, reactions, thoughts, feelings, or dialogue.`;
        }
        if (value.ReactionOutcome === 'user_dominates') {
            return `${name}: ${attackType} fails or is controlled/evaded; stop at the moment of failed impact/contact/near-contact. Do not narrate {{user}}'s counterattack, actions, reactions, thoughts, feelings, or dialogue.`;
        }
        return `${name}: use listed aggression result exactly.`;
    });

    return parts.join(' ');
}

function buildNoAggressionGuide(resolution, handoff) {
    const hasAggressiveProactivity = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && value?.TargetsUser === 'Y'
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value?.Intent));

    if (!hasAggressiveProactivity) return 'none';
    if (resolution.OutcomeTier === 'Critical_Success') {
        return 'Critical user success: do not narrate an immediate NPC attack. Show only survival, pain, guard, stagger, retreat, or failed preparation.';
    }

    return 'No aggression result was produced; do not invent a resolved NPC hit.';
}

export function formatDebugMessagePrefix(preFlightAudit, narratorPromptContext) {
    return [
        '````text',
        escapeReasoningTagsForDisplay(preFlightAudit),
        '````',
        '',
        '````text',
        '<narrator_prompt_context_echo>',
        narratorPromptContext,
        '</narrator_prompt_context_echo>',
        '````',
    ].join('\n');
}

function escapeReasoningTagsForDisplay(value) {
    return String(value)
        .replaceAll('<pre_flight>', '&lt;pre_flight&gt;')
        .replaceAll('</pre_flight>', '&lt;/pre_flight&gt;');
}

function inline(value) {
    return JSON.stringify(value ?? {});
}

function valueOrNone(value) {
    const text = String(value ?? '').trim();
    return text || '(none)';
}

function coreLine(core) {
    if (!core) return '{}';
    return inline({
        Rank: core.Rank ?? 'none',
        MainStat: core.MainStat ?? 'none',
        PHY: core.PHY ?? 1,
        MND: core.MND ?? 1,
        CHA: core.CHA ?? 1,
    });
}

function list(value) {
    return Array.isArray(value) ? value.join(',') : String(value ?? 'none');
}

function isNoneText(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === 'none' || text === '(none)' || text === 'null';
}
