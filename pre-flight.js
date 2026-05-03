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
        'Length target: 80-140 words unless the scene requires less.',
        'RESULT=' + compact.result,
        'ACTIONS=' + compact.actions,
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
        `${name}/${value.ReactionOutcome}/margin:${value.Margin}`,
    ).join(';') || 'none';
    const aggressionGuide = aggressionText === 'none'
        ? buildNoAggressionGuide(resolution, handoff)
        : 'Narrate the listed NPC follow-up physical action/result after the user action; do not ignore it.';

    const goal = resolution.GOAL ?? 'normal';
    const result = handoff.resultLine ?? `${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}`;

    return {
        result,
        actions: list(resolution.actions),
        npc: npcText,
        chaos: chaosText,
        proactive: proactiveText,
        aggression: aggressionText,
        aggressionGuide,
        guide: `${goal}; outcome:${resolution.OutcomeTier ?? 'NONE'}/${resolution.Outcome ?? 'no_roll'}; consent:${resolution.IntimacyConsent ?? 'N'}; targets:${list(resolution.ActionTargets)}; denied intimacy means refusal/boundary regardless of roll; narrate the scene now.`,
    };
}

function buildNoAggressionGuide(resolution, handoff) {
    const hasAggressiveProactivity = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && value?.TargetsUser === 'Y'
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL'].includes(value?.Intent));

    if (!hasAggressiveProactivity) return 'none';
    if (resolution.CounterPotential === 'none') {
        return 'CounterPotential is none: do not narrate an NPC counter-hit. Show stance, threat, guard, withdrawal, boundary, or preparation instead.';
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
