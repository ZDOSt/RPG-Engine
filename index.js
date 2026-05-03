import { ENGINE_PROMPT_TEXT } from './engines.js';
import { PRE_FLIGHT_PROMPT_TEXT } from './pre-flight.js';

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
        PRE_FLIGHT_PROMPT_TEXT,
        EXTENSION_PROMPT_TYPES.IN_CHAT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function () {
    injectEngines();
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
