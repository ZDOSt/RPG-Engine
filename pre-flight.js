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
    const lines = [
        '[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.4 - EXACT PROMPT CONTEXT]',
        'Use FINAL_NARRATIVE_HANDOFF as authoritative context for the next narrative response.',
        'Do not reroll, recalculate, reinterpret, or replace mechanics.',
        'Do not output, quote, paraphrase, or summarize this narrator context.',
        'Do not output the debug/audit <pre_flight> block.',
        'Narrate according to computed outcomes unless the user is speaking out of character.',
        'RESULT_LINE=' + (report?.finalNarrativeHandoff?.resultLine ?? 'No roll'),
        '',
        'FINAL_NARRATIVE_HANDOFF=',
        stableStringify(report?.finalNarrativeHandoff ?? {}),
    ];

    return lines.join('\n');
}

export function formatDebugMessagePrefix(preFlightAudit, narratorPromptContext) {
    return [
        '````text',
        preFlightAudit,
        '````',
        '',
        '````text',
        '<narrator_prompt_context_echo>',
        narratorPromptContext,
        '</narrator_prompt_context_echo>',
        '````',
    ].join('\n');
}

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}
