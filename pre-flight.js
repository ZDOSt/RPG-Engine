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
    const lines = [
        '<pre_flight>',
        '[STRUCTURED_PREFLIGHT_RUNTIME v0.4 - COMPUTED DEBUG / AUDIT ONLY]',
        'DO NOT EXECUTE THIS BLOCK.',
        'Do not output, quote, paraphrase, reroll, recalculate, reinterpret, or replace this audit block.',
        'The extension prepends this exact computed block to the final assistant message after generation.',
        'This is a debug/audit report of already-computed engine outputs.',
        'Use FINAL_NARRATIVE_HANDOFF as authoritative context.',
        '==COMPUTED OUTPUTS==',
        '',
        ...report.auditLines,
        '',
        'FINAL_NARRATIVE_HANDOFF=',
        stableStringify(report.finalNarrativeHandoff),
        '</pre_flight>',
    ];

    return lines.join('\n');
}

export function formatNarratorPromptContext(report) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const compact = buildNarratorSummary(handoff, resolution);

    const lines = [
        '[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.6 - MINIMAL AUTHORITATIVE]',
        'Use this mechanics summary. Do not reroll or expose mechanics unless OOC.',
        'Write final narration immediately. No analysis. Final message must be non-empty.',
        'Never narrate voluntary {{user}} actions, counterattacks, thoughts, feelings, decisions, or dialogue beyond the explicit user input.',
        'Involuntary reflexive physical reactions caused directly by computed external impact/restraint are allowed; keep them immediate/passive and do not turn them into choices, tactics, counters, or dialogue.',
        'Length target: 80-140 words unless the scene requires less.',
        'RESULT=' + compact.result,
        'ACTIONS=' + compact.actions,
        'COUNTER=' + compact.counter,
        'NPC=' + compact.npc,
        'CHAOS=' + compact.chaos,
        'PROACTIVE=' + compact.proactive,
        'AGGRESSION=' + compact.aggression,
        'AGGRESSION_GUIDE=' + compact.aggressionGuide,
        'GUIDE=' + compact.guide,
    ];

    return lines.join('\n');
}

function buildNarratorSummary(handoff, resolution) {
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

    const proactiveText = Object.entries(handoff.proactivityResults ?? {}).map(([name, value]) => [
        name,
        value.Proactive,
        value.Intent,
        value.Impulse,
        `targetsUser:${value.TargetsUser}`,
    ].join('/')).join(';') || 'none';

    const aggressionText = Object.entries(handoff.aggressionResults ?? {}).map(([name, value]) =>
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}`,
    ).join(';') || 'none';
    const aggressionGuide = aggressionText === 'none'
        ? buildNoAggressionGuide(resolution, handoff)
        : buildAggressionGuide(handoff.aggressionResults);

    const goal = resolution.GOAL ?? 'normal';
    const result = handoff.resultLine ?? `${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}`;

    return {
        result,
        actions: list(resolution.actions),
        counter: resolution.CounterPotential ?? 'none',
        npc: npcText,
        chaos: chaosText,
        proactive: proactiveText,
        aggression: aggressionText,
        aggressionGuide,
        guide: `${goal}; outcome:${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}; consent:${resolution.IntimacyConsent ?? 'N'}; targets:${list(resolution.ActionTargets)}; denied intimacy means refusal/boundary regardless of roll; narrate the scene now.`,
    };
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

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}

function list(value) {
    return Array.isArray(value) ? value.join(',') : String(value ?? 'none');
}
