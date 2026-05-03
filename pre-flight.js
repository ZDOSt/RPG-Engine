export function formatPreFlightPending() {
    return String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - AUDIT ONLY]
DO NOT EXECUTE THIS BLOCK.
No computed handoff is available yet. The extension will replace this with a computed audit block immediately before generation.
</pre_flight>`;
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

export function formatPreFlightDebug(report) {
    const lines = [
        '<pre_flight>',
        '[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - DEBUG ECHO / AUDIT ONLY]',
        'DO NOT EXECUTE THIS BLOCK.',
        'DEBUG MODE: OUTPUT THIS ENTIRE <pre_flight>...</pre_flight> AUDIT BLOCK VERBATIM BEFORE THE NARRATIVE RESPONSE.',
        'This is a debug/audit report of already-computed engine outputs.',
        'Use FINAL_NARRATIVE_HANDOFF as authoritative context.',
        'Do not reroll, recalculate, reinterpret, or replace mechanics.',
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

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}
