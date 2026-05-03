import { ENGINE_PROMPT_TEXT } from './engines.js';
import { formatPreFlightDebug, formatPreFlightError, formatPreFlightPending } from './pre-flight.js';
import { extractSemanticLedger } from './semantic-extractor.js';
import { buildTrackerSnapshot, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';

const EXTENSION_NAME = 'Structured Preflight Engines';
const ENGINE_PROMPT_KEY = 'structured_preflight_engines';
const PRE_FLIGHT_PROMPT_KEY = 'structured_preflight_runtime';

const EXTENSION_PROMPT_TYPES = Object.freeze({
    IN_PROMPT: 0,
    IN_CHAT: 1,
});

const EXTENSION_PROMPT_ROLES = Object.freeze({
    SYSTEM: 0,
});

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function injectEngines() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        console.warn(`[${EXTENSION_NAME}] SillyTavern context is not ready; engine prompt was not injected.`);
        return;
    }

    context.setExtensionPrompt(
        ENGINE_PROMPT_KEY,
        ENGINE_PROMPT_TEXT,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );

    context.setExtensionPrompt(
        PRE_FLIGHT_PROMPT_KEY,
        formatPreFlightPending(),
        EXTENSION_PROMPT_TYPES.IN_CHAT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

function injectPreFlight(value) {
    const context = getContext();
    if (!context?.setExtensionPrompt) return;

    context.setExtensionPrompt(
        PRE_FLIGHT_PROMPT_KEY,
        value,
        EXTENSION_PROMPT_TYPES.IN_CHAT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

let runningSemanticPass = false;

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    injectEngines();

    if (runningSemanticPass) {
        return false;
    }

    const context = getContext();
    if (!context) {
        injectPreFlight(formatPreFlightError('SillyTavern context unavailable.'));
        return false;
    }

    try {
        runningSemanticPass = true;
        const trackerSnapshot = buildTrackerSnapshot(context);
        const semanticLedger = await extractSemanticLedger(context, coreChat, type, trackerSnapshot);
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, type);
        await saveTrackerUpdate(context, report.trackerUpdate);
        injectPreFlight(formatPreFlightDebug(report));
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] deterministic pre-flight failed`, error);
        injectPreFlight(formatPreFlightError(error));
    } finally {
        runningSemanticPass = false;
    }

    return false;
};

export function onDisable() {
    const context = getContext();
    if (context?.extensionPrompts) {
        delete context.extensionPrompts[ENGINE_PROMPT_KEY];
        delete context.extensionPrompts[PRE_FLIGHT_PROMPT_KEY];
    }
}

injectEngines();
