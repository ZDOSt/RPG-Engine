export const MODULE_NAME = 'third-party/rp-engine-tracker';
export const METADATA_KEY = 'rp_engine_tracker';

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    injectHandoff: true,
    showPanel: true,
    panelCollapsed: false,
    panelPosition: null,
    responseLength: 1200,
    recentMessages: 8,
    resolverTimeoutMs: 60000,
    enableNpcArchive: true,
    npcArchiveWorld: '',
    scopeNpcArchivePerChat: true,
    autoCreateNpcArchive: true,
    pruneArchivedAbsentNpcs: true,
    rehydrateArchivedNpcs: true,
    autoRetireDeadNpcs: true,
    enableTimeTracking: true,
    timeScaleWorldMinutesPerRealMinute: 6,
    timeTrackingMaxRealMinutes: 30,
    enableCharacterCreator: true,
    autoOfferCharacterCreator: true,
});

export const DEFAULT_TRACKER = Object.freeze({
    version: 1,
    scene: {
        location: '',
        time: '',
        weather: '',
    },
    worldClock: {
        enabled: true,
        absoluteMinutes: null,
        lastRealTimestamp: null,
        scale: 6,
        lastAdvance: '',
        source: 'unset',
    },
    user: {
        name: '',
        condition: 'unknown',
        stats: { PHY: 3, MND: 3, CHA: 3 },
        gear: [],
        funds: '',
    },
    presentNpcIds: [],
    npcs: {},
    inventory: [],
    quests: [],
    pendingTasks: [],
    debts: [],
    schedule: [],
    nameState: {
        counter: 0,
        used: [],
        reserved: {
            person: [],
            male: [],
            female: [],
            neutral: [],
            location: [],
        },
    },
    lastAudit: null,
    lastAuditDisplay: null,
    characterCreator: {
        offered: false,
        completed: false,
        lastSheet: '',
    },
});

export const RESOLVER_SCHEMA = Object.freeze({
    name: 'rp_engine_resolution_relationship_v1',
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            ooc: { type: 'string', enum: ['Y', 'N'] },
            oocMode: { type: 'string', enum: ['IC', 'STOP', 'PROXY', 'MIXED'] },
            oocInstruction: { type: 'string' },
            goal: { type: 'string' },
            goalKind: { type: 'string', enum: ['Normal', 'IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'] },
            goalEvidence: { type: 'string' },
            decisiveAction: { type: 'string' },
            decisiveActionEvidence: { type: 'string' },
            outcomeOnSuccess: { type: 'string' },
            outcomeOnFailure: { type: 'string' },
            actionTargets: { type: 'array', items: { type: 'string' } },
            oppTargetsNpc: { type: 'array', items: { type: 'string' } },
            oppTargetsEnv: { type: 'array', items: { type: 'string' } },
            benefitedObservers: { type: 'array', items: { type: 'string' } },
            harmedObservers: { type: 'array', items: { type: 'string' } },
            npcInScene: { type: 'array', items: { type: 'string' } },
            hasStakes: { type: 'string', enum: ['Y', 'N'] },
            stakesEvidence: { type: 'string' },
            actionCount: { type: 'integer', minimum: 1, maximum: 3 },
            userStat: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
            userStatEvidence: { type: 'string' },
            oppStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
            oppStatEvidence: { type: 'string' },
            hostilePhysicalHarm: { type: 'string', enum: ['Y', 'N'] },
            newEncounter: { type: 'string', enum: ['Y', 'N'] },
            timeDeltaMinutes: { type: 'integer', minimum: -10080, maximum: 10080 },
            timeSkipReason: { type: 'string' },
            scene: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    location: { type: 'string' },
                    time: { type: 'string' },
                    weather: { type: 'string' },
                },
                required: ['location', 'time', 'weather'],
            },
            npcFacts: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: { type: 'string' },
                        aliases: { type: 'array', items: { type: 'string' } },
                        descriptor: { type: 'string' },
                        revealedFrom: { type: 'string' },
                        present: { type: 'boolean' },
                        position: { type: 'string' },
                        condition: { type: 'string' },
                        knowsUser: { type: 'string' },
                        explicitPreset: {
                            type: 'string',
                            enum: ['romanticOpen', 'userBadRep', 'userGoodRep', 'userNonHuman', 'neutralDefault', 'unknown'],
                        },
                        rank: { type: 'string', enum: ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'unknown'] },
                        mainStat: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'Balanced', 'unknown'] },
                        explicitStats: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                PHY: { type: 'integer', minimum: 1, maximum: 10 },
                                MND: { type: 'integer', minimum: 1, maximum: 10 },
                                CHA: { type: 'integer', minimum: 1, maximum: 10 },
                            },
                        },
                        override: {
                            type: 'string',
                            enum: ['Transactional', 'Hedonist', 'Exploitation', 'Established', 'NONE', 'unknown'],
                        },
                        archiveStatus: {
                            type: 'string',
                            enum: ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten', 'unknown'],
                        },
                    },
                    required: ['name', 'position', 'condition', 'knowsUser', 'explicitPreset', 'rank', 'mainStat', 'override'],
                },
            },
            inventoryDeltas: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['gain', 'lose', 'equip', 'unequip', 'use', 'damage'] },
                        item: { type: 'string' },
                        evidence: { type: 'string' },
                    },
                    required: ['action', 'item', 'evidence'],
                },
            },
            taskDeltas: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['add', 'complete', 'cancel'] },
                        task: { type: 'string' },
                        due: { type: 'string' },
                        source: { type: 'string' },
                        evidence: { type: 'string' },
                    },
                    required: ['action', 'task', 'due', 'source', 'evidence'],
                },
            },
        },
        required: [
            'ooc',
            'oocMode',
            'oocInstruction',
            'goal',
            'goalKind',
            'goalEvidence',
            'decisiveAction',
            'decisiveActionEvidence',
            'outcomeOnSuccess',
            'outcomeOnFailure',
            'actionTargets',
            'oppTargetsNpc',
            'oppTargetsEnv',
            'benefitedObservers',
            'harmedObservers',
            'npcInScene',
            'hasStakes',
            'stakesEvidence',
            'actionCount',
            'userStat',
            'userStatEvidence',
            'oppStat',
            'oppStatEvidence',
            'hostilePhysicalHarm',
            'newEncounter',
            'timeDeltaMinutes',
            'timeSkipReason',
            'scene',
            'npcFacts',
            'inventoryDeltas',
            'taskDeltas'
        ],
    },
});

const STAT_NAMES = ['PHY', 'MND', 'CHA'];

export function createTracker(existing = null) {
    const tracker = structuredClone(DEFAULT_TRACKER);
    if (existing && typeof existing === 'object') {
        deepMerge(tracker, existing);
    }
    tracker.user.name = cleanText(tracker.user.name);
    tracker.user.stats = sanitizeStats(tracker.user.stats, { PHY: 3, MND: 3, CHA: 3 }, 1, 10);
    tracker.worldClock = sanitizeClock(tracker.worldClock || tracker.scene.clock);
    delete tracker.scene.clock;
    tracker.presentNpcIds = Array.isArray(tracker.presentNpcIds) ? tracker.presentNpcIds : [];
    tracker.npcs = tracker.npcs && typeof tracker.npcs === 'object' ? tracker.npcs : {};
    for (const npc of Object.values(tracker.npcs)) {
        if (!npc || typeof npc !== 'object') continue;
        npc.aliases = cleanList(Array.isArray(npc.aliases) ? npc.aliases : []);
        npc.descriptor = cleanText(npc.descriptor);
        npc.revealedFrom = cleanText(npc.revealedFrom);
    }
    tracker.inventory = Array.isArray(tracker.inventory) ? tracker.inventory : [];
    tracker.quests = Array.isArray(tracker.quests) ? tracker.quests : [];
    tracker.pendingTasks = Array.isArray(tracker.pendingTasks) ? tracker.pendingTasks : [];
    tracker.debts = Array.isArray(tracker.debts) ? tracker.debts : [];
    tracker.schedule = Array.isArray(tracker.schedule) ? tracker.schedule : [];
    tracker.characterCreator = normalizeCharacterCreatorState(tracker.characterCreator);
    return tracker;
}

function normalizeCharacterCreatorState(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
        offered: Boolean(input.offered),
        completed: Boolean(input.completed),
        lastSheet: cleanText(input.lastSheet),
    };
}

export function rollCharacterCreatorStats(rng = Math.random) {
    const rollD10 = () => clamp(Math.floor((Number(rng()) || 0) * 10) + 1, 1, 10);
    const pool = {
        PHY: [rollD10(), rollD10()],
        MND: [rollD10(), rollD10()],
        CHA: [rollD10(), rollD10()],
    };
    return {
        pool,
        baseStats: {
            PHY: Math.max(...pool.PHY),
            MND: Math.max(...pool.MND),
            CHA: Math.max(...pool.CHA),
        },
        rerollValue: rollD10(),
    };
}

export function applyCharacterCreatorReroll(baseStats, stat, rerollValue) {
    const stats = sanitizeStats(baseStats, { PHY: 3, MND: 3, CHA: 3 }, 1, 10);
    const key = STAT_NAMES.includes(String(stat || '').toUpperCase()) ? String(stat).toUpperCase() : '';
    if (!key) return stats;
    stats[key] = Math.max(stats[key], clamp(Number(rerollValue) || 1, 1, 10));
    return stats;
}

export function applyCharacterCreatorSwap(stats, firstStat, secondStat) {
    const output = sanitizeStats(stats, { PHY: 3, MND: 3, CHA: 3 }, 1, 10);
    const a = STAT_NAMES.includes(String(firstStat || '').toUpperCase()) ? String(firstStat).toUpperCase() : '';
    const b = STAT_NAMES.includes(String(secondStat || '').toUpperCase()) ? String(secondStat).toUpperCase() : '';
    if (!a || !b || a === b) return output;
    const temp = output[a];
    output[a] = output[b];
    output[b] = temp;
    return output;
}

export const CHARACTER_CREATOR_RACES = Object.freeze([
    'Human',
    'Elf',
    'Half-elf',
    'Dwarf',
    'Halfling',
    'Gnome',
    'Goblin',
    'Hobgoblin',
    'Kobold',
    'Lizardfolk',
    'Satyr',
    'Minotaur-blooded human',
    'Orc-blooded human',
    'Demon-blooded human',
    'Dragonkin',
    'Beastkin',
    'Fae-touched human',
    'Kitsune-blooded human',
    'Oni-blooded human',
    'Celestial-blooded human',
    'Merfolk-blooded human',
    'Harpy-blooded human',
    'Lamia-blooded human',
    'Troll-blooded human',
    'Vampire-blooded human',
    'Construct-blooded human',
    'Sylvan elf',
    'Ash-blooded human',
    'Moon-touched human',
    'Rune-marked human',
    'Veil-touched human',
]);

export const CHARACTER_CREATOR_GENDERS = Object.freeze(['Female', 'Male', 'Nonbinary', 'Unspecified']);

export function rollCharacterCreatorBasics(rng = Math.random) {
    const roll = max => clamp(Math.floor((Number(rng()) || 0) * max) + 1, 1, max);
    const raceRoll = roll(100);
    const raceIndex = Math.min(Math.floor((raceRoll - 1) / 100 * CHARACTER_CREATOR_RACES.length), CHARACTER_CREATOR_RACES.length - 1);
    return {
        mode: 'random',
        raceRoll,
        raceDie: 100,
        race: CHARACTER_CREATOR_RACES[raceIndex],
    };
}

export function buildCharacterSheet(draft = {}, stats = { PHY: 3, MND: 3, CHA: 3 }) {
    const safeStats = sanitizeStats(stats, { PHY: 3, MND: 3, CHA: 3 }, 1, 10);
    const basic = draft.basic && typeof draft.basic === 'object' ? draft.basic : draft;
    const appearance = draft.appearance && typeof draft.appearance === 'object'
        ? draft.appearance
        : (typeof draft.appearance === 'string' ? { distinctFeatures: draft.appearance } : {});
    const traits = sanitizeTextList(draft.traits, 2, ['Adaptive Body', 'Night-Aware Senses']);
    const abilities = sanitizeTextList(draft.abilities, 2, ['Threshold Sense', 'Focused Burst']);
    const inventory = sanitizeTextList(draft.inventory, 6, ['weathered cloak', 'travel pack', 'bedroll']);
    const notes = sanitizeTextList(draft.notes, 5, []);
    const name = cleanText(basic.name) || '{{user}}';
    const lines = [
        '===========================================',
        'CHARACTER SHEET',
        '===========================================',
        '# BASIC INFO',
        `Name: ${name}`,
        `Race: ${cleanText(basic.race) || 'Unknown'}`,
        `Gender: ${cleanText(basic.gender) || 'Unknown'}`,
        `Age: ${cleanText(basic.age) || 'Unknown'}`,
        '',
        '# APPEARANCE',
        `Height: ${cleanText(appearance.height) || 'Unknown'}`,
        `Build: ${cleanText(appearance.build) || 'Unknown'}`,
        `Hair: ${cleanText(appearance.hair) || 'Unknown'}`,
        `Eyes: ${cleanText(appearance.eyes) || 'Unknown'}`,
        `Skin: ${cleanText(appearance.skin) || 'Unknown'}`,
        `Distinct Features / Style: ${cleanText(appearance.distinctFeatures) || 'Unknown'}`,
        '',
        '# STATS',
        `PHY: ${safeStats.PHY}`,
        `MND: ${safeStats.MND}`,
        `CHA: ${safeStats.CHA}`,
        '',
        '# RACIAL TRAITS',
        ...traits.map(item => `- ${cleanText(item)}`),
        '',
        '# ABILITIES',
        ...abilities.map(item => `- ${cleanText(item)}`),
        '',
        '# INVENTORY',
        ...inventory.map(item => `- ${cleanText(item)}`),
        '',
        '# PRIVATE PERCEPTION RULE',
        'Private senses, spirits, auras, hidden entities, and user-only perceptions remain private to {{user}}. NPCs do not perceive, identify, or react to that private information unless they explicitly possess the same sense or react to visible user behavior.',
        '',
        '# NOTES',
        ...(notes.length ? notes.map(item => `- ${cleanText(item)}`) : ['- Ability effects are narrative permissions, not numeric bonuses. The RP Engine resolves risky use through PHY, MND, or CHA as appropriate.']),
    ];
    return lines.join('\n');
}

function sanitizeTextList(value, max, fallback) {
    const list = Array.isArray(value) ? value : (typeof value === 'string' && value.trim() ? [value] : []);
    const cleaned = list.map(item => {
        if (item && typeof item === 'object') {
            const name = cleanText(item.name || item.title || '');
            const effect = cleanText(item.effect || item.description || item.text || '');
            return [name, effect].filter(Boolean).join(' -> ');
        }
        return cleanText(item);
    }).filter(Boolean).slice(0, max);
    return cleaned.length ? cleaned : fallback;
}

export function parseCoreStats(text) {
    const source = String(text || '');
    const stats = {};
    for (const stat of STAT_NAMES) {
        const match = source.match(new RegExp(`${stat}\\s*(?:\\[|:|=)?\\s*(\\d{1,2})`, 'i'));
        if (match) {
            stats[stat] = clamp(Number(match[1]), 1, 10);
        }
    }
    return STAT_NAMES.every(x => Number.isFinite(stats[x])) ? stats : null;
}

function parseDispositionText(text) {
    const source = String(text || '');
    const match = source.match(/\bB\s*(?:\[|:|=)?\s*([1-4])\s*\/?\s*F\s*(?:\[|:|=)?\s*([1-4])\s*\/?\s*H\s*(?:\[|:|=)?\s*([1-4])\b/i);
    if (!match) return null;
    return { B: Number(match[1]), F: Number(match[2]), H: Number(match[3]) };
}

function parseRapportText(text) {
    const match = String(text || '').match(/\bcurrentRapport\s*(?:\[|:|=)?\s*([0-5])\b/i);
    return match ? Number(match[1]) : null;
}

function parseRapportLockText(text) {
    const match = String(text || '').match(/\brapportEncounterLock\s*(?:\[|:|=)?\s*(Y|N)\b/i);
    return match ? match[1].toUpperCase() : null;
}

function parseIntimacyGateText(text) {
    const match = String(text || '').match(/\bintimacyGate\s*(?:\[|:|=)?\s*(ALLOW|DENY|SKIP)\b/i);
    return match ? match[1].toUpperCase() : null;
}

export function buildResolverPrompt({ chatExcerpt, latestUserMessage, tracker, userName, characterName }) {
    return [
        'You are the hidden resolver for a SillyTavern roleplay rules extension. Return JSON only.',
        '',
        'UNIVERSAL POLICY:',
        '- EXPLICIT-ONLY. A fact MUST be stated in Character Card, Lore, Scene text, tracker, persona, or latest user input.',
        '- NO invention. Never invent stats, targets, actions, obstacles, outcomes, items, relationship state, or scene facts.',
        '- Uncertain = N, unknown, empty list, or existing tracker value.',
        '- FIRST-YES-WINS. For ordered rule ladders, the first explicit matching rule is final. Do not reconsider later.',
        '- Use the latest user message as the action to resolve. Use chat/tracker only as context.',
        '- This pass is a semantic/contextual resolver, not a keyword parser. Use language understanding to decide what action is actually being attempted.',
        '- The JavaScript engine will roll dice and enforce mechanical guardrails after you return JSON; your job is to identify the correct explicit facts and categories.',
        '- Do not copy literal phrasing when it hides the real action. Normalize to the actual attempted action while preserving explicit evidence.',
        '- If a field is uncertain, prefer a conservative default over invention; never add unstated targets, motives, stats, items, or outcomes.',
        '',
        'RESOLUTION ORDER:',
        '1. Check OOC.',
        '2. Identify final goal and intimacy category.',
        '3. Identify the decisive action or combat attack sequence.',
        '4. Identify living and environmental targets/opposition.',
        '5. Decide whether meaningful stakes exist.',
        '6. Count combat actions only when the input is a hostile attack sequence.',
        '7. Map stats from the decisive action and opposition mode.',
        '8. Extract only explicit NPC facts/inventory facts needed for tracker updates.',
        '',
        'STEP A: OUT-OF-CHARACTER CHECK',
        '- Parentheses are strict routing syntax.',
        '- Text wrapped in double parentheses ((like this)) is pure OOC: set ooc=Y and oocMode=STOP. Stop all narration. Do not roll. Do not update relationship/tracker state. Respond to the user out of character only.',
        '- Text wrapped in triple parentheses (((like this))) is proxy narration: set ooc=Y and oocMode=PROXY. Treat the inner text as the user-declared in-scene action and run all engine steps normally.',
        '- Do not infer proxy action from double parentheses. If the user wants proxy narration, they must use triple parentheses.',
        '- For STOP: fill oocInstruction with the inner text, hasStakes=N, actionCount=1, target lists empty, npcInScene empty, and no invented action.',
        '- For PROXY: resolve the inner declared in-scene action exactly as if it were normal narrative input. oocInstruction may be empty unless the inner text includes explicit narration instructions.',
        '- Examples: ((What does B3 mean?)) -> ooc=Y, oocMode=STOP.',
        '- Examples: ((Have my character slap Seraphina twice.)) -> ooc=Y, oocMode=STOP, because it used double parentheses.',
        '- Examples: (((Have my character slap Seraphina twice.))) -> ooc=Y, oocMode=PROXY, resolve as 2 hostile PHY actions.',
        '',
        'STEP B: IDENTIFY GOAL',
        '- Return a short plain description of the final practical goal/intent of the user action in the latest user input.',
        '- Trust semantic intent. If the user performs setup plus payoff, goal is the practical thing the whole sequence is trying to accomplish, not necessarily the first verb.',
        '- Final goal is the intended end state if the whole attempt works; decisiveAction is the bottleneck that decides whether that end state happens.',
        '- If the user says something as a tactic, distinguish the tactic from the goal: a lie may be the decisive action while theft, escape, entry, or intimacy is the final goal.',
        '- If the user declares emotion, affection, flavor, or conversation without a concrete demand, obstacle, risk, or material consequence, keep goal normal and allow hasStakes=N.',
        '- If the user asks for explicit sexual exposure, sexual access, or sexual compliance from a specific NPC, set goalKind=IntimacyAdvanceVerbal.',
        '- Example: "I run, reach the edge, and jump over the chasm" -> goal: cross/jump over the chasm.',
        '- Example: "\\"Look over there!\\" I say, pointing aside as I reach for the $100 bill" -> goal: get the $100 bill; the decisive action is distracting the observer.',
        '- Example: "I threaten to expose her secret so she lets me pass" -> goal: get past her; decisiveAction: threaten/exert leverage over her.',
        '- Example: "I tell her I love her" with no demand or explicit stakes -> goal: express love; hasStakes=N.',
        '- If the goal is an explicit direct intimate advance toward a specific NPC, set goalKind=IntimacyAdvancePhysical for intimate physical contact.',
        '- If the goal is an explicit direct verbal proposition toward a specific NPC, set goalKind=IntimacyAdvanceVerbal.',
        '- If the user uses deception, distraction, stealth, pressure, or setup to enable a kiss, touch, embrace, cuddle, grope, or similar physical intimacy toward a specific NPC, the final goal is still IntimacyAdvancePhysical. The enabling action may be the decisiveAction.',
        '- Flirting, compliments, teasing, affectionate tone, romance-coded attention, and non-explicit social behavior do not count as intimacy advances.',
        '- Otherwise goalKind=Normal.',
        '',
        'STEP B2: IDENTIFY THE DECISIVE ACTION',
        '- Identify the ONE explicit action-attempt whose success or failure determines whether the whole sequence succeeds.',
        '- Use natural language understanding here. Do not mechanically pick the last verb or first verb.',
        '- Setup, movement, approach, flourish, drawing a weapon, taking a breath, repositioning, or recovery are not decisive unless they are the actual contested/risky step.',
        '- If there is a clear enabling action, decisiveAction is that enabling action even when the final goal is different.',
        '- Example: running before a chasm jump -> decisiveAction: jump over the chasm; running is setup.',
        '- Example: pointing and saying "look over there" while reaching for money -> decisiveAction: distract the observer; if it succeeds, the reach for the money succeeds unless another explicit obstacle exists.',
        '- Example: distracting Seraphina, then kissing her if she looks away -> decisiveAction: distract Seraphina; goalKind=IntimacyAdvancePhysical.',
        '- If multiple independent noncombat actions are present, choose the single bottleneck action that gates the rest. If no bottleneck is explicit, use the final risky/contested action.',
        '- Combat exception: for explicit hostile/combat attack sequences, decisiveAction should summarize the whole attack sequence, not only the first attack.',
        '- In combat, setup/movement/repositioning still does not count as decisive, but each distinct attempted strike does count as a separate action.',
        '- Example: "I step in, punch her, pivot, backhand slap her, then knee her" -> decisiveAction: "punch her | backhand slap her | knee her"; actionCount=3.',
        '- outcomeOnSuccess: brief plain result that follows from success, bounded by explicit stakes only.',
        '- outcomeOnFailure: brief plain result that follows from failure, bounded by explicit stakes only.',
        '',
        'STEP C: IDENTIFY TARGETS',
        '- actionTargets: living entities directly targeted by the user action.',
        '- oppTargetsNpc: living entities actively or passively opposing, contesting, blocking, resisting, refusing, being attacked by, or defending against the user action.',
        '- oppTargetsEnv: non-living environmental/terrain features, hazards, objects, locks, distances, obstacles, weather, darkness, or other nonliving barriers directly obstructing the user action.',
        '- benefitedObservers: living entities present in scene, not direct/opposing targets, whose stakes materially improve because of the user action.',
        '- harmedObservers: living entities present in scene, not direct/opposing targets, whose stakes materially worsen because of the user action.',
        '- A living being can oppose passively through awareness, perception, refusal, guarding, ownership, social resistance, body position, consent, or being the person attacked.',
        '- Never put a living being in oppTargetsEnv. If a guard, witness, owner, victim, pursuer, target, or observer is the thing the action must get past, they belong in oppTargetsNpc.',
        '- ENV is only nonliving opposition: chasm, door, lock, trap, storm, darkness, terrain, distance, object, hunger/survival environment, puzzle, mechanism, or similar.',
        '- Use benefitedObservers/harmedObservers only when their stakes materially change: safety, resources, status, autonomy, or explicit goal progress. Do not use them for mere emotional tone or witnessing unless stakes change.',
        '- If the user helps an NPC by removing danger/obstacle, that NPC may be benefitedObserver even if not directly targeted.',
        '- If the user harms an NPC, steals from them, endangers them, violates their autonomy, or worsens their situation, they may be actionTarget/opposition or harmedObserver depending on directness.',
    '- If the user acts toward the active character by direct address, pronoun, or one-NPC scene context, include that character by name.',
    '- If a list has no explicit entries, return an empty list.',
    '- npcInScene: all living NPCs the user directly interacted with, plus benefited/harmed observers. Include the active character if the user acts toward them by name or direct second-person context.',
    '- If multiple same-role unnamed NPCs are present, use the exact tracker label, alias, or descriptor that identifies the intended one: Goblin 1, Goblin 2, Guard 1, the wounded goblin, the younger guard.',
    '- If "the goblin", "the guard", or a similar role phrase is ambiguous among multiple present NPCs and context does not identify one, do not invent certainty. Use the explicit group phrase only if the user acts on the group; otherwise keep target lists conservative and state ambiguity in evidence.',
    '',
        'STEP D: STAKES',
        '- Stakes are meaningful possible consequences tied to success or failure.',
        '- Stakes include physical risk, harm, danger, detection, material gain/loss, social status shift, loss of autonomy, meaningful obstacle resolution/failure, or explicit goal advancement/failure for the user or a specific living entity.',
        '- If success/failure would not materially change outcome, hasStakes=N.',
        '- Conversation, affection, banter, compliments, flirting, teasing, ordinary narration, harmless movement, or atmospheric description alone hasStakes=N unless explicit risk, cost, pressure, demand, or meaningful consequence is stated.',
        '- Ordinary harmless requests or questions, such as asking for directions, the time, a name, a public fact, or casual small talk, have hasStakes=N unless explicit risk, urgency, refusal, deception, cost, danger, leverage, restricted information, or meaningful consequence is stated.',
        '- A roll is not a mood check. Only roll when the explicit action is contested, risky, obstructed, or materially consequential.',
        '- If goalKind is IntimacyAdvancePhysical or IntimacyAdvanceVerbal, mark hasStakes=Y when the target/gate/resistance matters; the JavaScript referee will handle gate logic.',
        '- If the user makes an explicit unwanted intimacy attempt, boundary/consent stakes exist even if the physical/social method is subtle.',
        '- If a combat/hostile attack is explicit, hasStakes=Y.',
        '- If the action would automatically succeed or fail from explicit context with no meaningful uncertainty, hasStakes=N and explain why in stakesEvidence.',
        '- Return hasStakes=Y only when the explicit means used in the latest input could affect stakes.',
        '',
        'STEP E: ACTION COUNT',
        '- Only applies to explicit hostile/combat attack sequences.',
        '- Do not count setup, movement, repositioning, defense, recovery, or non-attack flavor.',
        '- Each individual attempted attack in a hostile attack sequence counts as one action, even if the user does not say "once", "twice", "two times", or "three times".',
        '- Count from semantic wording: punch + slap + knee = 3 actions; slash then stab = 2 actions; swing a sword at someone = 1 attack even if the verb "attack" is not used; draw sword then slash = 1 action; step forward then punch = 1 action.',
        '- Repeated blows with the same verb can count from explicit repetition or clear repeated wording, but never infer more attacks than stated.',
        '- Setup words that do NOT count: get up, step, run up, pivot, use momentum, draw weapon, raise hand, feint as flavor, recover, brace, reposition, follow through.',
        '- If more than 3 attacks are stated, return 3 and ignore the rest for mechanics.',
        '- Return actionCount 1, 2, or 3. Never more than 3. For noncombat, return 1.',
        '',
        'STEP F: STAT MAPPING',
        '- USER is always the initiating actor for this pass. In normal user turns, USER={{user}}. Later NPC proactivity should use the same mappings with the NPC as USER/actor and {{user}} as possible opposition.',
        '- STRICT STAT DEFINITIONS:',
        '- PHY = bodily execution under risk: force, agility, speed, endurance, coordination, combat execution, stealth movement, sleight of hand, escaping, chasing, climbing, jumping, grappling, breaking, carrying, or any action where the body performs the decisive attempt.',
        '- MND = cognition, perception, awareness, focus, memory, reasoning, knowledge, willpower, reading clues, detecting hidden things, resisting mental pressure, tracking, survival judgment, supernatural concentration, or any action where mind/awareness performs the decisive attempt.',
        '- CHA = interpersonal influence or social masking: persuasion, deception, intimidation, negotiation, bargaining, command presence, emotional pressure, seduction/flirtation short of an intimacy advance, performance, composure, or any action where social force performs the decisive attempt.',
        '- Determine stats from decisiveAction, not from setup movement or the abstract final goal.',
        '- If final goal relies heavily on a specific enabling action, userStat is based on that enabling action.',
        '- If the text uses a pronoun like her/him/them and the tracker/scene makes exactly one living referent clear, use that living referent as the target/opposition. Do not route it to ENV.',
        '- Normalize decisiveAction to the real action category, not just the literal words. Example: saying "Look over there!" while reaching for money -> decisiveAction: distract the target; USER=CHA; OPP=MND if a living observer is explicit.',
        '- Use final goal only if no distinct explicit means are present.',
        '- BROAD STAT CATEGORIES:',
        '- Physical task vs nonliving/environmental opposition: USER=PHY, OPP=ENV.',
        '- Mental/perceptive/knowledge task vs nonliving/environmental opposition: USER=MND, OPP=ENV.',
        '- Technical obstacle tasks depend on the decisive means: studying, diagnosing, solving, tracing, identifying, or carefully disarming a trap/mechanism is MND vs ENV; forcing, kicking, lifting, breaking, climbing, swimming, or bodily timing through it is PHY vs ENV.',
        '- Physical contest vs living body/resistance, including combat, grapples, chases, shoves, blocking, forcing past, restraint, or escape from a hold: USER=PHY, OPP=PHY.',
        '- Physical execution vs living awareness, including stealth, hiding, slipping past, pickpocketing, or avoiding notice: USER=PHY, OPP=MND. The living observer is passive opposition.',
        '- Non-hostile social influence vs living target, including sincere persuasion, diplomacy, negotiation, bargaining, rapport, or friendly appeal: USER=CHA, OPP=CHA.',
        '- Hostile/deceptive/concealed social influence vs living target, including bluff, lie, distraction, intimidation, coercion, blackmail, threat, demand, command, manipulation, or hiding intent: USER=CHA, OPP=MND.',
        '- ENV is only for nonliving opposition. If a living being is actively or passively opposing the action, oppTargetsNpc must contain that being and oppStat must not be ENV.',
        '- If uncertain but stakes exist, choose the clearest explicit means and include evidence. If no evidence, default MND vs ENV.',
        '- hostilePhysicalHarm=Y only for explicit hostile PHY actions meant to hurt or injure. Shoving past, fleeing, grappling past, or forcing a path is not automatically harm unless injury/attack is explicit.',
        '',
        'MAGIC / SUPERNATURAL GUIDANCE:',
        '- Magic is not a separate stat. Map it by the decisive means and opposition mode.',
        '- MND = deliberate supernatural exertion: casting, channeling, ritual focus, warding, dispelling, sensing magic, controlling elements, resisting psychic/spiritual pressure, illusions requiring concentration, curses, blessings, healing, summoning, teleportation, divination, and identifying magical effects.',
        '- CHA = supernatural social influence: charm, glamour, compulsion through presence/speech, seductive magic, fear aura used to intimidate, magical deception aimed at belief or emotion, or any magic where interpersonal influence is the decisive means.',
        '- PHY = magical actions where bodily execution decides success: aiming a wand/staff/projectile under pressure, throwing alchemical magic, drawing a sigil while dodging, touching a resisting target, or delivering magic through a weapon strike.',
        '- Living opposition never becomes ENV. If magic targets, deceives, controls, harms, detects, heals, restrains, or bypasses a living being, include that living being as action target, opposing target, benefited observer, or harmed observer as appropriate.',
        '- Use MND vs MND when magic contests will, focus, perception, mind, spirit, illusion, curse, ward, possession, supernatural control, or another caster/supernatural resistance.',
        '- Use MND vs PHY when the spell is mentally cast but the living target primarily resists by bodily dodge, block, cover, or escape.',
        '- Use PHY vs PHY when magic is delivered through a physical attack, weapon strike, thrown object, touch under resistance, or other bodily contest.',
        '- Use CHA vs MND for magical bluff, charm, intimidation, coercion, seduction, fear aura, compulsion, or emotional manipulation.',
        '- Use MND vs ENV for nonliving magical obstacles: wards, seals, cursed doors, rituals, magical locks, ambient hazards, unstable portals, magical analysis, or dispelling terrain effects.',
        '- Healing or blessing a willing target usually has no opposition unless failure has stakes. If risky, unstable, cursed, resisted, or under pressure, use MND vs ENV or MND vs the opposing magic/living resistance.',
        '- If spell outcome is automatic from explicit lore/card/tracker rules, hasStakes=N unless a separate risk/cost/consequence is explicit.',
        '- If spell limits, cost, range, preparation, target resistance, danger, or uncertainty matter, hasStakes=Y.',
        '',
        'RELATIONSHIP SEMANTIC INPUTS:',
        '- Your target/observer fields are the semantic input to the Relationship Engine.',
        '- Mark benefitedObservers only when the user materially improves that NPC stakes: safety, resources, status, autonomy, or explicit goal progress.',
        '- Mark harmedObservers only when the user materially worsens that NPC stakes: safety, resources, status, autonomy, trust, property, or explicit goal progress.',
        '- Do not mark Bond just because of compliments, flirting, affectionate tone, or pleasant conversation; those are usually no-stakes unless explicit benefit exists.',
        '- Intimidation, coercion, menacing threats, forced submission, terror displays, blackmail, and leverage should be clear in goal/decisiveAction/evidence so the relationship route can become Fear.',
        '- Direct attacks, injury attempts, hostile physical contact, theft from an NPC, autonomy violations, or denied intimacy should be clear in targets/evidence so the relationship route can become Hostility or FearHostility.',
        '- If an NPC is present but the user did not interact with them and their stakes do not change, exclude them unless needed as benefited/harmed observer.',
        '',
    'NPC INITIALIZATION GUIDANCE:',
    '- Use npcFacts only for NPCs present/relevant this turn.',
    '- For multiple same-role NPCs, preserve distinct labels and descriptors from tracker context. Do not merge Goblin 1/Goblin 2/Goblin 3 unless the text explicitly treats them as one group.',
    '- npcFacts.aliases may include old generic labels or observed descriptions. npcFacts.descriptor is a short identifying phrase from explicit observable context only.',
    '- If an unnamed tracked NPC has their personal name revealed, return npcFacts with name as the revealed name and revealedFrom set to the old tracker label/alias. Preserve the old label as an alias; do not create a fresh unrelated NPC.',
    '- explicitPreset=romanticOpen if NPC is explicitly already romantically/intimately involved with the user, willing toward the user, or in love.',
        '- explicitPreset=userBadRep if the user is explicitly hated, distrusted, wanted, or has bad reputation with this NPC/group.',
        '- explicitPreset=userGoodRep if the user is explicitly admired, trusted, praised, or known favorably.',
        '- explicitPreset=userNonHuman if user is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like AND NPC lacks explicit fear immunity.',
        '- Fear immunity requires explicit same/superior nature, superior being, or natural fear/mental immunity. Title, rank, bravado, composure, or pretending fearless does not count.',
        '- explicitPreset=neutralDefault only if none of the above is explicit.',
        '- rank Weak: clearly below ordinary healthy adult, child, frail elder, badly injured person, small harmless animal, sickly minor creature.',
        '- rank Average: ordinary healthy adult/capable creature, civilian adult, common laborer, ordinary non-elite being.',
        '- rank Trained: trained/capable professional or dangerous lesser threat, guard, soldier, adventurer, competent lesser monster.',
        '- rank Elite: beyond ordinary trained professionals, veteran knight, master duelist, powerful mage, apex predator, elder beast, major supernatural threat.',
        '- rank Boss: overwhelmingly beyond elite, legendary hero, warlord, ancient guardian, archmage, dragon, titan, mythic apex entity.',
        '- If explicit portrayal does not support a rank, rank=unknown.',
        '- mainStat must be PHY, MND, CHA, Balanced, or unknown based on explicit portrayal only.',
        '- explicitStats only if exact PHY/MND/CHA values are already present in tracker/card/text. Do not invent exact stats.',
        '- override Transactional/Hedonist/Exploitation/Established only if explicitly stated; otherwise NONE/unknown.',
        '- archiveStatus only from explicit lifecycle facts. Active=still part of ongoing story; Inactive/Retired=no longer currently involved but may matter; Dead=explicitly dead/destroyed; Forgotten=explicit user instruction to remove/prune from continuity; unknown otherwise.',
        '',
        'TRACKER/INVENTORY GUIDANCE:',
        '- scene.location/time/weather only when explicitly known.',
        '- npc position, condition, and knowsUser only from explicit facts. Otherwise empty/unknown.',
        '- inventoryDeltas require explicit evidence that an item was gained, lost, equipped, unequipped, used, or damaged.',
        '- Do not infer that an item was picked up, paid, consumed, or equipped unless the text says so.',
        '- taskDeltas track explicit obligations the user agreed to, accepted, scheduled, completed, or canceled. This includes quests, errands, appointments, promised favors, deliveries, meetings, investigations, and deadlines.',
        '- taskDeltas add only when the user explicitly agrees/accepts/promises/schedules or an NPC explicitly assigns a task and the user accepts. Complete/cancel only with explicit evidence.',
        '',
        'TIME TRACKING GUIDANCE:',
        '- scene.time is authoritative when an explicit current in-world time is stated or revealed.',
        '- timeDeltaMinutes is only for explicit in-scene time passage or time skips: waiting, sleeping, travel time, "three hours later", "after 20 minutes", "at dawn after the night passes", or similar.',
        '- If the user explicitly skips forward, waits, travels for a stated duration, sleeps for a stated duration, or the narration says a duration passes, return the signed minute delta in timeDeltaMinutes and explain in timeSkipReason.',
        '- If the user sets a specific clock time instead of a duration, put it in scene.time and set timeDeltaMinutes=0.',
        '- If no explicit time change is stated, timeDeltaMinutes=0 and scene.time empty.',
        '',
        `USER NAME: ${userName || '{{user}}'}`,
        `CHARACTER/ASSISTANT NAME: ${characterName || '{{char}}'}`,
        '',
        'CURRENT TRACKER JSON:',
        JSON.stringify(tracker),
        '',
        'LATEST USER MESSAGE TO RESOLVE:',
        latestUserMessage || '(none)',
        '',
        'RECENT CHAT EXCERPT:',
        chatExcerpt,
        '',
        'Return only valid JSON matching the schema. Include short evidence strings for every non-default classification.',
    ].join('\n');
}

export function inferFallbackExtraction(latestUserMessage, characterName = '', contextTracker = null) {
    const text = String(latestUserMessage || '').trim();
    const lower = text.toLowerCase();
    const fallback = {};

    if (!text) {
        return fallback;
    }

    const proxyWrapped = text.match(/^\s*\(\(\(([\s\S]*)\)\)\)\s*$/);
    if (proxyWrapped) {
        const inner = proxyWrapped[1].trim();
        const actionText = normalizeProxyActionText(inner);
        const nested = inferFallbackExtraction(actionText, characterName, contextTracker);
        nested.ooc = 'Y';
        nested.oocMode = 'PROXY';
        nested.oocInstruction = inner === actionText ? '' : inner;
        return nested;
    }

    const oocWrapped = text.match(/^\s*\(\((?!\()([\s\S]*?)(?<!\))\)\)\s*$/);
    if (oocWrapped) {
        const inner = oocWrapped[1].trim();
        return {
            ooc: 'Y',
            oocMode: 'STOP',
            oocInstruction: inner,
            goal: 'OOC clarification or instruction',
            goalKind: 'Normal',
            goalEvidence: inner,
            decisiveAction: 'OOC clarification or instruction',
            decisiveActionEvidence: inner,
            outcomeOnSuccess: '',
            outcomeOnFailure: '',
            actionTargets: [],
            oppTargetsNpc: [],
            oppTargetsEnv: [],
            benefitedObservers: [],
            harmedObservers: [],
            npcInScene: [],
            hasStakes: 'N',
            stakesEvidence: 'Double-parentheses OOC message; no in-scene action resolved.',
            actionCount: 1,
            userStat: 'MND',
            userStatEvidence: '',
            oppStat: 'ENV',
            oppStatEvidence: '',
            hostilePhysicalHarm: 'N',
            newEncounter: 'N',
            timeDeltaMinutes: 0,
            timeSkipReason: '',
            scene: { location: '', time: '', weather: '' },
            npcFacts: [],
            inventoryDeltas: [],
            taskDeltas: [],
        };
    }

    const containsAttack = /\b(hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee)\b/i.test(text)
        || /\b(swing|swipe|sweep|bring|drive|thrust|jab)\b[\s\S]{0,80}\b(sword|blade|axe|mace|club|knife|dagger|spear|staff|fist|elbow|knee|boot)\b[\s\S]{0,80}\b(at|into|toward|towards|for|against)\b/i.test(text);
    const npcDescriptors = 'guard|watchman|sentry|observer|lookout|merchant|bandit|soldier|knight|villager|drunk|barmaid|bartender|prisoner|captive|merchant|thief|bandit|cultist|mage|witch|healer|noble|servant';
    const namedIntroducedTarget = text.match(new RegExp(`\\b(?:NPC|person|man|woman|${npcDescriptors})\\s+named\\s+([A-Z][A-Za-z0-9_'-]{1,40})\\b`, 'i'));
    const namedActionTarget = text.match(/\b(?:shove|push|shoulder|barge|force|hit|punch|kick|knee|cut|slash|stab|shoot|strike|attack|slam)\s+(?:past\s+|through\s+|by\s+)?([A-Z][A-Za-z0-9_'â€™-]{1,40})/);
    const namedSocialTarget = text.match(/\b(?:tell|ask|convince|persuade|deceive|bluff|threaten|warn|promise|negotiate|intimidate|coerce|demand|order|thank|apologize to|compliment|praise|greet)\s+([A-Z][A-Za-z0-9_'Ã¢â‚¬â„¢-]{1,40})/);
    const namedHostileSocialTarget = text.match(/\b(?:mock|insult|taunt|humiliate|ridicule)\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/i);
    const namedBenefitTarget = text.match(new RegExp(`\\b(?:give|hand|return|offer|help|heal|protect|shield|free|release|rescue|save)\\s+(?:the\\s+)?([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\b`, 'i'));
    const namedBenefitToTarget = text.match(new RegExp(`\\b(?:give|hand|return|offer)\\b[\\s\\S]{0,80}\\bto\\s+(?:the\\s+)?([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\b`, 'i'));
    const namedDistractTarget = text.match(/\b(?:distract|misdirect|fool|trick)\s+([A-Z][A-Za-z0-9_'-]{1,40})/);
    const namedPointTarget = text.match(/\bpoint(?:\s+\w+){0,3}\s+(?:behind|at|toward|towards)\s+(?!the\b|a\b|an\b)([A-Z][A-Za-z0-9_'-]{1,40})\b/i);
    const namedStealthTarget = text.match(new RegExp(`\\b(?:sneak|creep|slip|hide|move|steal|pickpocket|palm|conceal|pocket|snatch)\\b[\\s\\S]{0,80}\\b(?:past|around|by|from)\\s+(?:the\\s+)?([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\b`, 'i'));
    const namedAwarenessTarget = text.match(new RegExp(`\\b(?:while|as)\\s+([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\s+(?:watch(?:es|ed|ing)?|look(?:s|ed|ing)?|stare(?:s|d|ing)?|observe(?:s|d|ing)?|notice(?:s|d|ing)?)\\b`, 'i'));
    const namedWatcherTarget = text.match(new RegExp(`\\b(?!I\\b|me\\b|my\\b|the\\b|a\\b|an\\b)([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\s+(?:watch(?:es|ed|ing)?|look(?:s|ed|ing)?|stare(?:s|d|ing)?|observe(?:s|d|ing)?|notice(?:s|d|ing)?|guards?|keeps? watch)\\b`, 'i'));
    const namedDescriptorTarget = text.match(new RegExp(`\\b(?:shove|push|hit|punch|kick|knee|cut|slash|stab|shoot|strike|attack|tell|ask|convince|persuade|deceive|bluff|threaten|warn|promise|negotiate|intimidate|coerce|demand|order)\\s+(?:past\\s+|through\\s+|by\\s+)?(?:the\\s+)?(${npcDescriptors})\\b`, 'i'));
    const namedAnyDescriptor = text.match(new RegExp(`\\b(?:the\\s+)?(${npcDescriptors})\\b`, 'i'));
    const namedSlapTarget = text.match(/\bslap\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/);
    const namedIntimacyTarget = text.match(/\b(?:kiss|touch|embrace|cuddle|grope|caress|fondle)\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/);
    const namedPriorIntimacyTarget = text.match(/\b(?!I\b|Me\b|My\b)([A-Z][A-Za-z0-9_'-]{1,40})\b[\s\S]{0,140}\b(?:kiss|touch|embrace|cuddle|grope|caress|fondle)\s+(?:her|him|them)\b/i);
    const namedPhysicalCoercionTarget = text.match(/\b(?:grab|yank|drag|pin|restrain|tackle|trip)\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/);
    const namedAtTarget = text.match(/\b(?:throw|hurl|toss|fling|cut|slash|stab|strike|swing|swipe|sweep|thrust|jab|drive)\b[\s\S]{0,80}\b(?:at|on|into|toward|towards|for|against)\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/);
    const namedDirectMagicTarget = text.match(new RegExp(`\\b(?:curse|hex|charm|glamour|compel|bewitch|enchant|dominate|blast|burn|freeze|shock|smite|firebolt)\\s+(?:the\\s+)?([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\b`, 'i'));
    const namedMagicTarget = text.match(new RegExp(`\\b(?:cast|channel|invoke|weave|curse|hex|charm|glamour|compel|bewitch|enchant|dominate|blast|burn|freeze|shock|smite|firebolt|spell)\\b[\\s\\S]{0,100}\\b(?:at|on|into|toward|towards|against)\\s+(?:the\\s+)?([A-Z][A-Za-z0-9_'-]{1,40}|${npcDescriptors})\\b`, 'i'));
    const namedClothingIntimacyTarget = text.match(/\b(?:lift|pull|remove|take off|strip|undress|open)\s+(?:up\s+|off\s+)?([A-Z][A-Za-z0-9_'-]{1,40})(?:'s)?\s+(?:skirt|dress|shirt|top|pants|underwear|panties|bra)\b/i);
    const namedSceneEntry = text.match(/\b(?!I\b|Me\b|My\b)([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:returns?|comes?|walks?|steps?|enters?|arrives?)\b[\s\S]{0,80}\b(?:back|in|into|to|toward|towards|at|counter|room|scene|area|door|table|bar|hall|shop|market)?\b/i);
    const namedSceneExit = text.match(/\b(?!I\b|Me\b|My\b)([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:leaves?|exits?|departs?|walks? away|steps? away|goes? out)\b/i);
    const namedDeadNpc = text.match(/\b(?!I\b|Me\b|My\b)([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:is|was|lies|lay|has been)?\s*(?:dead|killed|slain|destroyed|deceased)\b|\b(?!I\b|Me\b|My\b)([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:dies|died)\b/i);
    const namedForgottenNpc = text.match(/\b(?:forget|prune|remove|delete)\s+([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:from\s+)?(?:the\s+)?(?:archive|lorebook|tracker|continuity)\b/i);
    const sceneSingleTarget = singlePresentNpcName(contextTracker);
    const contextTarget = String(contextTracker?.currentInteractionTarget || '').trim();
    const activeCharacterName = String(characterName || '').trim();
    const pronounTarget = /\b(her|him|them|their)\b/i.test(text) ? (sceneSingleTarget || contextTarget) : '';
    const directSceneTarget = sceneSingleTarget && /\b(look over there|distract|point)\b/i.test(text) ? sceneSingleTarget : '';
    const target = firstCleanNpcName([
        namedAtTarget?.[1],
        namedDirectMagicTarget?.[1],
        namedMagicTarget?.[1],
        namedActionTarget?.[1],
        namedPhysicalCoercionTarget?.[1],
        namedSocialTarget?.[1],
        namedHostileSocialTarget?.[1],
        namedBenefitTarget?.[1],
        namedBenefitToTarget?.[1],
        namedDistractTarget?.[1],
        namedPointTarget?.[1],
        namedStealthTarget?.[1],
        namedAwarenessTarget?.[1],
        namedWatcherTarget?.[1],
        namedDescriptorTarget?.[1],
        namedSlapTarget?.[1],
        namedIntimacyTarget?.[1],
        namedPriorIntimacyTarget?.[1],
        namedClothingIntimacyTarget?.[1],
        namedSceneEntry?.[1],
        namedSceneExit?.[1],
        namedDeadNpc?.[1] || namedDeadNpc?.[2],
        namedForgottenNpc?.[1],
        namedAnyDescriptor?.[1],
        containsAttack && namedIntroducedTarget?.[1],
        activeCharacterName && lower.includes(activeCharacterName.toLowerCase()) ? activeCharacterName : '',
        pronounTarget,
        contextTarget && (contextualInteractionUsesCurrentTarget(text) || containsAttack || physicalContextActionUsesCurrentTarget(text)) ? contextTarget : '',
        directSceneTarget,
    ]);
    const hasTarget = Boolean(target);
    const shovePast = /\b(shove|push|shoulder|barge|force)\b.*\b(past|through|by)\b/i.test(text);
    const attack = containsAttack;
    const harmlessObjectDiscard = /\b(toss|throw|drop|set|put|lay)\b[\s\S]{0,50}\b(knife|dagger|sword|blade|weapon|staff|bow|crossbow|club)\b[\s\S]{0,50}\b(aside|away|down|on the ground|to the ground|on the floor|to the floor|at my feet)\b/i.test(text);
    const physicalCoercion = !harmlessObjectDiscard && /\b(grab|yank|drag|pin|restrain|tackle|trip|shove|push|barge|force|throw|hurl|toss|fling|spit)\b/i.test(text);
    const blockWords = /\b(stop|block|bar|hold|restrain|prevent|guard)\b/i.test(text);
    const socialVerb = /\b(tell|say|ask|convince|persuade|lie|deceive|bluff|threaten|warn|promise|negotiate|intimidate|coerce|demand|order|thank|apologize|compliment|praise|greet|mock|insult|taunt|humiliate|ridicule)\b/i.test(text);
    const threat = /\b(threaten|if .*not|unless|reveal|expose|blackmail|warn|intimidate|coerce|demand|order)\b/i.test(text);
    const hostileSocial = threat || /\b(lie|deceive|bluff|trick|mislead|distract|manipulate|mock|insult|taunt|humiliate|ridicule)\b/i.test(text);
    const directAidAction = hasTarget && (/\b(give|return|offer|help|heal|protect|shield|free|release|rescue|save)\b/i.test(text)
        || /\bhand\b[\s\S]{0,80}\b(potion|medicine|bandage|food|water|key|coin|money|dagger|knife|letter|item|object|supplies)\b/i.test(text));
    const riskyAidAction = directAidAction
        && /\b(protect|shield|free|release|rescue|save|heal)\b/i.test(text)
        && /\b(cage|cell|chains?|rope|trap|beam|falling|fire|burning|wound|wounded|bleeding|poison|curse|danger|attack|attacker|collapse|locked|lock|under pressure|before|while)\b/i.test(text);
    const ordinaryHarmlessRequest = hasTarget
        && /\b(ask|tell|say)\b/i.test(text)
        && /\b(direction|directions|way to|where is|where's|where the|where a|where an|know where|knows where|seen a|seen the|have you seen|has anyone seen|what time|time is it|the time|your name|their name|his name|her name|public|rumor|news|weather|blacksmith|inn|shop|market|temple|road|path|hello|hi|greet|small talk)\b/i.test(text)
        && !/\b(secret|private|restricted|forbidden|guarded|password|key|coin|money|pay|free|release|help me|let me|allow me|step aside|leave|follow|come with|danger|urgent|hurry|lie|deceive|bluff|trick|distract|threat|unless|if\b.*\bnot|must|demand|order|intimidate|coerce|show|strip|kiss|touch|sex)\b/i.test(text);
    const harmlessSocialExpression = hasTarget
        && /\b(tell|say|compliment|flatter|praise|smile|nod|wave|greet|thank|apologize)\b/i.test(text)
        && /\b(nice|pretty|beautiful|handsome|kind|good|great|lovely|looks nice|look nice|well done|thank you|thanks|sorry|apologize|apology|bothering|hello|hi|good morning|good evening|smile|nod|wave)\b/i.test(text)
        && !/\b(need|want|give|show|come|follow|leave|help me|let me|allow me|step aside|pay|money|coin|secret|password|private|restricted|urgent|danger|threat|unless|if\b.*\bnot|must|demand|order|intimidate|coerce|deceive|bluff|trick|distract|kiss|touch|sex|strip)\b/i.test(text);
    const affectionDeclaration = hasTarget && /\b(tell|say)\b[\s\S]{0,80}\b(love|like|care about|miss|adore)\b/i.test(text) && !/\b(please|must|need|want|show|give|come|kiss|touch|sleep|sex|promise|if|unless)\b/i.test(text);
    const stealthLiving = hasTarget && /\b(sneak|creep|slip|hide|move quietly|stealth|pickpocket|steal)\b/i.test(text) && /\b(past|around|by|from|avoid|unnoticed|without (?:being )?(?:seen|noticed|detected))\b/i.test(text);
    const sleightVsAwareness = hasTarget
        && /\b(palm|conceal|pocket|snatch|slip|steal|pickpocket|hide)\b[\s\S]{0,80}\b(coin|bill|money|purse|wallet|key|gem|ring|item|knife|letter)\b/i.test(text)
        && /\b(watch|watches|watching|look|looks|looking|stare|stares|staring|observe|observes|observing|notice|notices|noticing|eyes|guard|sentry|observer|lookout)\b/i.test(text);
    const intimateVerbalRequest = hasTarget && /\b(ask|tell|demand|request)\b[\s\S]{0,80}\b(show|expose|flash|strip|undress|take off|remove)\b[\s\S]{0,80}\b(panties|underwear|bra|breasts|boobs|chest|ass|butt|nude|naked|body)\b/i.test(text);
    const chasmJump = /\b(jump|leap|vault)\b[\s\S]{0,80}\b(chasm|gap|ravine|pit|ledge|crevasse)\b/i.test(text)
        || /\b(chasm|gap|ravine|pit|ledge|crevasse)\b[\s\S]{0,80}\b(jump|leap|vault)\b/i.test(text);
    const technicalMentalEnvTask = /\b(study|inspect|analyze|solve|decode|investigate|trace|identify|figure out|carefully|careful)\b[\s\S]{0,120}\b(disarm|pick|unlock|bypass|disable|open)\b[\s\S]{0,120}\b(trap|mechanism|lock|wire|runes|device)\b/i.test(text)
        || /\b(disarm|pick|unlock|bypass|disable|open)\b[\s\S]{0,120}\b(trap|mechanism|lock|wire|runes|device)\b[\s\S]{0,120}\b(study|inspect|analyze|solve|decode|investigate|trace|identify|figure out|carefully|careful)\b/i.test(text);
    const physicalEnvTask = /\b(break|smash|force|kick|shoulder|lift|climb|swim|disarm|pick|unlock|jam)\b[\s\S]{0,80}\b(door|gate|lock|trap|mechanism|wall|boulder|rock|river|cliff|tree)\b/i.test(text);
    const mentalEnvTask = /\b(search|inspect|study|analyze|track|forage|survival|navigate|identify|find|look for|solve|decode|investigate)\b[\s\S]{0,100}\b(food|supplies|edible|plants|herbs|tracks|trail|path|clue|mechanism|runes|map|woods|forest|wilderness|area|room|pantry|shelves|hidden|spirit|spirits|ghost|ghosts|aura|auras)\b/i.test(text);
    const magicalEnvTask = /\b(dispel|counterspell|unweave|break|suppress|cleanse|banish|ward|seal|unseal|detect|sense|read|study|analyze)\b[\s\S]{0,100}\b(ward|seal|barrier|curse|hex|enchantment|rune|runes|magic|spell|door|gate|altar|circle)\b/i.test(text)
        || /\b(warded|sealed|enchanted|cursed|hexed|magical)\b[\s\S]{0,100}\b(door|gate|altar|circle|barrier|seal|lock)\b/i.test(text);
    const distractionTheft = /\b(look over there|over there|look away|point|distract|misdirect)\b/i.test(text)
        && /\b(reach(?:ing|es|ed)?|grab(?:bing|s|bed)?|take|taking|snatch(?:ing|es|ed)?|pocket(?:ing|s|ed)?|steal(?:ing|s)?)\b[\s\S]{0,80}\b(bill|coin|money|purse|wallet|key|gem|ring|item)\b/i.test(text);
    const intimacyPhysical = /\b(kiss|touch|embrace|cuddle|grope|caress|fondle|strip|undress)\b/i.test(text);
    const sexualPhysicalIntimacy = intimacyPhysical
        || Boolean(namedClothingIntimacyTarget)
        || /\b(grab|touch|grope|fondle|caress|pull|lift|remove)\b[\s\S]{0,80}\b(breast|boob|chest|ass|butt|thigh|panties|underwear|bra|skirt|dress)\b/i.test(text);
    const distractionIntimacy = hasTarget
        && /\b(distract|look away|looks away|glance away|turn away|point|look over there)\b/i.test(text)
        && intimacyPhysical;
    const introducedName = namedIntroducedTarget?.[1] || '';
    const introducedStats = parseCoreStats(text);
    const introducedDisposition = parseDispositionText(text);
    const introducedRapport = parseRapportText(text);
    const introducedRapportLock = parseRapportLockText(text);
    const introducedIntimacyGate = parseIntimacyGateText(text);
    const taskDelta = inferTaskDelta(text, target || characterName || '');
    const targetedMagic = hasTarget && /\b(magic|spell|cast|channel|invoke|weave|curse|hex|charm|glamour|compel|bewitch|enchant|dominate|blast|burn|freeze|shock|smite|firebolt|ward|dispel|counterspell)\b/i.test(text);
    const socialMagic = targetedMagic && /\b(charm|glamour|compel|bewitch|enchant|dominate|aura|presence|fear)\b/i.test(text);
    const simpleDirectInteraction = hasTarget
        && !containsAttack
        && !physicalCoercion
        && !targetedMagic
        && !sexualPhysicalIntimacy
        && !distractionTheft
        && !stealthLiving
        && !sleightVsAwareness
        && /\b(nod|wave|smile|look|glance|bow|greet|say|tell|ask|thank|apologize|compliment|praise)\b/i.test(text);
    const introducedPreset = /\b(girlfriend|boyfriend|lover|spouse|wife|husband|partner|romantic|in love|close and trusting|currentDisposition\s*B\s*4|B4\s*\/\s*F\s*1\s*\/\s*H\s*1)\b/i.test(text)
        ? 'romanticOpen'
        : /\b(currentDisposition\s*B\s*3|B3\s*\/\s*F\s*1\s*\/\s*H\s*2|trusted|admired|known favorably)\b/i.test(text)
            ? 'userGoodRep'
            : /\b(currentDisposition\s*B\s*1|H\s*3|hated|distrusted|wanted|bad reputation)\b/i.test(text)
                ? 'userBadRep'
                : 'neutralDefault';

    const riskyIntroducedAction = /\b(point|look over there|distract|misdirect|fool|trick|reach|grab|take|snatch|pocket|steal|pickpocket|kiss|touch|grope|caress|hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|shove|push|grab|yank|drag|pin|restrain|tackle|trip|threaten|deceive|bluff|intimidate|coerce|demand|order)\b/i.test(text);

    if (hasTarget && (namedDeadNpc || namedForgottenNpc) && !Object.keys(fallback).length && !riskyIntroducedAction && !socialVerb && !physicalCoercion && !attack) {
        const forgotten = Boolean(namedForgottenNpc);
        fallback.goal = forgotten ? `${target} is marked forgotten` : `${target} is marked dead`;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = fallback.goal;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = '';
        fallback.outcomeOnFailure = '';
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [];
        fallback.benefitedObservers = [];
        fallback.harmedObservers = [];
        fallback.npcInScene = [];
        fallback.hasStakes = 'N';
        fallback.stakesEvidence = 'Explicit NPC archive lifecycle update with no contested action.';
        fallback.systemOnlyUpdate = 'Y';
        fallback.systemOnlyUpdateReason = forgotten
            ? 'Archive lifecycle declaration only. Do not narrate the NPC being forgotten as an in-scene event.'
            : 'Archive lifecycle declaration only. Do not narrate a new death or causal death scene unless the user explicitly described the death happening in-scene.';
        fallback.actionCount = 1;
        fallback.userStat = 'MND';
        fallback.userStatEvidence = '';
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.newEncounter = 'N';
        fallback.resolverBypass = true;
        fallback.scene = { location: '', time: '', weather: '' };
        fallback.npcFacts = [{
            name: target,
            present: false,
            position: '',
            condition: forgotten ? '' : 'dead',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
            archiveStatus: forgotten ? 'Forgotten' : 'Dead',
        }];
        fallback.inventoryDeltas = [];
        fallback.taskDeltas = [];
    }

    if (hasTarget && (namedSceneEntry || namedSceneExit) && !Object.keys(fallback).length && !riskyIntroducedAction && !socialVerb && !physicalCoercion && !attack) {
        const entering = Boolean(namedSceneEntry);
        fallback.goal = entering ? `${target} enters the scene` : `${target} leaves the scene`;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = fallback.goal;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = '';
        fallback.outcomeOnFailure = '';
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [];
        fallback.benefitedObservers = [];
        fallback.harmedObservers = [];
        fallback.npcInScene = entering ? [target] : [];
        fallback.hasStakes = 'N';
        fallback.stakesEvidence = 'Explicit scene presence update with no risky user action.';
        fallback.systemOnlyUpdate = 'Y';
        fallback.systemOnlyUpdateReason = entering
            ? 'Scene presence declaration only. Treat as continuity/tracker placement, not a contested action.'
            : 'Scene presence declaration only. Treat as continuity/tracker removal, not a contested action.';
        fallback.actionCount = 1;
        fallback.userStat = 'MND';
        fallback.userStatEvidence = '';
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.newEncounter = 'N';
        fallback.resolverBypass = true;
        fallback.scene = { location: '', time: '', weather: '' };
        fallback.npcFacts = [{
            name: target,
            present: entering,
            position: entering ? '' : '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
            archiveStatus: 'Active',
        }];
        fallback.inventoryDeltas = [];
        fallback.taskDeltas = [];
    }

    if (introducedName && !Object.keys(fallback).length && !hasTarget && !riskyIntroducedAction) {
        fallback.goal = 'no active user action';
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = 'no active user action';
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = '';
        fallback.outcomeOnFailure = '';
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [introducedName];
        fallback.hasStakes = 'N';
        fallback.stakesEvidence = 'Scene/tracker setup or passive presence with no explicit risky action.';
        fallback.actionCount = 1;
        fallback.userStat = 'MND';
        fallback.userStatEvidence = '';
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: introducedName,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: introducedPreset,
            rank: 'unknown',
            mainStat: 'unknown',
            explicitStats: introducedStats,
            disposition: introducedDisposition,
            rapport: introducedRapport,
            rapportEncounterLock: introducedRapportLock,
            intimacyGate: introducedIntimacyGate,
            override: /\b(intimacyGate\s*ALLOW|established|already intimate|receptive)\b/i.test(text) ? 'Established' : 'NONE',
        }];
    }

    if (intimateVerbalRequest && !Object.keys(fallback).length) {
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'IntimacyAdvanceVerbal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(ask|tell|demand|request)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `${target} accepts the user's explicit intimate proposition if the intimacy gate allows it.`;
        fallback.outcomeOnFailure = `${target} refuses or rejects the explicit intimate proposition.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit verbal intimacy proposition toward a named NPC.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = 'verbal intimacy proposition';
        fallback.oppStat = 'MND';
        fallback.oppStatEvidence = 'Target resists pressure, boundary violation, or unwanted intimacy with will/awareness.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (targetedMagic && !Object.keys(fallback).length) {
        const magicSummary = text.match(/\b(cast|channel|invoke|weave|curse|hex|charm|glamour|compel|bewitch|enchant|dominate|blast|burn|freeze|shock|smite|firebolt|dispel|counterspell|spell)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.goal = magicSummary;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = magicSummary;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `${target} is affected by the user's supernatural action.`;
        fallback.outcomeOnFailure = `${target} resists or avoids the user's supernatural action.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Targeted supernatural action against a living entity; living opposition is not ENV.';
        fallback.actionCount = 1;
        fallback.userStat = socialMagic ? 'CHA' : 'MND';
        fallback.userStatEvidence = socialMagic ? 'social or coercive supernatural influence' : 'deliberate magical or supernatural exertion';
        fallback.oppStat = 'MND';
        fallback.oppStatEvidence = 'Living target resists supernatural influence, curse, or magical force with will/awareness.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (hasTarget && (shovePast || attack || physicalCoercion) && !sexualPhysicalIntimacy) {
        const physicalSummary = summarizeAttackSequence(text) || text.match(/\b(shove|push|shoulder|barge|force|grab|yank|drag|pin|restrain|tackle|trip|throw|hurl|toss|fling|spit|hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|swing|swipe|sweep|thrust|jab|drive)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.goal = attack && !shovePast ? `attack ${target}` : physicalSummary;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = physicalSummary;
        fallback.decisiveAction = physicalSummary;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = shovePast ? `User gets past ${target}.` : `User's physical action against ${target} succeeds.`;
        fallback.outcomeOnFailure = shovePast ? `${target} prevents the user from getting past.` : `User's physical action against ${target} fails.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = blockWords ? text : 'Explicit physical contest, coercion, or hostile contact against a named NPC.';
        fallback.actionCount = attackActionCount(text);
        fallback.userStat = 'PHY';
        fallback.userStatEvidence = text.match(/\b(shove|push|shoulder|barge|force|grab|yank|drag|pin|restrain|tackle|trip|throw|hurl|toss|fling|spit|hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|swing|swipe|sweep|thrust|jab|drive)\b/i)?.[0] || 'physical action';
        fallback.oppStat = 'PHY';
        fallback.oppStatEvidence = blockWords ? text : 'Named NPC physically contests or receives the physical action.';
        fallback.hostilePhysicalHarm = attack && !shovePast ? 'Y' : 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (affectionDeclaration && !Object.keys(fallback).length) {
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(tell|say)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = '';
        fallback.outcomeOnFailure = '';
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'N';
        fallback.stakesEvidence = 'Affectionate declaration without explicit pressure, request, or material stakes.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = 'affectionate declaration';
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (directAidAction && !Object.keys(fallback).length) {
        const aidVerb = text.match(/\b(give|hand|return|offer|help|heal|protect|shield|free|release|rescue|save)\b/i)?.[0] || 'help';
        const magicalAid = /\b(heal|cure|blessing|bless|curse|poison|spell|magic|ward|hex)\b/i.test(text);
        const carefulAid = /\b(lock|locked|trap|chains?|mechanism|careful|carefully|pick|unlock|disarm)\b/i.test(text);
        const aidStat = riskyAidAction ? (magicalAid || carefulAid ? 'MND' : 'PHY') : 'CHA';
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(give|hand|return|offer|help|heal|protect|shield|free|release|rescue|save)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = riskyAidAction ? `${target}'s situation improves because the user succeeds at the aid action.` : '';
        fallback.outcomeOnFailure = riskyAidAction ? `${target}'s situation does not improve.` : '';
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = riskyAidAction ? ['hazard or obstacle'] : [];
        fallback.npcInScene = [target];
        fallback.hasStakes = riskyAidAction ? 'Y' : 'N';
        fallback.stakesEvidence = riskyAidAction
            ? 'Direct aid faces an explicit obstacle, hazard, injury, restraint, or time pressure; success materially improves the target NPC situation.'
            : 'Direct aid, offer, gift, or return with no explicit risk, obstacle, cost, pressure, or contested outcome.';
        fallback.actionCount = 1;
        fallback.userStat = aidStat;
        fallback.userStatEvidence = riskyAidAction
            ? (aidStat === 'MND' ? 'careful, healing, magical, or technical aid' : 'physical rescue, shielding, or protection')
            : `uncontested ${aidVerb} action`;
        fallback.oppStat = riskyAidAction ? 'ENV' : 'ENV';
        fallback.oppStatEvidence = riskyAidAction ? 'The opposition is the nonliving hazard, restraint, injury, or obstacle.' : '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (hasTarget && socialVerb && !distractionTheft && !distractionIntimacy && !Object.keys(fallback).length) {
        const harmlessSocial = ordinaryHarmlessRequest || harmlessSocialExpression;
        const transaction = contextTarget && /\b(coin|coins|silver|gold|copper|pay|pays|paid|place|places|set|sets|put|puts|take|buy|room|meal|nights?|pouch|table|counter)\b/i.test(text);
        fallback.decisiveAction = transaction
            ? directInteractionAction(text, target)
            : text.match(/\b(tell|say|ask|convince|persuade|lie|deceive|bluff|threaten|warn|promise|negotiate|intimidate|coerce|demand|order|thank|apologize|compliment|praise|greet|mock|insult|taunt|humiliate|ridicule)[^.?!]*/i)?.[0] || text.slice(0, 140);
        fallback.goal = transaction ? `complete transaction with ${target}` : fallback.decisiveAction;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = fallback.decisiveAction;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = harmlessSocial ? '' : (hostileSocial ? `${target} is pressured or misled by the user's social action.` : `${target} is influenced by the user's social action.`);
        fallback.outcomeOnFailure = harmlessSocial ? '' : (hostileSocial ? `${target} resists or sees through the user's social action.` : `${target} is not influenced by the user's social action.`);
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = harmlessSocial ? [] : [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = harmlessSocial ? 'N' : 'Y';
        fallback.stakesEvidence = harmlessSocial ? 'Ordinary harmless social expression/request with no explicit risk, cost, pressure, or meaningful consequence.' : (hostileSocial ? text : 'Explicit social action toward a named NPC with possible compliance/refusal.');
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = text.match(/\b(convince|persuade|lie|deceive|bluff|threaten|promise|negotiate|intimidate|coerce|demand|order|tell|say|ask|thank|apologize|compliment|praise|greet|mock|insult|taunt|humiliate|ridicule)\b/i)?.[0] || 'social action';
        fallback.oppStat = harmlessSocial ? 'ENV' : (hostileSocial ? 'MND' : 'CHA');
        fallback.oppStatEvidence = harmlessSocial ? '' : (hostileSocial ? 'Target resists pressure, deception, fear, or coercion with will/awareness.' : 'Target resists or contests interpersonal influence.');
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (simpleDirectInteraction && !Object.keys(fallback).length) {
        fallback.goal = `interact with ${target}`;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = directInteractionAction(text, target);
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = '';
        fallback.outcomeOnFailure = '';
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'N';
        fallback.stakesEvidence = 'Direct harmless interaction with a named NPC; initialize/track the NPC but do not roll.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = 'direct harmless interaction';
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = '';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if ((stealthLiving || sleightVsAwareness) && !Object.keys(fallback).length) {
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(sneak|creep|slip|hide|move quietly|pickpocket|steal|palm|conceal|pocket|snatch)[^.?!]*/i)?.[0] || `avoid ${target}'s notice`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `User avoids ${target}'s notice.`;
        fallback.outcomeOnFailure = `${target} notices or blocks the attempt.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'A living observer passively opposes the stealth attempt.';
        fallback.actionCount = 1;
        fallback.userStat = 'PHY';
        fallback.userStatEvidence = 'stealth movement or sleight of hand';
        fallback.oppStat = 'MND';
        fallback.oppStatEvidence = 'Target resists with awareness, perception, and attention.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (distractionIntimacy && !Object.keys(fallback).length) {
        const intimateVerb = text.match(/\b(kiss|touch|embrace|cuddle|grope|caress|fondle|strip|undress)\b/i)?.[1]?.toLowerCase() || 'touch';
        fallback.goal = `${intimateVerb} ${target}`;
        fallback.goalKind = 'IntimacyAdvancePhysical';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(distract|point|tell|say|ask)[^.?!]*/i)?.[0] || `distract ${target}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `${target} is distracted long enough for the user's physical advance to create a serious boundary violation unless the intimacy gate allows it.`;
        fallback.outcomeOnFailure = `${target} does not look away or is not distracted enough for the attempted physical advance.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit distraction is used to enable a physical intimacy advance toward a named NPC.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = 'MND';
        fallback.oppStatEvidence = 'Target resists deception, distraction, or loss of awareness.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (hasTarget && sexualPhysicalIntimacy && !Object.keys(fallback).length) {
        const intimateVerb = text.match(/\b(kiss|touch|embrace|cuddle|grope|caress|fondle|strip|undress|lift|pull|remove)\b/i)?.[1]?.toLowerCase() || 'touch';
        fallback.goal = `${intimateVerb} ${target}`;
        fallback.goalKind = 'IntimacyAdvancePhysical';
        fallback.goalEvidence = text;
        fallback.decisiveAction = `${intimateVerb} ${target}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `${target} accepts or allows the user's physical intimacy only if the intimacy gate allows it.`;
        fallback.outcomeOnFailure = `${target} refuses, blocks, avoids, or rejects the physical intimacy advance.`;
        fallback.actionTargets = [target];
        fallback.oppTargetsNpc = [target];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = [target];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit physical intimacy advance toward a named NPC.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = 'physical intimacy advance';
        fallback.oppStat = 'MND';
        fallback.oppStatEvidence = 'Target resists unwanted intimacy, boundary pressure, or loss of autonomy with will/awareness.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [{
            name: target,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }];
    }

    if (chasmJump && !Object.keys(fallback).length) {
        const obstacle = text.match(/\b(chasm|gap|ravine|pit|ledge|crevasse)\b/i)?.[1] || 'obstacle';
        fallback.goal = `cross the ${obstacle}`;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(jump|leap|vault)[^.?!]*/i)?.[0] || `jump over the ${obstacle}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `User clears the ${obstacle}.`;
        fallback.outcomeOnFailure = `User fails to clear the ${obstacle}.`;
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [obstacle];
        fallback.npcInScene = [];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit physical crossing attempt over a dangerous obstacle.';
        fallback.actionCount = 1;
        fallback.userStat = 'PHY';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = obstacle;
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [];
    }

    if (magicalEnvTask && !Object.keys(fallback).length) {
        const obstacle = text.match(/\b(ward|seal|barrier|curse|hex|enchantment|rune|runes|magic|spell|door|gate|altar|circle|lock)\b/i)?.[1] || 'magical obstacle';
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(dispel|counterspell|unweave|break|suppress|cleanse|banish|ward|seal|unseal|detect|sense|read|study|analyze)[^.?!]*/i)?.[0] || `resolve the ${obstacle}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `User overcomes or reads the ${obstacle}.`;
        fallback.outcomeOnFailure = `User fails to overcome or read the ${obstacle}.`;
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [obstacle];
        fallback.npcInScene = [];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit supernatural task against nonliving magical/environmental opposition.';
        fallback.actionCount = 1;
        fallback.userStat = 'MND';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = obstacle;
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [];
    }

    if (physicalEnvTask && !technicalMentalEnvTask && !Object.keys(fallback).length) {
        const obstacle = text.match(/\b(door|gate|lock|trap|mechanism|wall|boulder|rock|river|cliff|tree)\b/i)?.[1] || 'obstacle';
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(break|smash|force|kick|shoulder|lift|climb|swim|disarm|pick|unlock|jam)[^.?!]*/i)?.[0] || `handle the ${obstacle}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `User overcomes the ${obstacle}.`;
        fallback.outcomeOnFailure = `User fails to overcome the ${obstacle}.`;
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [obstacle];
        fallback.npcInScene = [];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit physical task against a nonliving obstacle.';
        fallback.actionCount = 1;
        fallback.userStat = 'PHY';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = obstacle;
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [];
    }

    if ((mentalEnvTask || technicalMentalEnvTask) && !Object.keys(fallback).length) {
        const obstacle = text.match(/\bedible\s+(plants)\b/i)?.[1]
            || text.match(/\b(food|plants|herbs|supplies|edible|tracks|trail|path|clue|mechanism|trap|lock|wire|device|runes|map|woods|forest|wilderness|area|room|pantry|shelves|hidden|spirit|spirits|ghost|ghosts|aura|auras)\b/i)?.[1]
            || 'environment';
        fallback.goal = text.slice(0, 140);
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/\b(search|inspect|study|analyze|track|forage|survival|navigate|identify|find|look for|solve|decode|investigate|disarm|pick|unlock|bypass|disable)[^.?!]*/i)?.[0] || `read the ${obstacle}`;
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `User gets useful results from the ${obstacle}.`;
        fallback.outcomeOnFailure = `User fails to get useful results from the ${obstacle}.`;
        fallback.actionTargets = [];
        fallback.oppTargetsNpc = [];
        fallback.oppTargetsEnv = [obstacle];
        fallback.npcInScene = [];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit mental or survival task against nonliving/environmental opposition.';
        fallback.actionCount = 1;
        fallback.userStat = 'MND';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = 'ENV';
        fallback.oppStatEvidence = obstacle;
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = [];
    }

    if (distractionTheft && !Object.keys(fallback).length) {
        const item = text.match(/\b(?:bill|coin|money|purse|wallet|key|gem|ring|item)\b/i)?.[0] || 'item';
        const observer = target || introducedName || '';
        fallback.goal = `take the ${item}`;
        fallback.goalKind = 'Normal';
        fallback.goalEvidence = text;
        fallback.decisiveAction = text.match(/(["â€œ][^"â€]*(?:look over there|over there|look)[^"â€]*["â€]|point[^.?!]*|distract[^.?!]*)/i)?.[0] || 'distract the observer';
        fallback.decisiveAction = observer ? `distract ${observer}` : 'distract the observer';
        fallback.decisiveActionEvidence = text;
        fallback.outcomeOnSuccess = `The distraction works, allowing the user to take the ${item}.`;
        fallback.outcomeOnFailure = `The distraction fails, preventing an unnoticed grab for the ${item}.`;
        fallback.actionTargets = observer ? [observer] : [];
        fallback.oppTargetsNpc = observer ? [observer] : [];
        fallback.oppTargetsEnv = [];
        fallback.npcInScene = observer ? [observer] : [];
        fallback.hasStakes = 'Y';
        fallback.stakesEvidence = 'Explicit distraction used to enable taking a valuable item.';
        fallback.actionCount = 1;
        fallback.userStat = 'CHA';
        fallback.userStatEvidence = fallback.decisiveAction;
        fallback.oppStat = observer ? 'MND' : 'ENV';
        fallback.oppStatEvidence = observer ? 'Target resists bluff, distraction, or concealed intent.' : 'No explicit living observer was named.';
        fallback.hostilePhysicalHarm = 'N';
        fallback.npcFacts = observer ? [{
            name: observer,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: 'neutralDefault',
            rank: 'unknown',
            mainStat: 'unknown',
            override: 'NONE',
        }] : [];
        fallback.inventoryDeltas = [];
        fallback.taskDeltas = [];
    }

    const absentNames = [...text.matchAll(/\b([A-Z][A-Za-z0-9_'-]{1,40})\s+(?:is\s+|are\s+)?(?:no longer present|absent|gone|leaves|left|exits|walks away|goes away)\b/gi)]
        .map(match => cleanNpcName(match[1]))
        .filter(Boolean);

    if (introducedName && introducedStats) {
        const baseFact = {
            name: introducedName,
            position: '',
            condition: '',
            knowsUser: '',
            explicitPreset: introducedPreset,
            rank: 'unknown',
            mainStat: 'unknown',
            disposition: introducedDisposition,
            rapport: introducedRapport,
            rapportEncounterLock: introducedRapportLock,
            intimacyGate: introducedIntimacyGate,
            override: /\b(intimacyGate\s*ALLOW|established|already intimate|receptive)\b/i.test(text) ? 'Established' : 'NONE',
            explicitStats: introducedStats,
        };
        fallback.npcFacts = Array.isArray(fallback.npcFacts) ? fallback.npcFacts : [];
        const idx = fallback.npcFacts.findIndex(fact => eqName(fact?.name, introducedName));
        if (idx >= 0) {
            fallback.npcFacts[idx] = {
                ...fallback.npcFacts[idx],
                explicitStats: introducedStats,
                disposition: introducedDisposition || fallback.npcFacts[idx].disposition,
                rapport: introducedRapport ?? fallback.npcFacts[idx].rapport,
                rapportEncounterLock: introducedRapportLock || fallback.npcFacts[idx].rapportEncounterLock,
                intimacyGate: introducedIntimacyGate || fallback.npcFacts[idx].intimacyGate,
                override: introducedIntimacyGate === 'ALLOW' ? 'Established' : fallback.npcFacts[idx].override,
            };
        } else {
            fallback.npcFacts.push(baseFact);
        }
    }

    if ((introducedStats || introducedDisposition || introducedRapport !== null || introducedRapportLock || introducedIntimacyGate) && target) {
        fallback.npcFacts = Array.isArray(fallback.npcFacts) ? fallback.npcFacts : [];
        const idx = fallback.npcFacts.findIndex(fact => eqName(fact?.name, target));
        if (idx >= 0) {
            fallback.npcFacts[idx] = {
                ...fallback.npcFacts[idx],
                explicitStats: introducedStats || fallback.npcFacts[idx].explicitStats,
                disposition: introducedDisposition || fallback.npcFacts[idx].disposition,
                rapport: introducedRapport ?? fallback.npcFacts[idx].rapport,
                rapportEncounterLock: introducedRapportLock || fallback.npcFacts[idx].rapportEncounterLock,
                intimacyGate: introducedIntimacyGate || fallback.npcFacts[idx].intimacyGate,
                override: introducedIntimacyGate === 'ALLOW' ? 'Established' : fallback.npcFacts[idx].override,
            };
        } else {
            fallback.npcFacts.push({
                name: target,
                position: '',
                condition: '',
                knowsUser: '',
                explicitPreset: introducedPreset,
                rank: 'unknown',
                mainStat: 'unknown',
                override: 'NONE',
                explicitStats: introducedStats,
                disposition: introducedDisposition,
                rapport: introducedRapport,
                rapportEncounterLock: introducedRapportLock,
                intimacyGate: introducedIntimacyGate,
            });
        }
    }

    if (absentNames.length) {
        fallback.npcFacts = Array.isArray(fallback.npcFacts) ? fallback.npcFacts : [];
        for (const name of absentNames) {
            const idx = fallback.npcFacts.findIndex(fact => eqName(fact?.name, name));
            if (idx >= 0) {
                fallback.npcFacts[idx] = { ...fallback.npcFacts[idx], present: false };
            } else {
                fallback.npcFacts.push({
                    name,
                    present: false,
                    position: '',
                    condition: '',
                    knowsUser: '',
                    explicitPreset: 'unknown',
                    rank: 'unknown',
                    mainStat: 'unknown',
                    override: 'unknown',
                });
            }
        }
    }

    if (taskDelta) {
        if (!Object.keys(fallback).length) {
            fallback.goal = taskDelta.action === 'add' ? 'record accepted pending task' : `record ${taskDelta.action}d pending task`;
            fallback.goalKind = 'Normal';
            fallback.goalEvidence = taskDelta.evidence;
            fallback.decisiveAction = fallback.goal;
            fallback.decisiveActionEvidence = taskDelta.evidence;
            fallback.outcomeOnSuccess = '';
            fallback.outcomeOnFailure = '';
            fallback.actionTargets = [];
            fallback.oppTargetsNpc = [];
            fallback.oppTargetsEnv = [];
            fallback.benefitedObservers = [];
            fallback.harmedObservers = [];
            fallback.npcInScene = [];
            fallback.hasStakes = 'N';
            fallback.stakesEvidence = 'Explicit tracker/task update with no contested in-scene action.';
            fallback.systemOnlyUpdate = 'Y';
            fallback.systemOnlyUpdateReason = 'Pending-task tracker update only. Do not invent an in-scene success/failure event from this declaration.';
            fallback.actionCount = 1;
            fallback.userStat = 'MND';
            fallback.userStatEvidence = '';
            fallback.oppStat = 'ENV';
            fallback.oppStatEvidence = '';
            fallback.hostilePhysicalHarm = 'N';
            fallback.newEncounter = 'N';
            fallback.resolverBypass = true;
            fallback.scene = { location: '', time: '', weather: '' };
            fallback.npcFacts = [];
            fallback.inventoryDeltas = [];
        }
        fallback.taskDeltas = [...(Array.isArray(fallback.taskDeltas) ? fallback.taskDeltas : []), taskDelta];
    }

    const timeDelta = inferTimeDeltaMinutes(text);
    if (timeDelta && (!Object.keys(fallback).length || fallback.systemOnlyUpdate === 'Y')) {
        if (!Object.keys(fallback).length) {
            fallback.goal = 'advance scene time';
            fallback.goalKind = 'Normal';
            fallback.goalEvidence = text;
            fallback.decisiveAction = 'advance scene time';
            fallback.decisiveActionEvidence = text;
            fallback.outcomeOnSuccess = '';
            fallback.outcomeOnFailure = '';
            fallback.actionTargets = [];
            fallback.oppTargetsNpc = [];
            fallback.oppTargetsEnv = [];
            fallback.benefitedObservers = [];
            fallback.harmedObservers = [];
            fallback.npcInScene = [];
            fallback.hasStakes = 'N';
            fallback.stakesEvidence = 'Explicit time passage; no contested action.';
            fallback.actionCount = 1;
            fallback.userStat = 'MND';
            fallback.userStatEvidence = '';
            fallback.oppStat = 'ENV';
            fallback.oppStatEvidence = '';
            fallback.hostilePhysicalHarm = 'N';
            fallback.newEncounter = 'N';
            fallback.systemOnlyUpdate = 'Y';
            fallback.systemOnlyUpdateReason = 'Explicit time passage updates tracker time only.';
            fallback.scene = { location: '', time: '', weather: '' };
            fallback.npcFacts = [];
            fallback.inventoryDeltas = [];
            fallback.taskDeltas = [];
        }
        fallback.timeDeltaMinutes = timeDelta.minutes;
        fallback.timeSkipReason = timeDelta.reason;
    }

    return fallback;
}

function contextualInteractionUsesCurrentTarget(text) {
    const source = String(text || '');
    if (!source.trim()) return false;
    if (/\b(he|him|his|she|her|hers|they|them|their)\b/i.test(source)) return true;
    if (/"[^"]+"/.test(source) && /\b(I|I'll|I will|thank|thanks|yes|no|take|buy|pay|give|hand|place|set|offer|accept|decline|agree|ask|tell|say)\b/i.test(source)) return true;
    return /\b(look|glance|nod|smile|bow|gesture|hand|give|offer|place|set|pay|buy|take|accept|decline|thank|apologize|answer|reply)\b/i.test(source);
}

function physicalContextActionUsesCurrentTarget(text) {
    const source = String(text || '');
    return /\b(hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|swing|swipe|sweep|thrust|jab|grab|yank|drag|pin|restrain|tackle|trip|shove|push|barge|force)\b/i.test(source);
}

function directInteractionAction(text, target) {
    const source = String(text || '');
    const direct = source.match(new RegExp(`\\b(nod|wave|smile|look|glance|bow|greet|say|tell|ask|thank|apologize|compliment|praise)\\b[^.?!]{0,80}\\b${escapeRegExp(target)}\\b`, 'i'))?.[0];
    if (direct) return cleanText(direct);
    const pronoun = source.match(/\b(look|glance|nod|smile|bow|gesture|hand|give|offer|place|set|pay|buy|take|accept|decline|thank|apologize|answer|reply)\b[^.?!]{0,80}\b(?:him|her|them|his|hers|their)\b/i)?.[0];
    if (pronoun) return cleanText(`${pronoun} (${target})`);
    const quoted = source.match(/["“]([^"”]{1,120})["”]/)?.[1];
    if (quoted) return cleanText(`speak to ${target}: "${quoted}"`);
    return `interact with ${target}`;
}

function inferTimeDeltaMinutes(text) {
    const source = String(text || '').toLowerCase();
    if (/["“”][\s\S]*\b(?:minutes?|mins?|hours?|hrs?|days?|weeks?|month|year)s?\b[\s\S]*["“”]/.test(source)
        && !/\b(wait|sleep|rest|travel|ride|skip|timeskip|time skip|after|later|pass(?:es|ed)?|until)\b/.test(source.replace(/["“”][\s\S]*?["“”]/g, ''))) {
        return null;
    }
    if (!/\b(wait|sleep|rest|travel|walk|ride|after|later|pass|skip|timeskip|time skip)\b/.test(source)) return null;
    const match = source.match(/\b(?:(\d+(?:\.\d+)?)|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter))\s*(minutes?|mins?|hours?|hrs?|days?)\b/);
    if (!match) {
        if (/\bovernight\b|\buntil\s+(?:morning|dawn|sunrise)\b/.test(source)) {
            return { minutes: 8 * 60, reason: 'overnight or until morning/dawn' };
        }
        return null;
    }
    const raw = match[1] ? Number(match[1]) : numberWordToValue(match[2]);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const unit = match[3] || '';
    const minutes = unit.startsWith('day') ? raw * 1440 : unit.startsWith('hour') || unit.startsWith('hr') ? raw * 60 : raw;
    return { minutes: Math.round(minutes), reason: match[0] };
}

function numberWordToValue(word) {
    return ({
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        eleven: 11,
        twelve: 12,
        half: 0.5,
        quarter: 0.25,
    })[String(word || '').toLowerCase()] ?? NaN;
}

function inferTaskDelta(text, source = '') {
    const value = String(text || '').trim();
    if (!value) return null;
    const lower = value.toLowerCase();
    const evidence = value.slice(0, 220);
    const due = cleanText(
        value.match(/\b(?:by|before|at|on)\s+((?:tomorrow|tonight|dawn|noon|midnight|morning|evening|sunset|sunrise|next\s+\w+|[A-Z]?[a-z]+day|the\s+\w+)(?:[^.?!,;]{0,40})?)/i)?.[1]
        || value.match(/\b(in\s+\d+\s+(?:minutes?|hours?|days?|weeks?))\b/i)?.[1]
        || ''
    );

    const completeMatch = value.match(/\bI\s+(?:finished|finish|completed|complete|did|handled|delivered|met|kept)\b[\s\S]{0,160}?\b(?:quest|task|job|errand|promise|delivery|appointment|meeting|favor)\b(?:\s+(?:to|for|about)\s+([^.?!;]+))?/i)
        || value.match(/\b(?:quest|task|job|errand|promise|delivery|appointment|meeting|favor)\b[\s\S]{0,80}?\b(?:is|was)\s+(?:finished|complete|completed|done|handled|delivered|kept)\b/i);
    if (completeMatch) {
        return {
            action: 'complete',
            task: cleanTaskText(completeMatch[1] || completeMatch[0]),
            due: '',
            source: cleanText(source),
            evidence,
        };
    }

    const cancelMatch = value.match(/\bI\s+(?:cancel|cancelled|canceled|abandon|abandoned|drop|dropped|refuse|refused|decline|declined)\b[\s\S]{0,160}?\b(?:quest|task|job|errand|promise|delivery|appointment|meeting|favor)\b(?:\s+(?:to|for|about)\s+([^.?!;]+))?/i)
        || value.match(/\b(?:cancel|remove|drop)\s+(?:the\s+)?(?:quest|task|job|errand|promise|delivery|appointment|meeting|favor)\b(?:\s+(?:to|for|about)\s+([^.?!;]+))?/i);
    if (cancelMatch) {
        const meetingTarget = value.match(/\b(?:meeting|appointment)\s+with\s+([A-Z][A-Za-z0-9_'-]{1,40})\b/i)?.[1];
        return {
            action: 'cancel',
            task: meetingTarget ? `meet ${meetingTarget}` : cleanTaskText(cancelMatch[1] || cancelMatch[0]),
            due: '',
            source: cleanText(source),
            evidence,
        };
    }

    const explicitAgreement = /\bI\s+(?:accept|agree|promise|swear|take on|take up|take the job|accept the quest|agree to help|schedule|arrange)\b/i.test(value);
    const assignedAndAccepted = /\b(?:quest|job|task|errand|favor|delivery|appointment|meeting)\b/i.test(value)
        && /\b(?:accepted|agreed|promised|scheduled|assigned to me|given to me)\b/i.test(lower);
    if (!explicitAgreement && !assignedAndAccepted) return null;

    const task =
        value.match(/\b(?:accept|accepted|take on|take up|take the job|accept the quest)\b[\s\S]{0,80}?\b(?:to|for|about)\s+([^.?!;]+)/i)?.[1]
        || value.match(/\b(?:agree|agreed|promise|promised|swear|swore|schedule|scheduled|arrange|arranged)\s+to\s+([^.?!;]+)/i)?.[1]
        || value.match(/\b(?:quest|job|task|errand|favor|delivery)\s+(?:to|for|about)\s+([^.?!;]+)/i)?.[1]
        || value.match(/\b(?:appointment|meeting)\s+(?:with|at|for)\s+([^.?!;]+)/i)?.[0]
        || value;
    const cleanTask = cleanTaskText(task);
    if (!cleanTask) return null;

    return {
        action: 'add',
        task: cleanTask,
        due,
        source: cleanText(source),
        evidence,
    };
}

function cleanTaskText(value) {
    return cleanText(String(value || '')
        .replace(/^\s*(?:the\s+)?(?:quest|task|job|errand|promise|delivery|appointment|meeting|favor)\s*(?:to|for|about|with|at)?\s*/i, '')
        .replace(/\b(?:by|before|at|on)\s+(?:tomorrow|tonight|dawn|noon|midnight|morning|evening|sunset|sunrise|next\s+\w+|[A-Z]?[a-z]+day|the\s+\w+)(?:[^.?!,;]{0,40})?$/i, '')
        .trim());
}

function singlePresentNpcName(tracker) {
    if (!tracker || typeof tracker !== 'object' || !Array.isArray(tracker.presentNpcIds)) {
        return '';
    }
    const present = tracker.presentNpcIds
        .map(id => tracker.npcs?.[id])
        .filter(npc => npc?.name);
    return present.length === 1 ? String(present[0].name).trim() : '';
}

function attackActionCount(text) {
    const source = String(text || '').toLowerCase();
    const attacks = source.match(/\b(hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|swing|swipe|sweep|thrust|jab)\b/g) || [];
    if (attacks.length > 1) return clamp(attacks.length, 1, 3);
    if (/\b(thrice|three times|3x|x3)\b/.test(source)) return 3;
    if (/\b(twice|two times|2x|x2)\b/.test(source)) return 2;
    const numeric = source.match(/\b(?:once|one time|1x|x1)\b/);
    if (numeric) return 1;
    return attacks.length ? 1 : 1;
}

function summarizeAttackSequence(text) {
    const source = String(text || '');
    const attacks = [...source.matchAll(/\b(hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|knee|swing|swipe|sweep|thrust|jab)\b[^.?!]*/gi)]
        .map(match => match[0].trim())
        .filter(Boolean)
        .slice(0, 3);
    return attacks.length > 1 ? attacks.join(' | ') : '';
}

function normalizeProxyActionText(text) {
    return String(text || '')
        .replace(/\b(have my character|my character|proxy narrator|proxy|narrate|continue|take over|make me|let me)\b/ig, 'I')
        .replace(/\bthen have I\b/ig, 'then I')
        .replace(/\bI\s+I\b/ig, 'I')
        .trim();
}

export function mergeExtractionWithFallback(extraction, fallback) {
    if (!fallback || !Object.keys(fallback).length) {
        return extraction;
    }

    const merged = { ...(extraction || {}) };
    const emptyGoal = !merged.goal || /^(unspecified|unknown|none)/i.test(String(merged.goal));
    if (emptyGoal) {
        Object.assign(merged, fallback);
    } else {
        for (const key of ['actionTargets', 'oppTargetsNpc', 'oppTargetsEnv', 'npcInScene', 'npcFacts']) {
            if (!Array.isArray(merged[key]) || merged[key].length === 0) {
                merged[key] = fallback[key] || merged[key];
            }
        }
        if (fallback.actionTargets?.length === 1 && merged.actionTargets?.length === 1 && !eqName(fallback.actionTargets[0], merged.actionTargets[0])) {
            const explicitTarget = fallback.actionTargets[0];
            const wrongTarget = merged.actionTargets[0];
            merged.actionTargets = [explicitTarget];
            if (Array.isArray(merged.oppTargetsNpc) && merged.oppTargetsNpc.some(name => eqName(name, wrongTarget))) {
                merged.oppTargetsNpc = unique(merged.oppTargetsNpc.map(name => eqName(name, wrongTarget) ? explicitTarget : name));
            } else if (fallback.oppTargetsNpc?.length) {
                merged.oppTargetsNpc = fallback.oppTargetsNpc;
            }
            if (Array.isArray(merged.npcInScene) && merged.npcInScene.some(name => eqName(name, wrongTarget))) {
                merged.npcInScene = unique(merged.npcInScene.map(name => eqName(name, wrongTarget) ? explicitTarget : name));
            } else if (fallback.npcInScene?.length) {
                merged.npcInScene = unique([...(merged.npcInScene || []), ...fallback.npcInScene]);
            }
        }
        for (const key of ['decisiveAction', 'decisiveActionEvidence', 'outcomeOnSuccess', 'outcomeOnFailure', 'hasStakes', 'stakesEvidence', 'userStat', 'userStatEvidence', 'oppStat', 'oppStatEvidence', 'hostilePhysicalHarm', 'timeSkipReason', 'systemOnlyUpdate', 'systemOnlyUpdateReason']) {
            if (!merged[key] || merged[key] === 'N' || merged[key] === 'unknown') {
                merged[key] = fallback[key] || merged[key];
            }
        }
        if (!Number(merged.timeDeltaMinutes) && Number(fallback.timeDeltaMinutes)) {
            merged.timeDeltaMinutes = fallback.timeDeltaMinutes;
        }
    }

    merged.benefitedObservers = Array.isArray(merged.benefitedObservers) ? merged.benefitedObservers : [];
    merged.harmedObservers = Array.isArray(merged.harmedObservers) ? merged.harmedObservers : [];
    merged.inventoryDeltas = Array.isArray(merged.inventoryDeltas) ? merged.inventoryDeltas : [];
    merged.scene = merged.scene || { location: '', time: '', weather: '' };
    merged.ooc = merged.ooc || 'N';
    merged.oocMode = merged.oocMode || (merged.ooc === 'Y' ? 'STOP' : 'IC');
    merged.oocInstruction = merged.oocInstruction || '';
    merged.newEncounter = merged.newEncounter || 'N';
    merged.timeDeltaMinutes = Number.isFinite(Number(merged.timeDeltaMinutes)) ? Number(merged.timeDeltaMinutes) : 0;
    merged.timeSkipReason = merged.timeSkipReason || '';
    const fallbackFacts = Array.isArray(fallback?.npcFacts)
        ? fallback.npcFacts.filter(x => x?.explicitStats || x?.disposition || x?.rapport !== null && x?.rapport !== undefined || x?.rapportEncounterLock || x?.intimacyGate)
        : [];
    if (fallbackFacts.length && Array.isArray(merged.npcFacts)) {
        merged.npcFacts = merged.npcFacts.map(fact => {
            const matchingFact = fallbackFacts.find(x => eqName(x.name, fact?.name));
            if (matchingFact) return {
                ...fact,
                explicitStats: fact.explicitStats || matchingFact.explicitStats,
                disposition: fact.disposition || matchingFact.disposition,
                rapport: fact.rapport !== null && fact.rapport !== undefined && Number.isFinite(Number(fact.rapport)) ? fact.rapport : matchingFact.rapport,
                rapportEncounterLock: fact.rapportEncounterLock || matchingFact.rapportEncounterLock,
                intimacyGate: fact.intimacyGate || matchingFact.intimacyGate,
                override: fact.override && fact.override !== 'unknown' ? fact.override : matchingFact.override,
            };
            if (fallbackFacts.length === 1 && merged.npcFacts.length === 1) {
                const only = fallbackFacts[0];
                return {
                    ...fact,
                    explicitStats: fact.explicitStats || only.explicitStats,
                    disposition: fact.disposition || only.disposition,
                    rapport: fact.rapport !== null && fact.rapport !== undefined && Number.isFinite(Number(fact.rapport)) ? fact.rapport : only.rapport,
                    rapportEncounterLock: fact.rapportEncounterLock || only.rapportEncounterLock,
                    intimacyGate: fact.intimacyGate || only.intimacyGate,
                    override: fact.override && fact.override !== 'unknown' ? fact.override : only.override,
                };
            }
            return fact;
        });
    }
    if (Array.isArray(fallback?.npcFacts) && Array.isArray(merged.npcFacts)) {
        for (const fallbackFact of fallback.npcFacts) {
            if (!fallbackFact?.name) continue;
            if (merged.npcFacts.some(fact => eqName(fact?.name, fallbackFact.name))) continue;
            if (fallbackFact.present === false || fallbackFact.explicitStats || fallbackFact.disposition || fallbackFact.rapport !== null && fallbackFact.rapport !== undefined || fallbackFact.rapportEncounterLock || fallbackFact.intimacyGate) {
                merged.npcFacts.push(fallbackFact);
            }
        }
    }
    return merged;
}

export function resolveTurn(extraction, tracker, options = {}) {
    const clean = sanitizeExtraction(extraction);
    const nextTracker = createTracker(tracker);
    const rolls = [];

    if (options.userStats) {
        nextTracker.user.stats = sanitizeStats(options.userStats, nextTracker.user.stats, 1, 10);
    }

    if (clean.oocMode === 'STOP') {
        const packet = buildResolutionPacket(clean, nextTracker, rolls);
        const chaosHandoff = noChaosHandoff();
        const proactivityHandoff = {};
        const aggressionResults = {};
        const audit = {
            at: new Date().toISOString(),
            extraction: clean,
            rolls,
            resolutionPacket: packet,
            npcHandoffs: [],
            chaosHandoff,
            proactivityHandoff,
            aggressionResults,
        };
        nextTracker.lastAudit = audit;
        return { tracker: nextTracker, packet, npcHandoffs: [], chaosHandoff, proactivityHandoff, aggressionResults, audit };
    }

    if (clean.scene.location) nextTracker.scene.location = clean.scene.location;
    if (clean.scene.time) nextTracker.scene.time = clean.scene.time;
    if (clean.scene.weather) nextTracker.scene.weather = clean.scene.weather;

    const priorPresentNames = nextTracker.presentNpcIds
        .map(id => nextTracker.npcs?.[id]?.name)
        .filter(Boolean);
    const npcNames = unique([
        ...clean.npcInScene,
        ...clean.actionTargets,
        ...clean.oppTargetsNpc,
        ...clean.benefitedObservers,
        ...clean.harmedObservers,
        ...clean.npcFacts.filter(x => x.present !== false).map(x => x.name),
    ].filter(Boolean));
    const absentNpcNames = new Set(clean.npcFacts.filter(x => x.present === false).map(x => normalizeName(x.name)));
    let presentNpcNames = unique([...priorPresentNames, ...npcNames])
        .filter(name => !absentNpcNames.has(normalizeName(name)));

    applyRevealedNpcNames(nextTracker, clean);
    presentNpcNames = unique(presentNpcNames.map(name => {
        const renamed = clean.npcFacts.find(fact => fact.revealedFrom && eqName(fact.revealedFrom, name));
        return renamed?.name || name;
    }));
    nextTracker.presentNpcIds = unique(presentNpcNames.map(name => ensureNpc(nextTracker, name, clean).id));

    for (const fact of clean.npcFacts) {
        const npc = ensureNpc(nextTracker, fact.name, clean).npc;
        if (fact.present === false) {
            npc.present = false;
        }
        if (fact.present === true || presentNpcNames.some(name => eqName(name, fact.name))) {
            npc.present = true;
        }
        if (fact.position) npc.position = fact.position;
        if (fact.condition) npc.condition = fact.condition;
        if (fact.knowsUser) npc.knowsUser = fact.knowsUser;
        if (fact.descriptor) npc.descriptor = fact.descriptor;
        if (fact.revealedFrom) npc.revealedFrom = fact.revealedFrom;
        if (fact.aliases?.length) npc.aliases = cleanList([...(npc.aliases || []), ...fact.aliases]);
        if (fact.override && fact.override !== 'unknown') npc.override = fact.override;
        if (fact.archiveStatus && fact.archiveStatus !== 'unknown') npc.archiveStatus = fact.archiveStatus;
        const explicitDisposition = sanitizeDisposition(fact.disposition);
        if (explicitDisposition) npc.disposition = normalizeLockedDisposition(explicitDisposition);
        if (fact.rapport !== null && fact.rapport !== undefined && Number.isFinite(Number(fact.rapport))) npc.rapport = clamp(Number(fact.rapport), 0, 5);
        if (['Y', 'N'].includes(fact.rapportEncounterLock)) npc.rapportEncounterLock = fact.rapportEncounterLock;
        if (['ALLOW', 'DENY', 'SKIP'].includes(fact.intimacyGate)) npc.intimacyGate = fact.intimacyGate;
        const explicitStats = sanitizeStats(fact.explicitStats, null, 1, 10);
        if (explicitStats) {
            npc.coreStats = explicitStats;
            npc.rank = fact.rank !== 'unknown' ? fact.rank : npc.rank;
            npc.mainStat = fact.mainStat !== 'unknown' ? fact.mainStat : npc.mainStat;
        } else if (!npc.coreStats) {
            const generated = generateNpcStats(fact.rank, fact.mainStat);
            npc.rank = generated.rank;
            npc.mainStat = generated.mainStat;
            npc.coreStats = generated.stats;
        }
    }

    const packet = buildResolutionPacket(clean, nextTracker, rolls);
    if (clean.systemOnlyUpdate === 'Y') {
        applyInventoryDeltas(nextTracker, clean.inventoryDeltas);
        applyTaskDeltas(nextTracker, clean.taskDeltas);
        const chaosHandoff = noChaosHandoff();
        const proactivityHandoff = {};
        const aggressionResults = {};
        const audit = {
            at: new Date().toISOString(),
            extraction: clean,
            rolls,
            resolutionPacket: packet,
            npcHandoffs: [],
            chaosHandoff,
            proactivityHandoff,
            aggressionResults,
        };
        nextTracker.lastAudit = audit;
        return { tracker: nextTracker, packet, npcHandoffs: [], chaosHandoff, proactivityHandoff, aggressionResults, audit };
    }

    const npcHandoffs = npcNames.map(name => resolveNpcRelationship(name, packet, clean, nextTracker));
    const proactivityNpcHandoffs = mergeProactivityHandoffs(npcHandoffs, presentNpcNames, packet, nextTracker);
    const sceneSummary = buildSceneSummary(clean, nextTracker);
    const chaosHandoff = chaosInterrupt(packet, proactivityNpcHandoffs, sceneSummary, rolls);
    const proactivityHandoff = npcProactivityEngine(proactivityNpcHandoffs, packet, chaosHandoff, nextTracker, rolls);
    const aggressionResults = npcAggressionResolution(proactivityHandoff, nextTracker, rolls);

    applyInventoryDeltas(nextTracker, clean.inventoryDeltas);
    applyTaskDeltas(nextTracker, clean.taskDeltas);

    const audit = {
        at: new Date().toISOString(),
        extraction: clean,
        rolls,
        resolutionPacket: packet,
        npcHandoffs,
        chaosHandoff,
        proactivityHandoff,
        aggressionResults,
    };
    nextTracker.lastAudit = audit;

    return { tracker: nextTracker, packet, npcHandoffs, chaosHandoff, proactivityHandoff, aggressionResults, audit };
}

export function buildNarrationHandoff(packet, npcHandoffs, chaosHandoff = noChaosHandoff(), proactivityHandoff = {}, aggressionResults = {}) {
    const chaos = chaosHandoff?.CHAOS || noChaosHandoff().CHAOS;
    const proactiveEntries = Object.entries(proactivityHandoff || {});
    const aggressionEntries = Object.entries(aggressionResults || {});
    const activeProactivity = proactiveEntries.filter(([, p]) => p.Proactive === 'Y');
    const npcGuidance = (npcHandoffs || []).map(describeNpcNarrationGuidanceCompact);
    const activeGuidance = activeProactivity.map(([name, p]) => describeProactivityNarrationCompact(name, p));
    const aggressionGuidance = aggressionEntries.map(([name, r]) => describeAggressionNarrationCompact(name, r));

    return [
        'Private mechanics brief for this reply. Do not reveal.',
        describeOocNarration(packet),
        describeSystemUpdateNarration(packet),
        `Resolution: ${describeResolutionNarrationCompact(packet)}`,
        describeIntimacyNarrationCompact(packet),
        npcGuidance.length ? `NPC: ${npcGuidance.join(' | ')}` : 'NPC: No NPC relationship change is required this turn.',
        `Chaos: ${describeChaosNarrationCompact(chaos)}`,
        activeGuidance.length ? `Proactivity: ${activeGuidance.join(' | ')}` : 'Proactivity: none.',
        aggressionGuidance.length ? `Aggression: ${aggressionGuidance.join(' | ')}` : 'Aggression: none.',
        'Guard: narrate only authorized outcome; no extra damage, targets, counters, events, status changes, relationship changes, or user choices.',
    ].filter(Boolean).join('\n');
}

function describeOocNarration(packet) {
    if (packet.OOCMode === 'STOP') {
        return `The latest user message is out of character. Stop all narration and answer only the user's out-of-character request: ${packet.OOCInstruction || 'answer directly'}.`;
    }
    if (packet.OOCMode === 'PROXY') {
        return 'The latest user message authorizes proxy narration with triple parentheses. Continue in scene using the declared proxy action and the resolved engine result.';
    }
    return 'The latest user message is in character. Continue the roleplay from the resolved consequence.';
}

function describeSystemUpdateNarration(packet) {
    if (packet.SystemOnlyUpdate === 'Y') {
        return `This is a tracker or continuity update, not a new dramatic scene beat. Keep narration minimal unless the user explicitly described live action. Reason: ${packet.SystemOnlyUpdateReason || 'system update'}.`;
    }
    const details = [];
    if (packet.SceneTime) details.push(`Current scene time: ${packet.SceneTime}.`);
    if (packet.TimeAdvance) details.push(`Time movement this turn: ${packet.TimeAdvance}.`);
    return details.join(' ');
}

function describeResolutionNarration(packet) {
    const goal = packet.GOAL || 'the user action';
    const decisive = packet.DecisiveAction || goal;
    const targets = joinList([...(packet.ActionTargets || []), ...(packet.OppTargets?.NPC || []), ...(packet.OppTargets?.ENV || [])]);
    const targetText = targets ? ` Relevant target or obstacle: ${targets}.` : '';
    const successText = packet.OutcomeOnSuccess ? ` If showing success, preserve this meaning: ${packet.OutcomeOnSuccess}.` : '';
    const failureText = packet.OutcomeOnFailure ? ` If showing failure, preserve this meaning: ${packet.OutcomeOnFailure}.` : '';
    const counter = describeCounterPotential(packet.CounterPotential);

    if (packet.STAKES !== 'Y') {
        return `Resolved intent: ${goal}. Decisive action: ${decisive}. No roll was needed because the explicit action has no meaningful contested stakes or is an automatic/simple answer.${targetText} Do not frame it as success versus failure, and do not change relationship state unless the relationship guidance says so.${successText}${failureText}`;
    }

    const hostileCombat = packet.HostilePhysicalHarm === 'Y' || Number.isFinite(Number(packet.LandedActions));
    if (hostileCombat) {
        const landed = Number(packet.LandedActions);
        const declared = Array.isArray(packet.actions) ? packet.actions.length : 1;
        let combat;
        switch (packet.Outcome) {
            case 'dominant_impact':
                combat = `Critical combat success. Up to ${Math.min(3, declared)} declared hostile actions may land with strong damage or control. Do not invent extra attacks.`;
                break;
            case 'solid_impact':
                combat = `Moderate combat success. Up to ${Math.min(2, declared)} declared hostile actions may land cleanly or with meaningful control. Do not invent extra attacks.`;
                break;
            case 'light_impact':
                combat = 'Minor combat success. One declared hostile action may land lightly, partially, or with limited control. Do not give decisive advantage.';
                break;
            case 'stalemate':
                combat = 'Combat stalemate. No clean progress for either side, no landed hostile action, no counter opening, and no winner.';
                break;
            case 'checked':
                combat = 'Minor combat failure. No hostile action lands. The user is stopped at contact or near-contact, creating only a light counter opening.';
                break;
            case 'deflected':
                combat = 'Moderate combat failure. No hostile action lands. The user is turned aside, displaced, or put off-line, creating a medium counter opening.';
                break;
            case 'avoided':
                combat = 'Critical combat failure. No hostile action lands. The user misses badly, overextends, or is badly out-positioned, creating a severe counter opening.';
                break;
            default:
                combat = landed > 0
                    ? `Hostile physical action succeeds with ${landed} declared action${landed === 1 ? '' : 's'} landing.`
                    : 'Hostile physical action does not land.';
        }
        return `Resolved intent: ${goal}. Decisive action: ${decisive}.${targetText} ${combat} ${counter}${successText}${failureText}`;
    }

    if (packet.Outcome === 'success') {
        return `Resolved intent: ${goal}. Decisive action: ${decisive}.${targetText} The contested action succeeds. Narrate the explicit success consequence only; do not add extra consequences.${counter}${successText}${failureText}`;
    }
    if (packet.Outcome === 'failure') {
        return `Resolved intent: ${goal}. Decisive action: ${decisive}.${targetText} The contested action fails. Narrate obstruction or nonachievement only; no retaliation or harm unless another part of the brief authorizes it.${counter}${successText}${failureText}`;
    }
    if (packet.Outcome === 'stalemate') {
        return `Resolved intent: ${goal}. Decisive action: ${decisive}.${targetText} The contest stalls with no clear progress for either side. Do not choose a winner.${counter}${successText}${failureText}`;
    }
    return `Resolved intent: ${goal}. Decisive action: ${decisive}.${targetText} Apply the resolved result conservatively without inventing consequences.${counter}${successText}${failureText}`;
}

function describeResolutionNarrationCompact(packet) {
    const goal = packet.GOAL || 'user action';
    const decisive = packet.DecisiveAction || goal;
    const targets = joinList([...(packet.ActionTargets || []), ...(packet.OppTargets?.NPC || []), ...(packet.OppTargets?.ENV || [])]);
    const targetText = targets ? ` target=${targets};` : '';
    const successText = packet.OutcomeOnSuccess ? ` successMeans=${packet.OutcomeOnSuccess};` : '';
    const failureText = packet.OutcomeOnFailure ? ` failureMeans=${packet.OutcomeOnFailure};` : '';
    if (packet.STAKES !== 'Y') {
        return `goal=${goal}; action=${decisive}; stakes=N; outcome=no_roll;${targetText} do not frame as success/failure.${successText}${failureText}`;
    }
    const roll = packet.roll
        ? ` roll=${packet.roll.atkTot} vs ${packet.roll.defTot}, margin ${packet.roll.margin};`
        : '';
    if (packet.HostilePhysicalHarm === 'Y' || Number.isFinite(Number(packet.LandedActions))) {
        return `goal=${goal}; action=${decisive}; stakes=Y;${targetText}${roll} combat=${packet.OutcomeTier}/${packet.Outcome}; landed=${packet.LandedActions}; counter=${packet.CounterPotential}; ${combatOutcomeInstruction(packet)}${successText}${failureText}`;
    }
    const outcomeInstruction = packet.Outcome === 'success'
        ? 'contested action succeeds; narrate explicit success only.'
        : packet.Outcome === 'failure'
            ? 'contested action fails; narrate obstruction/nonachievement only.'
            : packet.Outcome === 'stalemate'
                ? 'contest stalls; no winner.'
                : 'apply result conservatively.';
    return `goal=${goal}; action=${decisive}; stakes=Y;${targetText}${roll} outcome=${packet.OutcomeTier}/${packet.Outcome}; ${outcomeInstruction}${successText}${failureText}`;
}

function combatOutcomeInstruction(packet) {
    const landed = Math.max(0, Number(packet.LandedActions) || 0);
    const landedText = landed === 1 ? 'one declared attack' : `${landed} declared attacks`;
    switch (packet.Outcome) {
        case 'dominant_impact': return `critical success; the opponent is badly exposed, overwhelmed, or unable to stop the sequence; ${landedText} may land decisively; no extra attacks.`;
        case 'solid_impact': return `moderate success; the attack lands solidly and produces clear impact or control; ${landedText} may land meaningfully; no extra attacks.`;
        case 'light_impact': return 'minor success; one hostile action connects lightly, glances, clips, or only partially controls the target; no decisive advantage.';
        case 'stalemate': return 'stalemate; no landed hostile action, no counter opening, no winner.';
        case 'checked': return 'minor failure; the attack is checked at contact or just before contact; no hit lands; light counter opening only if proactivity/aggression uses it.';
        case 'deflected': return 'moderate failure; the opponent turns the attack aside, displaces it, or forces it off-line; no hit lands; medium counter opening only if proactivity/aggression uses it.';
        case 'avoided': return 'critical failure; the opponent avoids it cleanly while the user overextends, misses badly, or ends out of position; no hit lands; severe counter opening only if proactivity/aggression uses it.';
        default: return 'resolve hostile action conservatively.';
    }
}

function describeIntimacyNarration(packet) {
    if (!['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)) return '';
    if (packet.IntimacyConsent === 'Y') {
        return 'The intimacy gate allows this advance. Narrate acceptance or reciprocal intimacy only within the established relationship state and explicit scene facts.';
    }
    if (packet.GOAL === 'IntimacyAdvancePhysical') {
        return 'The intimacy gate denies this physical advance. Do not narrate consent, compliance, acceptance, reciprocal intimacy, or the intimate contact landing. The contact does not land, not even briefly: show refusal, blocking, interruption, recoil, avoidance, or failure before lips, hands, body, or other intimate contact reaches the target. A successful setup may create an opening, but the denied intimacy itself must still be refused or blocked.';
    }
    return 'The intimacy gate denies this verbal advance. Do not narrate acceptance, consent, reciprocal intimacy, or compliance. Show refusal, boundary setting, avoidance, anger, fear, or nonacceptance according to relationship guidance.';
}

function describeIntimacyNarrationCompact(packet) {
    if (!['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)) return '';
    if (packet.IntimacyConsent === 'Y') return 'Intimacy: gate=ALLOW; acceptance/reciprocity allowed only if scene supports it.';
    if (packet.GOAL === 'IntimacyAdvancePhysical') return 'Intimacy: gate=DENY; physical intimate contact does not land; show refusal/block/avoidance before contact.';
    return 'Intimacy: gate=DENY; no acceptance/compliance; show refusal/boundary/avoidance per NPC state.';
}

function describeCounterPotential(value) {
    if (value === 'light') return ' A light counter opening exists only if proactivity/aggression guidance uses it; otherwise do not invent a counterattack.';
    if (value === 'medium') return ' A medium counter opening exists only if proactivity/aggression guidance uses it; otherwise do not invent a counterattack.';
    if (value === 'severe') return ' A severe counter opening exists only if proactivity/aggression guidance uses it; otherwise do not invent a counterattack.';
    return ' No counterattack is authorized by the resolution result alone.';
}

function describeNpcNarrationGuidance(handoff) {
    const name = handoff.NPC || 'The NPC';
    const fin = parseFinalState(handoff.FinalState);
    const parts = [
        `${name}: ${describeRelationshipTarget(handoff.Target)} ${describeRelationshipBehavior(fin, handoff.Lock, handoff.Behavior)}`,
    ];
    if (handoff.NPC_STAKES === 'Y') {
        parts.push('Their material stakes improved this turn; show benefit only through concrete behavior or dialogue.');
    }
    if (handoff.Landed === 'Y') {
        parts.push('They were affected by a landed hostile action; keep the reaction consistent with the resolved impact.');
    }
    if (handoff.IntimacyGate === 'ALLOW') {
        parts.push('Intimacy may be accepted or initiated only if the scene naturally supports it.');
    } else if (handoff.IntimacyGate === 'DENY') {
        parts.push('Intimacy must be refused, blocked, avoided, or otherwise unavailable.');
    }
    if (handoff.Override && handoff.Override !== 'NONE') {
        parts.push(`A specific intimacy override exists: ${handoff.Override}. Use it only within the explicit scene facts.`);
    }
    return `- ${parts.join(' ')}`;
}

function describeNpcNarrationGuidanceCompact(handoff) {
    const name = handoff.NPC || 'NPC';
    const fin = parseFinalState(handoff.FinalState);
    const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
    const bits = [
        `${name}=${handoff.FinalState || '?'} ${lock && lock !== 'None' ? lock : handoff.Behavior || ''}`.trim(),
        `target=${handoff.Target || 'No Change'}`,
        handoff.NPC_STAKES === 'Y' ? 'stakesImproved=Y' : '',
        handoff.Landed === 'Y' ? 'landed=Y' : '',
        handoff.IntimacyGate && handoff.IntimacyGate !== 'SKIP' ? `gate=${handoff.IntimacyGate}` : '',
        handoff.Override && handoff.Override !== 'NONE' ? `override=${handoff.Override}` : '',
        compactBehaviorInstruction(fin, lock, handoff.Behavior),
    ].filter(Boolean);
    return bits.join('; ');
}

function compactBehaviorInstruction(fin, lock, behavior) {
    const activeLock = lock && lock !== 'None' ? lock : deriveLock(fin);
    if (activeLock === 'TERROR') return 'terror behavior only';
    if (activeLock === 'HATRED') return 'hatred/opposition behavior only';
    if (activeLock === 'FREEZE') return 'freeze/guarded behavior; no relaxed trust';
    if (behavior === 'CLOSE' || fin.B >= 4) return 'close/trusting allowed';
    if (behavior === 'FRIENDLY' || fin.B >= 3) return 'friendly/cooperative allowed';
    if (behavior === 'BROKEN' || fin.B <= 1) return 'avoidant/distant';
    return 'neutral/cautious';
}

function describeRelationshipTarget(target) {
    switch (target) {
        case 'Bond': return 'This turn moves them toward trust or cooperation.';
        case 'Fear': return 'This turn makes them more afraid.';
        case 'Hostility': return 'This turn makes them more hostile or obstructive.';
        case 'FearHostility': return 'This turn makes them both afraid and hostile.';
        default: return 'No relationship shift is caused by this turn.';
    }
}

function describeRelationshipBehavior(fin, lock, behavior) {
    const activeLock = lock && lock !== 'None' ? lock : deriveLock(fin);
    if (activeLock === 'TERROR') {
        return 'Their resulting state is terror: panic, flight, surrender, desperate compliance, calling for help, or fear-dominant behavior. Do not portray calm resistance, playful banter, trust, or casual compliance.';
    }
    if (activeLock === 'HATRED') {
        return 'Their resulting state is violent hatred: active opposition, sabotage, attack intent, or refusal. Do not portray warmth, trust, flirtation, softening, or easy cooperation.';
    }
    if (activeLock === 'FREEZE') {
        if (fin.F >= 3 && fin.H >= 3) {
            return 'Their resulting state is fear and hostility lock: frozen, guarded, obstructive, avoidant, or unable to respond freely. Do not portray them as relaxed, trusting, playful, or easily compliant.';
        }
        if (fin.F >= 3) {
            return 'Their resulting state is fear lock: frozen, submissive, avoidant, hesitant, or seeking escape/help. Do not portray them as relaxed, trusting, playful, or freely aggressive.';
        }
        return 'Their resulting state is hostility lock: obstructive, resentful, argumentative, interfering, or escalating. Do not portray warmth, trust, or easy compliance.';
    }
    if (behavior === 'CLOSE' || fin.B >= 4) {
        return 'Their resulting stance is close and trusting: confiding, seeking closeness, or warmly cooperative is allowed when scene-appropriate.';
    }
    if (behavior === 'FRIENDLY' || fin.B >= 3) {
        return 'Their resulting stance is friendly and comfortable: cooperative, relaxed, familiar, or conversational behavior is appropriate.';
    }
    if (behavior === 'BROKEN' || fin.B <= 1) {
        return 'Their resulting stance is avoidant or distant: keep distance, disengage, refuse closeness, or respond transactionally.';
    }
    return 'Their resulting stance is neutral or cautious: polite, businesslike, guarded, or transactional behavior is appropriate.';
}

function describeChaosNarration(chaos) {
    if (!chaos?.triggered) {
        return 'No random event occurs. Do not invent new environmental stimuli, accidents, interruptions, arrivals, noises, objects, hazards, or outside causes. Resolve only from the user action, named NPC behavior, and already established scene facts.';
    }
    const band = String(chaos.band || '').toLowerCase();
    const magnitude = String(chaos.magnitude || '').toLowerCase();
    const relation = describeChaosAnchor(chaos.anchor);
    const source = describeChaosVector(chaos.vector);
    return `A random event must occur. It should be ${articleFor(band)} ${band || 'complication'} event of ${magnitude || 'minor'} magnitude, relate to ${relation}, and come through ${source}. It must not contradict the resolved action, relationship state, or established scene facts.`;
}

function describeChaosNarrationCompact(chaos) {
    if (!chaos?.triggered) return 'No random event occurs; do not invent new events/arrivals/hazards/noises.';
    return `${chaos.band || 'event'} ${chaos.magnitude || 'minor'}; anchor=${chaos.anchor || 'scene'}; vector=${chaos.vector || 'scene'}; must not contradict result/state.`;
}

function describeChaosAnchor(anchor) {
    switch (anchor) {
        case 'GOAL': return 'the user action or its immediate goal';
        case 'ENVIRONMENT': return 'the established environment';
        case 'KNOWN_NPC': return 'a known NPC already connected to the scene';
        case 'RESOURCE': return 'a resource, item, supply, or material concern';
        case 'CLUE': return 'a clue, information, sign, or discovery';
        default: return 'the existing scene';
    }
}

function describeChaosVector(vector) {
    switch (vector) {
        case 'NPC': return 'an NPC';
        case 'CROWD': return 'the crowd or public surroundings';
        case 'AUTHORITY': return 'an authority figure or enforcement presence';
        case 'ENVIRONMENT': return 'the environment';
        case 'SYSTEM': return 'a non-person system, mechanism, rule, weather, structure, or circumstance';
        case 'ENTITY': return 'an entity appropriate to the isolated scene';
        default: return 'the established scene';
    }
}

function describeProactivityNarration(name, action) {
    const impulse = describeImpulse(action.Impulse);
    const intent = describeIntent(action.Intent);
    const target = action.TargetsUser === 'Y'
        ? 'This initiative targets the user; obey any physical aggression result if present.'
        : 'This initiative does not require a hostile physical exchange with the user unless the scene makes a non-hostile address natural.';
    const counter = action.CounterBonus ? ` A failed-user-action counter opening strengthens this initiative by ${action.CounterBonus}, but does not guarantee success.` : '';
    return `- ${name} must take one clear initiative beat after the normal reaction. Motivation: ${impulse}. Action shape: ${intent}. ${target}${counter}`;
}

function describeProactivityNarrationCompact(name, action) {
    const target = action.TargetsUser === 'Y' ? 'targets user' : 'does not target user';
    const counter = action.CounterBonus ? `counterBonus=${action.CounterBonus}` : '';
    return `${name}: intent=${action.Intent}; impulse=${action.Impulse}; ${target}${counter ? `; ${counter}` : ''}`;
}

function describeImpulse(impulse) {
    if (impulse === 'ANGER') return 'anger, hostility, boundary enforcement, or opposition';
    if (impulse === 'FEAR') return 'fear, withdrawal, caution, submission, or seeking help';
    if (impulse === 'BOND') return 'bond, cooperation, trust, support, flirtation, or friendly initiative';
    return 'the current relationship state';
}

function describeIntent(intent) {
    switch (intent) {
        case 'ESCALATE_VIOLENCE': return 'escalate into violence or an attack attempt';
        case 'BOUNDARY_PHYSICAL': return 'set a physical boundary, block, shove away, restrain access, or otherwise prevent contact';
        case 'THREAT_OR_POSTURE': return 'threaten, posture, challenge, warn, or obstruct without resolving a full attack unless aggression guidance says so';
        case 'CALL_HELP_OR_AUTHORITY': return 'call for help, alert authority, shout, flee toward help, or make danger public';
        case 'WITHDRAW_OR_BOUNDARY': return 'withdraw, refuse, retreat, set a boundary, or create distance';
        case 'INTIMACY_OR_FLIRT': return 'initiate closeness, flirtation, affectionate contact, or intimacy only if relationship and consent guidance allow it';
        case 'SUPPORT_ACT': return 'help, back up, assist, protect, guide, or support the user or their goal';
        case 'PLAN_OR_BANTER': return 'suggest a plan, change topic, tease, banter, or pursue a small personal/scene beat';
        default: return 'no extra action beyond normal reaction';
    }
}

function describeAggressionNarration(name, result) {
    switch (result.ReactionOutcome) {
        case 'npc_overpowers':
            return `- ${name}'s physical aggression overpowers the user. Narrate the NPC's external action and its immediate physical result, but do not decide the user's thoughts, choices, or follow-up.`;
        case 'npc_succeeds':
            return `- ${name}'s physical aggression succeeds. Narrate the immediate external result only; do not add extra hits or decide the user's voluntary response.`;
        case 'user_resists':
            return `- ${name}'s physical aggression fails against the user because the user resists. Stop at the failed contact, block, avoidance, or exposed opening. Do not narrate the user counterattacking, pursuing, deciding, speaking, or choosing a follow-up.`;
        case 'user_dominates':
            return `- ${name}'s physical aggression fails badly against the user. Stop at the failed contact, avoided strike, compromised position, or exposed opening. Do not narrate the user counterattacking, pursuing, deciding, speaking, or choosing a follow-up.`;
        default:
            return `- ${name}'s physical aggression has an unresolved result. Keep it conservative and do not add extra hits or user agency.`;
    }
}

function describeAggressionNarrationCompact(name, result) {
    switch (result.ReactionOutcome) {
        case 'npc_overpowers':
            return `${name}: npc_overpowers; narrate external physical result only; no user choices.`;
        case 'npc_succeeds':
            return `${name}: npc_succeeds; immediate external result only; no extra hits/user choices.`;
        case 'user_resists':
            return `${name}: user_resists; stop at failed contact/block/avoidance; no user counteraction.`;
        case 'user_dominates':
            return `${name}: user_dominates; NPC fails badly/exposed; no user counteraction.`;
        default:
            return `${name}: unresolved; conservative, no extra hits/user agency.`;
    }
}

function joinList(values) {
    const list = (values || []).filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function articleFor(text) {
    return /^[aeiou]/i.test(String(text || '')) ? 'an' : 'a';
}

export function buildFinalNarrationPayload({
    packet,
    npcHandoffs,
    chaosHandoff = noChaosHandoff(),
    proactivityHandoff = {},
    aggressionResults = {},
} = {}) {
    return buildNarrationHandoff(packet, npcHandoffs, chaosHandoff, proactivityHandoff, aggressionResults);
}

export function summarizeTracker(tracker) {
    const present = tracker.presentNpcIds.map(id => tracker.npcs[id]).filter(Boolean);
    return {
        scene: tracker.scene,
        worldClock: tracker.worldClock,
        user: tracker.user,
        present,
        absent: Object.values(tracker.npcs).filter(n => !tracker.presentNpcIds.includes(n.id)),
        inventory: tracker.inventory,
        quests: tracker.quests,
        pendingTasks: tracker.pendingTasks,
        debts: tracker.debts,
        schedule: tracker.schedule,
        lastAudit: tracker.lastAudit,
    };
}

export function describeNpcFeeling(npc) {
    const disposition = normalizeLockedDisposition(sanitizeDisposition(npc?.disposition) || { B: 2, F: 2, H: 2 });
    const b = disposition.B;
    const f = disposition.F;
    const h = disposition.H;
    if (f >= 4) return 'Terrified of the user; closeness is shut down until the fear is resolved.';
    if (h >= 4) return 'Hateful toward the user; expects conflict or harm.';
    if (f >= 3 && h >= 3) return 'Frozen and hostile; trust cannot grow until fear and hostility ease.';
    if (f >= 3) return 'Afraid and guarded; trust is capped until the fear eases.';
    if (h >= 3) return 'Hostile and obstructive; trust is capped until hostility eases.';
    if (b >= 4) return 'Close and trusting toward the user.';
    if (b >= 3) return 'Friendly and comfortable with the user.';
    if (b >= 2) return 'Neutral or transactional toward the user.';
    return 'Avoidant or distrustful toward the user.';
}

export function serializeNpcArchiveEntry(npc, options = {}) {
    const disposition = normalizeLockedDisposition(sanitizeDisposition(npc?.disposition) || { B: 2, F: 2, H: 2 });
    const stats = sanitizeStats(npc?.coreStats, { PHY: 2, MND: 2, CHA: 2 }, 1, 10);
    const aliases = cleanList([npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]);
    const updated = options.updated || new Date().toISOString().slice(0, 10);
    const continuity = knownArchiveText(npc?.continuity) || npcContinuityFromAudit(npc, options.audit) || 'unknown';
    const chatId = cleanText(options.chatId || npc?.chatId || '');
    const archiveOwner = cleanText(options.archiveOwner || npc?.archiveOwner || 'unknown');
    const archiveEntryKey = cleanText(options.archiveEntryKey || npc?.archiveEntryKey || '');
    return [
        '[RPE_NPC]',
        'ArchiveScope: Chat',
        `ArchiveOwner: ${archiveOwner}`,
        `ArchiveChatKey: ${chatId || 'global'}`,
        `ArchiveEntryKey: ${archiveEntryKey || 'auto'}`,
        `ChatId: ${chatId || 'global'}`,
        `Name: ${cleanText(npc?.name) || 'Unknown NPC'}`,
        `Aliases: ${aliases.length ? aliases.join(', ') : cleanText(npc?.name) || 'Unknown NPC'}`,
        `Descriptor: ${cleanText(npc?.descriptor) || 'unknown'}`,
        `RevealedFrom: ${cleanText(npc?.revealedFrom) || 'unknown'}`,
        `Present: ${npc?.present ? 'Y' : 'N'}`,
        `ArchiveStatus: ${sanitizeArchiveStatus(npc?.archiveStatus)}`,
        `LastKnownLocation: ${cleanText(npc?.lastKnownLocation || options.location) || 'unknown'}`,
        `Condition: ${cleanText(npc?.condition) || 'unknown'}`,
        '',
        `CoreStats: PHY${stats.PHY}/MND${stats.MND}/CHA${stats.CHA}`,
        `Rank: ${cleanText(npc?.rank) || 'Average'}`,
        `MainStat: ${cleanText(npc?.mainStat) || 'Balanced'}`,
        '',
        `Disposition: B${disposition.B}/F${disposition.F}/H${disposition.H}`,
        `FeelsTowardUser: ${describeNpcFeeling({ ...npc, disposition })}`,
        `Rapport: ${clamp(Number(npc?.rapport ?? 0), 0, 5)}`,
        `RapportEncounterLock: ${['Y', 'N'].includes(npc?.rapportEncounterLock) ? npc.rapportEncounterLock : 'N'}`,
        `IntimacyGate: ${['ALLOW', 'DENY', 'SKIP'].includes(npc?.intimacyGate) ? npc.intimacyGate : 'SKIP'}`,
        '',
        `KnowsAboutUser: ${cleanText(npc?.knowsAboutUser || npc?.knowsUser) || 'unknown'}`,
        `Personality: ${cleanText(npc?.personality) || 'unknown'}`,
        `Continuity: ${continuity}`,
        `Pending: ${cleanText(npc?.pending) || 'none'}`,
        `Misc: ${cleanText(npc?.misc) || 'none'}`,
        '',
        `Updated: ${updated}`,
        '[/RPE_NPC]',
    ].join('\n');
}

export function parseNpcArchiveContent(content) {
    const source = String(content || '');
    if (!source.includes('[RPE_NPC]')) return null;
    const field = (name) => {
        const match = source.match(new RegExp(`^${escapeRegExp(name)}\\s*:\\s*(.*)$`, 'im'));
        return match ? cleanText(match[1]) : '';
    };
    const name = field('Name');
    if (!name) return null;
    const stats = parseCoreStats(field('CoreStats')) || { PHY: 2, MND: 2, CHA: 2 };
    const disposition = normalizeLockedDisposition(parseDispositionText(field('Disposition')) || { B: 2, F: 2, H: 2 });
    const aliases = field('Aliases')
        .split(',')
        .map(x => cleanText(x))
        .filter(Boolean);
    const rapportLock = field('RapportEncounterLock').toUpperCase();
    const intimacyGate = field('IntimacyGate').toUpperCase();
    return {
        archiveScope: field('ArchiveScope') || 'Legacy',
        archiveOwner: field('ArchiveOwner') || 'unknown',
        archiveEntryKey: field('ArchiveEntryKey'),
        chatId: field('ArchiveChatKey') || field('ChatId') || 'global',
        name,
        aliases,
        descriptor: field('Descriptor') || '',
        revealedFrom: field('RevealedFrom') || '',
        present: /^Y$/i.test(field('Present')),
        archiveStatus: sanitizeArchiveStatus(field('ArchiveStatus')),
        lastKnownLocation: field('LastKnownLocation'),
        condition: field('Condition') || 'unknown',
        coreStats: stats,
        rank: field('Rank') || 'Average',
        mainStat: field('MainStat') || 'Balanced',
        disposition,
        feelsTowardUser: field('FeelsTowardUser'),
        rapport: clamp(Number(field('Rapport') || 0), 0, 5),
        rapportEncounterLock: ['Y', 'N'].includes(rapportLock) ? rapportLock : 'N',
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(intimacyGate) ? intimacyGate : 'SKIP',
        knowsUser: field('KnowsAboutUser') || field('KnowsUser') || 'unknown',
        personality: field('Personality') || 'unknown',
        continuity: field('Continuity') || 'unknown',
        pending: field('Pending') || 'none',
        misc: field('Misc') || 'none',
        updated: field('Updated'),
    };
}

export function upsertArchivedNpc(tracker, archived, present = true) {
    if (!tracker || !archived?.name) return tracker;
    const safeTracker = createTracker(tracker);
    const existing = findNpc(safeTracker, archived.name);
    const id = existing?.id || makeNpcId(archived.name);
    const prior = existing?.npc || {};
    const disposition = normalizeLockedDisposition(sanitizeDisposition(archived.disposition) || prior.disposition || { B: 2, F: 2, H: 2 });
    const stats = sanitizeStats(archived.coreStats, prior.coreStats || { PHY: 2, MND: 2, CHA: 2 }, 1, 10);
    const oldId = existing?.id;
    safeTracker.npcs[id] = {
        ...prior,
        id,
        name: archived.name,
        aliases: cleanList([...(Array.isArray(prior.aliases) ? prior.aliases : []), ...(archived.aliases || [])]),
        descriptor: archived.descriptor || prior.descriptor || '',
        revealedFrom: archived.revealedFrom || prior.revealedFrom || '',
        present,
        position: prior.position || '',
        condition: archived.condition || prior.condition || 'unknown',
        lastKnownLocation: archived.lastKnownLocation || prior.lastKnownLocation || '',
        disposition,
        rapport: clamp(Number(archived.rapport ?? prior.rapport ?? 0), 0, 5),
        rapportEncounterLock: ['Y', 'N'].includes(archived.rapportEncounterLock) ? archived.rapportEncounterLock : (prior.rapportEncounterLock || 'N'),
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(archived.intimacyGate) ? archived.intimacyGate : (prior.intimacyGate || 'SKIP'),
        coreStats: stats,
        rank: ['Weak', 'Average', 'Trained', 'Elite', 'Boss'].includes(archived.rank) ? archived.rank : (prior.rank || 'Average'),
        mainStat: ['PHY', 'MND', 'CHA', 'Balanced'].includes(archived.mainStat) ? archived.mainStat : (prior.mainStat || 'Balanced'),
        knowsUser: archived.knowsUser || prior.knowsUser || 'unknown',
        personality: archived.personality || prior.personality || 'unknown',
        continuity: archived.continuity || prior.continuity || 'unknown',
        pending: archived.pending || prior.pending || 'none',
        misc: archived.misc || prior.misc || 'none',
        feelsTowardUser: archived.feelsTowardUser || prior.feelsTowardUser || '',
        archiveStatus: sanitizeArchiveStatus(archived.archiveStatus || prior.archiveStatus),
        override: prior.override || 'NONE',
    };
    if (oldId && oldId !== id) {
        delete safeTracker.npcs[oldId];
        safeTracker.presentNpcIds = (safeTracker.presentNpcIds || []).map(npcId => npcId === oldId ? id : npcId);
    }
    if (present && !safeTracker.presentNpcIds.includes(id)) {
        safeTracker.presentNpcIds.push(id);
    }
    return safeTracker;
}

export function initializeSceneNpc(tracker, name, fact = {}) {
    const safeTracker = createTracker(tracker);
    const npcName = cleanNpcName(name);
    if (!npcName) return safeTracker;
    const clean = sanitizeExtraction({
        npcInScene: [npcName],
        npcFacts: [{
            name: npcName,
            aliases: Array.isArray(fact.aliases) ? fact.aliases : [],
            descriptor: fact.descriptor || '',
            revealedFrom: fact.revealedFrom || '',
            present: true,
            position: fact.position || '',
            condition: fact.condition || '',
            knowsUser: fact.knowsUser || '',
            explicitPreset: fact.explicitPreset || 'unknown',
            rank: fact.rank || 'unknown',
            mainStat: fact.mainStat || 'unknown',
            explicitStats: fact.explicitStats || null,
            disposition: fact.disposition || null,
            rapport: fact.rapport,
            rapportEncounterLock: fact.rapportEncounterLock || null,
            intimacyGate: fact.intimacyGate || null,
            override: fact.override || 'unknown',
            archiveStatus: fact.archiveStatus || 'unknown',
        }],
    });
    const { id, npc } = ensureNpc(safeTracker, npcName, clean);
    npc.present = true;
    if (!safeTracker.presentNpcIds.includes(id)) {
        safeTracker.presentNpcIds.push(id);
    }
    return safeTracker;
}

function npcContinuityFromAudit(npc, audit) {
    if (!npc?.name || !audit?.resolutionPacket) return '';
    const name = normalizeName(npc.name);
    const packet = audit.resolutionPacket;
    const touched = [
        ...(packet.ActionTargets || []),
        ...(packet.OppTargets?.NPC || []),
        ...(packet.BenefitedObservers || []),
        ...(packet.HarmedObservers || []),
    ].some(x => normalizeName(x) === name);
    if (!touched) return '';
    const goal = cleanText(packet.GOAL);
    const outcome = cleanText(packet.OutcomeTier || packet.Outcome);
    return [goal, outcome].filter(Boolean).join('; ');
}

function knownArchiveText(value) {
    const text = cleanText(value);
    return text && !/^(unknown|none|null|n\/a)$/i.test(text) ? text : '';
}

function sanitizeArchiveStatus(value) {
    return ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten'].includes(value) ? value : 'Active';
}

function buildResolutionPacket(clean, tracker, rolls) {
    const actions = Array.from({ length: clean.actionCount }, (_, i) => `a${i + 1}`);
    const packet = {
        GOAL: clean.goalKind === 'Normal' ? clean.goal : clean.goalKind,
        OOC: clean.ooc,
        OOCMode: clean.oocMode,
        OOCInstruction: clean.oocInstruction,
        DecisiveAction: clean.decisiveAction || clean.goal,
        OutcomeOnSuccess: clean.outcomeOnSuccess,
        OutcomeOnFailure: clean.outcomeOnFailure,
        actions,
        IntimacyConsent: 'N',
        STAKES: clean.hasStakes,
        LandedActions: '(none)',
        OutcomeTier: 'NONE',
        Outcome: 'no_roll',
        CounterPotential: 'none',
        SystemOnlyUpdate: clean.systemOnlyUpdate,
        SystemOnlyUpdateReason: clean.systemOnlyUpdateReason,
        ActionTargets: clean.actionTargets,
        OppTargets: { NPC: clean.oppTargetsNpc, ENV: clean.oppTargetsEnv },
        BenefitedObservers: clean.benefitedObservers,
        HarmedObservers: clean.harmedObservers,
        NPCInScene: clean.npcInScene,
        HostilePhysicalHarm: clean.hostilePhysicalHarm,
        stats: { USER: clean.userStat, OPP: clean.oppStat },
        SceneTime: tracker.scene?.time || '',
        TimeAdvance: tracker.worldClock?.lastAdvance || '',
    };

    packet.IntimacyConsent = checkIntimacyConsent(packet, tracker);

    if (clean.oocMode === 'STOP') {
        packet.STAKES = 'N';
        return packet;
    }

    if (clean.goalKind !== 'Normal' && !packet.ActionTargets.length && !packet.OppTargets.NPC.length) {
        packet.STAKES = 'Y';
        packet.OutcomeTier = 'Failure';
        packet.Outcome = 'failure';
        return packet;
    }

    if (clean.goalKind !== 'Normal' && packet.IntimacyConsent === 'N') {
        packet.STAKES = 'Y';
    } else if (clean.goalKind !== 'Normal') {
        packet.STAKES = 'N';
    }

    if (packet.STAKES !== 'Y') {
        return packet;
    }

    const atkDie = rollD20(rolls, 'user');
    const userStat = tracker.user.stats[clean.userStat] ?? 3;
    const atkTot = atkDie + userStat;

    let defDie = rollD20(rolls, 'opposition');
    let defTot = defDie;
    if (clean.oppStat !== 'ENV' && clean.oppTargetsNpc.length) {
        const primary = ensureNpc(tracker, clean.oppTargetsNpc[0], clean).npc;
        const oppStat = primary.coreStats?.[clean.oppStat] ?? 2;
        defTot += oppStat;
    }

    const margin = atkTot - defTot;
    packet.roll = { atkDie, atkTot, defDie, defTot, margin };

    if (clean.userStat === 'PHY' && clean.hostilePhysicalHarm === 'Y') {
        const tier = combatTier(margin);
        packet.OutcomeTier = tier.OutcomeTier;
        packet.LandedActions = Math.min(tier.LandedActions, actions.length);
        packet.Outcome = tier.Outcome;
        packet.CounterPotential = tier.CounterPotential;
    } else if (margin >= 1) {
        packet.OutcomeTier = 'Success';
        packet.Outcome = 'success';
    } else {
        packet.OutcomeTier = 'Failure';
        packet.Outcome = 'failure';
    }
    return packet;
}

function buildSceneSummary(clean, tracker) {
    return [
        tracker.scene?.location,
        tracker.scene?.time,
        tracker.scene?.weather,
        clean.goalEvidence,
        clean.decisiveActionEvidence,
    ].filter(Boolean).join(' ');
}

function mergeProactivityHandoffs(npcHandoffs, presentNpcNames, packet, tracker) {
    const existing = new Set((npcHandoffs || []).map(x => normalizeName(x.NPC)));
    const ambient = (presentNpcNames || [])
        .filter(name => !existing.has(normalizeName(name)))
        .map(name => buildAmbientProactivityHandoff(name, packet, tracker));
    return [...(npcHandoffs || []), ...ambient];
}

function buildAmbientProactivityHandoff(name, packet, tracker) {
    const found = ensureNpc(tracker, name, { npcFacts: [] }).npc;
    const disposition = normalizeLockedDisposition(sanitizeDisposition(found.disposition) || { B: 2, F: 2, H: 2 });
    found.disposition = disposition;
    const classified = classifyDisposition(disposition);
    const threshold = checkThreshold(disposition, found.override || 'NONE');
    const intimacyGate = threshold.LockActive === 'Y'
        ? 'DENY'
        : found.intimacyGate === 'DENY'
            ? 'DENY'
            : found.intimacyGate === 'ALLOW' || disposition.B >= 4 || threshold.OverrideActive === 'Y'
                ? 'ALLOW'
                : 'SKIP';

    return {
        NPC: name,
        FinalState: `B${disposition.B}/F${disposition.F}/H${disposition.H}`,
        Lock: classified.lock,
        Behavior: classified.behavior,
        Target: 'No Change',
        NPC_STAKES: 'N',
        Override: threshold.Override,
        Landed: 'N',
        OutcomeTier: packet.OutcomeTier || 'NONE',
        NarrationBand: packet.Outcome || 'standard',
        IntimacyGate: intimacyGate,
    };
}

export function chaosInterrupt(resolutionPacket, npcHandoffList, sceneSummary, rolls = []) {
    const dice = {
        A: rollD20(rolls, 'chaos.A'),
        O: rollD20(rolls, 'chaos.O'),
        I: rollD20(rolls, 'chaos.I'),
        anchorIdx: rollD20(rolls, 'chaos.anchorIdx'),
        vectorIdx: rollD20(rolls, 'chaos.vectorIdx'),
    };
    const ctx = chaosContext(npcHandoffList, sceneSummary);

    if (dice.A < 17) {
        return noChaosHandoff(dice, ctx);
    }

    const band = classifyChaosBand(dice.O);
    const magnitude = classifyChaosMagnitude(dice.O);
    const anchor = pickChaosAnchor(dice.anchorIdx);
    const vector = pickChaosVector(ctx, dice.I, dice.vectorIdx);
    const personVector = vector === 'NPC' || vector === 'AUTHORITY';

    return {
        CHAOS: {
            triggered: true,
            band,
            magnitude,
            anchor,
            vector,
            personVector,
            fullText: null,
            ctx,
            dice,
        },
    };
}

function noChaosHandoff(dice = null, ctx = 'ISOLATED') {
    return {
        CHAOS: {
            triggered: false,
            band: 'None',
            magnitude: 'None',
            anchor: 'None',
            vector: 'None',
            personVector: false,
            fullText: null,
            ctx,
            dice,
        },
    };
}

function chaosContext(npcHandoffList, sceneSummary) {
    const npcCount = Array.isArray(npcHandoffList) ? npcHandoffList.length : 0;
    if (npcCount >= 2) return 'PUBLIC';
    if (/\b(public|crowd|open|market|tavern|street|square)\b/i.test(String(sceneSummary || ''))) return 'PUBLIC';
    return 'ISOLATED';
}

function classifyChaosBand(value) {
    if (value <= 5) return 'HOSTILE';
    if (value <= 14) return 'COMPLICATION';
    return 'BENEFICIAL';
}

function classifyChaosMagnitude(value) {
    if (value === 1 || value === 20) return 'EXTREME';
    if (value <= 2 || value >= 19) return 'MAJOR';
    if (value <= 4 || value >= 17) return 'MODERATE';
    return 'MINOR';
}

function pickChaosAnchor(idx) {
    const anchors = ['GOAL', 'ENVIRONMENT', 'KNOWN_NPC', 'RESOURCE', 'CLUE'];
    return anchors[idx % anchors.length];
}

function pickChaosVector(ctx, intensity, idx) {
    const vectors = ctx === 'PUBLIC'
        ? ['NPC', 'CROWD', 'AUTHORITY', 'ENVIRONMENT', 'SYSTEM']
        : intensity >= 17
            ? ['ENVIRONMENT', 'SYSTEM', 'ENTITY']
            : ['ENVIRONMENT', 'SYSTEM'];
    return vectors[idx % vectors.length];
}

export function npcProactivityEngine(npcHandoffList, resolutionPacket, chaosHandoff, tracker, rolls = []) {
    const kind = classifyActionForProactivity(resolutionPacket);
    const chaosBand = chaosHandoff?.CHAOS?.triggered ? chaosHandoff.CHAOS.band : 'None';
    const counterPotential = resolutionPacket.CounterPotential || 'none';
    const cap = determineProactivityCap(npcHandoffList, chaosHandoff);
    const provisional = {};
    const candidates = [];

    for (const handoff of npcHandoffList || []) {
        const fin = parseFinalState(handoff.FinalState);
        const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
        const npcStakes = handoff.NPC_STAKES || 'N';
        const target = handoff.Target || 'No Change';
        const landed = handoff.Landed || 'N';
        const intimacyGate = handoff.IntimacyGate || 'SKIP';
        const override = handoff.Override || 'NONE';
        const impulse = deriveImpulse(kind, lock, fin, intimacyGate);
        const tier = classifyProactivityTier({ ...handoff, Target: target, NPC_STAKES: npcStakes, Landed: landed }, chaosBand, counterPotential, fin, lock);

        provisional[handoff.NPC] = {
            Proactive: 'N',
            Intent: 'NONE',
            Impulse: impulse,
            TargetsUser: 'N',
            ProactivityTier: tier,
        };

        if (tier === 'FORCED') {
            const counterBonus = counterBonusFromPotential(counterPotential);
            candidates.push({
                NPC: handoff.NPC,
                die: 20,
                tier,
                intent: 'ESCALATE_VIOLENCE',
                impulse: 'ANGER',
                TargetsUser: 'Y',
                Threshold: 'AUTO',
                CounterPotential: counterPotential,
                CounterBonus: counterBonus,
                passes: 'Y',
            });
            continue;
        }

        const die = rollD20(rolls, `proactivity.${handoff.NPC}`);
        const threshold = thresholdFromTier(tier);
        const passes = die >= threshold ? 'Y' : 'N';
        if (passes === 'Y') {
            const intent = selectIntent(impulse, kind, fin, intimacyGate, override);
            candidates.push({
                NPC: handoff.NPC,
                die,
                tier,
                intent,
                impulse,
                TargetsUser: targetsUserFromIntent(intent),
                Threshold: threshold,
                passes,
            });
        } else {
            provisional[handoff.NPC].ProactivityDie = die;
            provisional[handoff.NPC].Threshold = threshold;
        }
    }

    candidates.sort((a, b) => b.die - a.die);
    for (const candidate of candidates.slice(0, cap)) {
        provisional[candidate.NPC] = {
            Proactive: 'Y',
            Intent: candidate.intent,
            Impulse: candidate.impulse,
            TargetsUser: candidate.TargetsUser,
            ProactivityTier: candidate.tier,
            ProactivityDie: candidate.die,
            Threshold: candidate.Threshold,
            CounterPotential: candidate.CounterPotential || 'none',
            CounterBonus: candidate.CounterBonus || 0,
        };
    }

    return provisional;
}

function classifyActionForProactivity(packet) {
    const goal = packet.GOAL;
    if (goal === 'IntimacyAdvancePhysical') return 'Intimacy_Physical';
    if (goal === 'IntimacyAdvanceVerbal') return 'Intimacy_Verbal';
    if (Number(packet.LandedActions) > 0) return 'Combat';
    if ((packet.ActionTargets || []).length >= 1 && packet.LandedActions === '(none)') return 'Social';
    if ((packet.OppTargets?.ENV || []).length >= 1) return 'Skill';
    return 'Normal_Interaction';
}

function parseFinalState(finalState) {
    const match = String(finalState || '').match(/B(\d+)\/F(\d+)\/H(\d+)/i);
    if (!match) return { B: 2, F: 2, H: 2 };
    return {
        B: clamp(Number(match[1]), 1, 4),
        F: clamp(Number(match[2]), 1, 4),
        H: clamp(Number(match[3]), 1, 4),
    };
}

function deriveLock(fin) {
    if (fin.F === 4) return 'TERROR';
    if (fin.H === 4) return 'HATRED';
    if (fin.F === 3 || fin.H === 3) return 'FREEZE';
    return 'None';
}

function deriveImpulse(kind, lock, fin, intimacyGate) {
    if (lock === 'HATRED') return 'ANGER';
    if (lock === 'TERROR') return 'FEAR';
    if (['Combat', 'Social'].includes(kind) && fin.H >= 3 && fin.H >= fin.F) return 'ANGER';
    if (kind === 'Social' && fin.F >= 3 && fin.F >= fin.H) return 'FEAR';
    if (['Intimacy_Physical', 'Intimacy_Verbal'].includes(kind) && intimacyGate === 'DENY') return 'ANGER';
    if (['Normal_Interaction', 'Skill'].includes(kind) && fin.B >= fin.H && fin.B >= fin.F) return 'BOND';
    if (fin.H >= 3 && fin.H >= fin.F) return 'ANGER';
    if (fin.F >= 3 && fin.F >= fin.H) return 'FEAR';
    return 'BOND';
}

function classifyProactivityTier(handoff, chaosBand, counterPotential, fin, lock) {
    const npcStakes = handoff.NPC_STAKES || 'N';
    const target = handoff.Target || 'No Change';
    const landed = handoff.Landed || 'N';
    if (['light', 'medium', 'severe'].includes(counterPotential) && ['HATRED', 'FREEZE'].includes(lock)) return 'FORCED';
    if (npcStakes === 'N' && target === 'No Change' && chaosBand === 'None') {
        if (fin.B >= 3 || fin.F >= 3 || fin.H >= 3) return 'MEDIUM';
        return 'DORMANT';
    }
    if (lock !== 'None' && (target !== 'No Change' || landed === 'Y')) return 'HIGH';
    if (npcStakes === 'Y' && (target !== 'No Change' || landed === 'Y')) return 'HIGH';
    if (lock !== 'None' && chaosBand !== 'None') return 'HIGH';
    if (lock !== 'None') return 'MEDIUM';
    if (npcStakes === 'Y') return 'MEDIUM';
    if (target !== 'No Change' || landed === 'Y') return 'MEDIUM';
    if (chaosBand !== 'None') return 'LOW';
    return 'DORMANT';
}

function thresholdFromTier(tier) {
    if (tier === 'FORCED') return 'AUTO';
    if (tier === 'HIGH') return 8;
    if (tier === 'MEDIUM') return 10;
    if (tier === 'LOW') return 13;
    return 16;
}

function counterBonusFromPotential(counterPotential) {
    if (counterPotential === 'severe') return 3;
    if (counterPotential === 'medium') return 2;
    if (counterPotential === 'light') return 1;
    return 0;
}

function selectIntent(impulse, kind, fin, intimacyGate, override) {
    if (impulse === 'ANGER') {
        if (kind === 'Intimacy_Physical' && intimacyGate === 'DENY') return 'BOUNDARY_PHYSICAL';
        if (kind === 'Combat' || fin.H >= 4) return 'ESCALATE_VIOLENCE';
        return 'THREAT_OR_POSTURE';
    }
    if (impulse === 'FEAR') {
        if (fin.F >= 4) return 'CALL_HELP_OR_AUTHORITY';
        return 'WITHDRAW_OR_BOUNDARY';
    }
    if (impulse === 'BOND') {
        if ((intimacyGate === 'ALLOW' || override !== 'NONE') && fin.B >= 3) return 'INTIMACY_OR_FLIRT';
        if (['Skill', 'Social'].includes(kind)) return 'SUPPORT_ACT';
        return 'PLAN_OR_BANTER';
    }
    return 'PLAN_OR_BANTER';
}

function targetsUserFromIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent) ? 'Y' : 'N';
}

function determineProactivityCap(npcHandoffList, chaosHandoff) {
    const count = Array.isArray(npcHandoffList) ? npcHandoffList.length : 0;
    if (count >= 3 && chaosHandoff?.CHAOS?.magnitude === 'EXTREME') return 3;
    if (count >= 2 && chaosHandoff?.CHAOS?.triggered) return 2;
    return 1;
}

export function npcAggressionResolution(proactivityHandoff, tracker, rolls = []) {
    const results = {};
    for (const [name, action] of Object.entries(proactivityHandoff || {})) {
        if (action.Proactive !== 'Y' || action.TargetsUser !== 'Y' || !['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL'].includes(action.Intent)) {
            continue;
        }
        const found = findNpc(tracker, name);
        const npcCore = sanitizeStats(found?.npc?.coreStats, { PHY: 2, MND: 2, CHA: 2 }, 1, 10);
        const userCore = sanitizeStats(tracker.user?.stats, { PHY: 3, MND: 3, CHA: 3 }, 1, 10);
        const npcDie = rollD20(rolls, `aggression.${name}.npc`);
        const userDie = rollD20(rolls, `aggression.${name}.user`);
        const counterBonus = clamp(Number(action.CounterBonus || 0), 0, 3);
        const npcTotal = npcDie + npcCore.PHY + counterBonus;
        const userTotal = userDie + userCore.PHY;
        const margin = npcTotal - userTotal;
        const ReactionOutcome = margin >= 5
            ? 'npc_overpowers'
            : margin >= 1
                ? 'npc_succeeds'
                : margin >= -3
                    ? 'user_resists'
                    : 'user_dominates';
        results[name] = {
            ReactionOutcome,
            Margin: margin,
            npcDie,
            userDie,
            CounterBonus: counterBonus,
            npcTotal,
            userTotal,
        };
    }
    return results;
}

function resolveNpcRelationship(name, packet, clean, tracker) {
    const { npc } = ensureNpc(tracker, name, clean);
    const currentDisposition = normalizeLockedDisposition(sanitizeDisposition(npc.disposition) || initPresetForNpc(name, clean));
    const currentRapport = clamp(Number(npc.rapport ?? 0), 0, 5);
    let rapportEncounterLock = clean.newEncounter === 'Y' ? 'N' : (npc.rapportEncounterLock === 'Y' ? 'Y' : 'N');
    const isAllowed = packet.IntimacyConsent;
    const target = routeDispositionTarget(name, packet, isAllowed, currentDisposition);
    const npcStakes = packet.BenefitedObservers.includes(name) && outcomeImprovesStakes(packet) ? 'Y' : 'N';
    const rapport = updateRapport(currentRapport, target, rapportEncounterLock);
    let nextRapport = rapport.currentRapport;
    rapportEncounterLock = rapport.rapportEncounterLock;
    const deltas = deriveDirection(target, npcStakes, currentDisposition, nextRapport);
    const nextDisposition = updateDisposition(currentDisposition, deltas);
    if (deltas.rapportReset === 'Y') nextRapport = 0;

    const classified = classifyDisposition(nextDisposition);
    const threshold = checkThreshold(nextDisposition, npc.override || overrideForNpc(name, clean));
    const intimacyGate = threshold.LockActive === 'Y'
        ? 'DENY'
        : isAllowed === 'Y'
            ? 'ALLOW'
            : nextDisposition.B >= 4
                ? 'ALLOW'
                : threshold.OverrideActive === 'Y'
                    ? 'ALLOW'
                    : 'SKIP';

    npc.disposition = nextDisposition;
    npc.rapport = nextRapport;
    npc.rapportEncounterLock = rapportEncounterLock;
    if (intimacyGate !== 'SKIP') npc.intimacyGate = intimacyGate;

    return {
        NPC: name,
        FinalState: `B${nextDisposition.B}/F${nextDisposition.F}/H${nextDisposition.H}`,
        Lock: classified.lock,
        Behavior: classified.behavior,
        Target: target,
        NPC_STAKES: npcStakes,
        Override: threshold.Override,
        Landed: Number(packet.LandedActions) > 0 ? 'Y' : 'N',
        OutcomeTier: packet.OutcomeTier || 'NONE',
        NarrationBand: packet.Outcome || 'standard',
        IntimacyGate: intimacyGate,
    };
}

function routeDispositionTarget(name, packet, isAllowed, currentDisposition = null) {
    const isDirect = packet.ActionTargets.includes(name);
    const isOpp = packet.OppTargets.NPC.includes(name);
    const isBenefited = packet.BenefitedObservers.includes(name);
    const isHarmed = packet.HarmedObservers.includes(name);
    const landed = Number(packet.LandedActions) > 0;
    const g = packet.GOAL;
    const challenge = `${packet.GOAL || ''} ${packet.DecisiveAction || ''}`;
    const out = packet.Outcome;

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!isDirect && !isOpp && isBenefited) return outcomeImprovesStakes(packet) ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g)) {
        if (isAllowed === 'Y') return 'Bond';
        if (g === 'IntimacyAdvancePhysical') return 'FearHostility';
        return 'Hostility';
    }
    if (/intimidat|coerc|menac|threat|submission|terroriz|blackmail|reveal|expose|unless|if\b.*\bnot|demand|order|warn/i.test(challenge)) return 'Fear';
    if ((isDirect || isOpp) && /\b(insult|mock|belittle|humiliate|taunt|provoke|offend|slander|accuse)\b/i.test(challenge)) return 'Hostility';
    if (isDirect && (/\b(give|return|offer|help|heal|protect|shield|free|release|rescue|save)\b/i.test(challenge)
        || /\bhand\b[\s\S]{0,80}\b(potion|medicine|bandage|food|water|key|coin|money|dagger|knife|letter|item|object|supplies)\b/i.test(challenge))) {
        return outcomeImprovesStakes(packet) ? 'Bond' : 'No Change';
    }
    if ((isDirect || isOpp || isHarmed) && packet.HostilePhysicalHarm === 'Y') {
        return landed && ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    }
    if (landed && (isDirect || isOpp || isHarmed)) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if ((isDirect || isOpp) && /\b(grab|yank|drag|pin|restrain|tackle|trip|shove|push|barge|force past|force through|throw|hurl|toss|fling|spit|steal|snatch|pickpocket|palm)\b/i.test(challenge)) return 'Hostility';
    if (isBenefited && outcomeImprovesStakes(packet)) return 'Bond';
    return 'No Change';
}

function outcomeImprovesStakes(packet) {
    return ['success', 'dominant_impact', 'solid_impact', 'light_impact', 'no_roll'].includes(packet.Outcome);
}

function updateRapport(currentRapport, target, rapportEncounterLock) {
    if (rapportEncounterLock === 'Y') return { currentRapport, rapportEncounterLock: 'Y' };
    if (['Bond', 'No Change'].includes(target)) return { currentRapport: clamp(currentRapport + 1, 0, 5), rapportEncounterLock: 'Y' };
    if (['Hostility', 'Fear', 'FearHostility'].includes(target)) return { currentRapport: clamp(currentRapport - 1, 0, 5), rapportEncounterLock: 'Y' };
    return { currentRapport, rapportEncounterLock };
}

function deriveDirection(target, audit, currentDisposition, currentRapport) {
    if (target === 'Hostility') return { b: -1, f: 0, h: 1 };
    if (target === 'Fear') return { b: -1, f: 1, h: 0 };
    if (target === 'FearHostility') return { b: -1, f: 1, h: 1 };

    if (currentDisposition.F === 4 || currentDisposition.H === 4) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return {
                b: 0,
                f: currentDisposition.F === 4 ? -1 : 0,
                h: currentDisposition.F === 4 ? 0 : (currentDisposition.H === 4 ? -1 : 0),
                rapportReset: 'Y',
            };
        }
        return { b: 0, f: 0, h: 0 };
    }

    if (currentDisposition.F === 3 || currentDisposition.H === 3) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return {
                b: 0,
                f: currentDisposition.F === 3 ? -1 : 0,
                h: currentDisposition.F === 3 ? 0 : (currentDisposition.H === 3 ? -1 : 0),
            };
        }
        return { b: 0, f: 0, h: 0 };
    }

    if (target === 'No Change') return { b: 0, f: 0, h: 0 };

    if (target === 'Bond') {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 3) return currentRapport >= 5 && audit === 'Y' ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }

    return { b: 0, f: 0, h: 0 };
}

function updateDisposition(currentDisposition, deltas) {
    const next = {
        B: clamp(currentDisposition.B + (deltas.b || 0), 1, 4),
        F: clamp(currentDisposition.F + (deltas.f || 0), 1, 4),
        H: clamp(currentDisposition.H + (deltas.h || 0), 1, 4),
    };
    return normalizeLockedDisposition(next);
}

function normalizeLockedDisposition(disposition) {
    if (!disposition) return disposition;
    if (disposition.F >= 3 || disposition.H >= 3) {
        return { ...disposition, B: 1 };
    }
    return disposition;
}

function classifyDisposition(d) {
    const lock = d.F === 4 ? 'TERROR' : d.H === 4 ? 'HATRED' : (d.F === 3 || d.H === 3) ? 'FREEZE' : 'None';
    const behavior = lock !== 'None' ? lock : d.B === 4 ? 'CLOSE' : d.B === 3 ? 'FRIENDLY' : d.B === 2 ? 'NEUTRAL' : 'BROKEN';
    return { lock, behavior };
}

function checkThreshold(disposition, override) {
    const LockActive = disposition.F >= 3 || disposition.H >= 3 ? 'Y' : 'N';
    const Override = override && override !== 'unknown' ? override : 'NONE';
    const OverrideActive = disposition.B < 4 && Override !== 'NONE' ? 'Y' : 'N';
    return { LockActive, OverrideActive, Override };
}

function checkIntimacyConsent(packet, tracker) {
    if (!['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)) return 'N';
    const target = packet.ActionTargets[0] || packet.OppTargets.NPC[0];
    if (!target) return 'N';
    const found = findNpc(tracker, target);
    if (!found) return 'N';
    const disposition = normalizeLockedDisposition(sanitizeDisposition(found.npc.disposition));
    if (disposition) found.npc.disposition = disposition;
    if (found.npc.intimacyGate === 'DENY') return 'N';
    if (disposition && (disposition.F >= 3 || disposition.H >= 3)) return 'N';
    return disposition?.B >= 4 || found.npc.intimacyGate === 'ALLOW' ? 'Y' : 'N';
}

function initPresetForNpc(name, clean) {
    const fact = clean.npcFacts.find(x => eqName(x.name, name));
    switch (fact?.explicitPreset) {
        case 'romanticOpen': return { B: 4, F: 1, H: 1 };
        case 'userBadRep': return { B: 1, F: 2, H: 3 };
        case 'userGoodRep': return { B: 3, F: 1, H: 2 };
        case 'userNonHuman': return { B: 1, F: 3, H: 2 };
        default: return { B: 2, F: 2, H: 2 };
    }
}

function applyRevealedNpcNames(tracker, clean) {
    for (const fact of clean?.npcFacts || []) {
        const newName = cleanNpcName(fact?.name);
        const oldName = cleanNpcName(fact?.revealedFrom);
        if (!newName || !oldName || eqName(newName, oldName)) continue;
        const oldEntry = findNpc(tracker, oldName);
        if (!oldEntry) continue;
        const newId = makeNpcId(newName);
        const oldNpc = oldEntry.npc;
        const existingNew = tracker.npcs?.[newId];
        const aliases = cleanList([
            oldNpc.name,
            oldName,
            ...(Array.isArray(oldNpc.aliases) ? oldNpc.aliases : []),
            ...(Array.isArray(fact.aliases) ? fact.aliases : []),
        ]);
        const renamed = {
            ...oldNpc,
            ...(existingNew || {}),
            id: newId,
            name: newName,
            aliases,
            descriptor: fact.descriptor || oldNpc.descriptor || existingNew?.descriptor || '',
            revealedFrom: oldNpc.name || oldName,
            present: oldNpc.present !== false || existingNew?.present === true,
        };
        tracker.npcs[newId] = renamed;
        if (oldEntry.id !== newId) {
            delete tracker.npcs[oldEntry.id];
            tracker.presentNpcIds = (tracker.presentNpcIds || []).map(id => id === oldEntry.id ? newId : id);
        }
    }
    tracker.presentNpcIds = unique(tracker.presentNpcIds || []);
}

function ensureNpc(tracker, name, clean) {
    const existing = findNpc(tracker, name);
    if (existing) return existing;
    const id = makeNpcId(name);
    const fact = clean?.npcFacts?.find(x => eqName(x.name, name));
    const generated = generateNpcStats(fact?.rank, fact?.mainStat);
    tracker.npcs[id] = {
        id,
        name,
        aliases: cleanList([...(Array.isArray(fact?.aliases) ? fact.aliases : []), fact?.descriptor].filter(Boolean)),
        descriptor: fact?.descriptor || '',
        revealedFrom: fact?.revealedFrom || '',
        present: true,
        position: fact?.position || '',
        condition: fact?.condition || 'unknown',
        disposition: initPresetForNpc(name, clean || { npcFacts: [] }),
        rapport: 0,
        rapportEncounterLock: 'N',
        intimacyGate: 'SKIP',
        coreStats: generated.stats,
        rank: generated.rank,
        mainStat: generated.mainStat,
        knowsUser: fact?.knowsUser || 'unknown',
        override: fact?.override && fact.override !== 'unknown' ? fact.override : 'NONE',
        archiveStatus: fact?.archiveStatus && fact.archiveStatus !== 'unknown' ? fact.archiveStatus : 'Active',
    };
    return { id, npc: tracker.npcs[id] };
}

function findNpc(tracker, name) {
    const wanted = normalizeName(name);
    for (const [id, npc] of Object.entries(tracker.npcs || {})) {
        if (id === makeNpcId(name) || normalizeName(npc.name) === wanted || (npc.aliases || []).some(alias => normalizeName(alias) === wanted)) {
            return { id, npc };
        }
    }
    return null;
}

function generateNpcStats(rank = 'unknown', mainStat = 'unknown') {
    const safeRank = ['Weak', 'Average', 'Trained', 'Elite', 'Boss'].includes(rank) ? rank : 'Average';
    const safeMain = ['PHY', 'MND', 'CHA', 'Balanced'].includes(mainStat) ? mainStat : 'Balanced';
    const ranges = {
        Weak: [1, 1],
        Average: [1, 3],
        Trained: [2, 4],
        Elite: [3, 6],
        Boss: [6, 10],
    };
    const [lo, hi] = ranges[safeRank];
    const mid = Math.max(lo, Math.floor((lo + hi) / 2));
    const stats = { PHY: mid, MND: mid, CHA: mid };
    if (safeMain !== 'Balanced') {
        stats[safeMain] = hi;
    }
    return { rank: safeRank, mainStat: safeMain, stats };
}

function combatTier(margin) {
    if (margin >= 8) return { OutcomeTier: 'Critical_Success', LandedActions: 3, Outcome: 'dominant_impact', CounterPotential: 'none' };
    if (margin >= 5) return { OutcomeTier: 'Moderate_Success', LandedActions: 2, Outcome: 'solid_impact', CounterPotential: 'none' };
    if (margin >= 1) return { OutcomeTier: 'Minor_Success', LandedActions: 1, Outcome: 'light_impact', CounterPotential: 'none' };
    if (margin >= -3) return { OutcomeTier: 'Minor_Failure', LandedActions: 0, Outcome: 'checked', CounterPotential: 'light' };
    if (margin >= -7) return { OutcomeTier: 'Moderate_Failure', LandedActions: 0, Outcome: 'deflected', CounterPotential: 'medium' };
    return { OutcomeTier: 'Critical_Failure', LandedActions: 0, Outcome: 'avoided', CounterPotential: 'severe' };
}

function applyInventoryDeltas(tracker, deltas) {
    for (const delta of deltas) {
        if (!delta.item || !delta.evidence) continue;
        const item = String(delta.item).trim();
        if (!item) continue;
        if (['gain', 'equip'].includes(delta.action) && !tracker.inventory.some(x => normalizeName(x) === normalizeName(item))) {
            tracker.inventory.push(item);
        }
        if (['lose', 'use'].includes(delta.action)) {
            tracker.inventory = tracker.inventory.filter(x => normalizeName(x) !== normalizeName(item));
        }
    }
}

function applyTaskDeltas(tracker, deltas) {
    tracker.pendingTasks = Array.isArray(tracker.pendingTasks) ? tracker.pendingTasks : [];
    for (const delta of deltas) {
        if (!delta.task || !delta.evidence) continue;
        const task = cleanText(delta.task);
        if (!task) continue;
        const existingIndex = findPendingTaskIndex(tracker.pendingTasks, task);
        if (delta.action === 'add') {
            const entry = {
                task,
                due: cleanText(delta.due),
                source: cleanText(delta.source),
                status: 'Active',
                evidence: cleanText(delta.evidence),
            };
            if (existingIndex >= 0) {
                tracker.pendingTasks[existingIndex] = { ...tracker.pendingTasks[existingIndex], ...entry };
            } else {
                tracker.pendingTasks.push(entry);
            }
        }
        if (['complete', 'cancel'].includes(delta.action) && existingIndex >= 0) {
            tracker.pendingTasks.splice(existingIndex, 1);
        }
    }
}

function findPendingTaskIndex(tasks, task) {
    const wanted = taskKey(task);
    return tasks.findIndex(x => {
        const existing = taskKey(x?.task || x);
        if (!existing || !wanted) return false;
        if (existing === wanted || existing.includes(wanted) || wanted.includes(existing)) return true;
        const existingWords = new Set(existing.split(' ').filter(Boolean));
        const wantedWords = wanted.split(' ').filter(Boolean);
        const overlap = wantedWords.filter(word => existingWords.has(word)).length;
        return overlap >= Math.min(2, wantedWords.length, existingWords.size);
    });
}

function taskKey(value) {
    return normalizeName(String(value || '')
        .toLowerCase()
        .replace(/\bmeeting\b/g, 'meet')
        .replace(/\bappointment\b/g, 'meet')
        .replace(/\bdelivered\b/g, 'deliver')
        .replace(/\bcompleted\b/g, 'complete')
        .replace(/\b(?:the|a|an|to|with|at|by|before|for|about|task|quest|job|errand|promise|delivery|favor)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim());
}

function sanitizeExtraction(value) {
    const input = value && typeof value === 'object' ? value : {};
    const clean = {
        ooc: yn(input.ooc),
        oocMode: ['IC', 'STOP', 'PROXY', 'MIXED'].includes(input.oocMode) ? input.oocMode : (yn(input.ooc) === 'Y' ? 'STOP' : 'IC'),
        oocInstruction: cleanText(input.oocInstruction),
        goal: cleanText(input.goal) || 'unspecified action',
        goalKind: ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(input.goalKind) ? input.goalKind : 'Normal',
        goalEvidence: cleanText(input.goalEvidence),
        decisiveAction: cleanText(input.decisiveAction),
        decisiveActionEvidence: cleanText(input.decisiveActionEvidence),
        outcomeOnSuccess: cleanText(input.outcomeOnSuccess),
        outcomeOnFailure: cleanText(input.outcomeOnFailure),
        actionTargets: cleanList(input.actionTargets),
        oppTargetsNpc: cleanList(input.oppTargetsNpc),
        oppTargetsEnv: cleanList(input.oppTargetsEnv),
        benefitedObservers: cleanList(input.benefitedObservers),
        harmedObservers: cleanList(input.harmedObservers),
        npcInScene: cleanList(input.npcInScene),
        hasStakes: yn(input.hasStakes),
        stakesEvidence: cleanText(input.stakesEvidence),
        actionCount: clamp(Number(input.actionCount || 1), 1, 3),
        userStat: STAT_NAMES.includes(input.userStat) ? input.userStat : 'MND',
        userStatEvidence: cleanText(input.userStatEvidence),
        oppStat: [...STAT_NAMES, 'ENV'].includes(input.oppStat) ? input.oppStat : 'ENV',
        oppStatEvidence: cleanText(input.oppStatEvidence),
        hostilePhysicalHarm: yn(input.hostilePhysicalHarm),
        newEncounter: yn(input.newEncounter),
        timeDeltaMinutes: clamp(Number(input.timeDeltaMinutes || 0), -10080, 10080),
        timeSkipReason: cleanText(input.timeSkipReason),
        systemOnlyUpdate: yn(input.systemOnlyUpdate),
        systemOnlyUpdateReason: cleanText(input.systemOnlyUpdateReason),
        scene: {
            location: cleanText(input.scene?.location),
            time: cleanText(input.scene?.time),
            weather: cleanText(input.scene?.weather),
        },
        npcFacts: Array.isArray(input.npcFacts) ? input.npcFacts.map(sanitizeNpcFact).filter(x => x.name) : [],
        inventoryDeltas: Array.isArray(input.inventoryDeltas) ? input.inventoryDeltas.map(sanitizeInventoryDelta).filter(x => x.item) : [],
        taskDeltas: Array.isArray(input.taskDeltas) ? input.taskDeltas.map(sanitizeTaskDelta).filter(x => x.task) : [],
    };
    return normalizeExtractionMechanics(clean);
}

function normalizeExtractionMechanics(clean) {
    const text = [
        clean.goal,
        clean.goalEvidence,
        clean.decisiveAction,
        clean.decisiveActionEvidence,
    ].join(' ');
    const lower = text.toLowerCase();
    const hasLivingOpposition = clean.oppTargetsNpc.length > 0;
    const hasEnvironmentOpposition = clean.oppTargetsEnv.length > 0;

    const social = /\b(convince|persuade|negotiate|bargain|plead|ask|tell|say|promise|diplomac|talk|flatter|charm|deceive|lie|bluff|trick|fool|distract|misdirect|intimidat|coerc|blackmail|threat|pressure|demand|order|warn|conceal)\b/.test(lower);
    const deceptiveOrHostileSocial = /\b(deceive|lie|bluff|trick|fool|distract|misdirect|intimidat|coerc|blackmail|threat|pressure|demand|order|warn|conceal|look over there|look there|look away|glance away|turn away|reveal|expose|unless|if\b.*\bnot)\b/.test(lower);
    const magicSocial = /\b(charm|glamou?r|compel|compulsion|enthrall|enchant|seduc|fear aura|aura of fear|aura of command|magical deception|illusion.*(?:believe|emotion|trust|desire))\b/.test(lower);
    const magicMental = /\b(magic|spell|cast|channel|ritual|ward|dispel|counterspell|curse|hex|blessing|heal|summon|teleport|divin|scry|illusion|glamou?r|enchant|charm|compel|possess|psychic|spirit|soul|mana|arcane|rune|sigil|portal|elemental|fireball|lightning|ice|shadow|holy|necrotic)\b/.test(lower);
    const magicPhysicalDelivery = /\b(aim|throw|hurl|toss|touch|strike|slash|stab|shoot|swing|swipe|wand|staff|rod|weapon|blade|arrow|bolt|projectile|sigil while|draw.*sigil)\b/.test(lower) && magicMental;
    const stealth = /\b(sneak|creep|hide|stealth|unnoticed|undetected|avoid notice|without being seen|without being noticed|pickpocket|sleight|slip past|slip by)\b/.test(lower);
    const hostilePhysical = clean.hostilePhysicalHarm === 'Y' || /\b(hit|punch|kick|slap|cut|slash|stab|shoot|strike|attack|slam|kill|wound|injure|hurt)\b/.test(lower)
        || /\b(swing|swipe|sweep|bring|drive|thrust|jab)\b[\s\S]{0,80}\b(sword|blade|axe|mace|club|knife|dagger|spear|staff|fist|elbow|knee|boot)\b[\s\S]{0,80}\b(at|into|toward|towards|for|against)\b/.test(lower);
    const technicalMentalEnv = /\b(study|inspect|analyze|solve|decode|investigate|trace|identify|diagnose|figure out|careful|carefully)\b[\s\S]{0,120}\b(disarm|pick|unlock|bypass|disable|open)\b[\s\S]{0,120}\b(trap|mechanism|lock|wire|runes|device)\b/.test(lower)
        || /\b(disarm|pick|unlock|bypass|disable|open)\b[\s\S]{0,120}\b(trap|mechanism|lock|wire|runes|device)\b[\s\S]{0,120}\b(study|inspect|analyze|solve|decode|investigate|trace|identify|diagnose|figure out|careful|carefully)\b/.test(lower);
    const physicalContest = hostilePhysical || (!technicalMentalEnv && /\b(shove|push|barge|force|grapple|wrestle|tackle|restrain|break free|dodge|duck|run|sprint|chase|climb|jump|leap|vault|swim|lift|carry|break|smash|force open|disarm|pick lock)\b/.test(lower));
    const mentalEnv = /\b(search|inspect|study|analyze|recall|remember|know|identify|track|survival|forage|navigate|diagnose|solve|decode|investigate|perceive|listen|spot|focus|ritual|spell|cast|channel|ward|dispel|counterspell|curse|hex|blessing|heal|summon|teleport|divin|scry|illusion|enchant|rune|sigil|portal|arcane|magic)\b/.test(lower);

    if (hasLivingOpposition && clean.oppStat === 'ENV') {
        clean.oppStat = social || stealth || magicMental ? 'MND' : 'PHY';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Living opposition cannot resolve as ENV.';
    }

    if (hasLivingOpposition && magicSocial) {
        clean.userStat = 'CHA';
        clean.oppStat = 'MND';
        clean.userStatEvidence = clean.userStatEvidence || 'Supernatural social influence uses CHA.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Target resists magical social pressure with MND.';
    }

    if (hasLivingOpposition && clean.goalKind === 'IntimacyAdvanceVerbal') {
        clean.userStat = 'CHA';
        clean.oppStat = 'MND';
        clean.userStatEvidence = clean.userStatEvidence || 'Explicit verbal intimacy proposition uses CHA.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Target resists unwanted intimacy/boundary pressure with MND.';
    }

    if (hasLivingOpposition && social && !magicSocial && clean.goalKind !== 'IntimacyAdvanceVerbal') {
        clean.userStat = 'CHA';
        clean.oppStat = deceptiveOrHostileSocial ? 'MND' : 'CHA';
        clean.userStatEvidence = clean.userStatEvidence || 'Social influence uses CHA.';
        clean.oppStatEvidence = clean.oppStatEvidence || (deceptiveOrHostileSocial ? 'Target resists deception, pressure, or concealed intent with MND.' : 'Target contests sincere social influence with CHA.');
    }

    if (hasLivingOpposition && magicMental && !magicSocial && !social && !physicalContest) {
        clean.userStat = 'MND';
        clean.oppStat = 'MND';
        clean.userStatEvidence = clean.userStatEvidence || 'Deliberate supernatural exertion uses MND.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Living magical, mental, spiritual, or perceptive resistance uses MND.';
    }

    if (hasLivingOpposition && magicMental && magicPhysicalDelivery && !magicSocial && !social && !stealth) {
        clean.userStat = clean.userStat === 'PHY' ? 'PHY' : 'MND';
        clean.oppStat = physicalContest ? 'PHY' : clean.oppStat;
        clean.userStatEvidence = clean.userStatEvidence || 'Magic delivery is mapped by the decisive casting or bodily delivery method.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Living target resists by the explicit defense mode.';
    }

    if (hasLivingOpposition && stealth) {
        clean.userStat = 'PHY';
        clean.oppStat = 'MND';
        clean.userStatEvidence = clean.userStatEvidence || 'Stealth movement or sleight of hand uses PHY.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Living observer passively opposes with awareness/perception.';
    }

    if (hasLivingOpposition && physicalContest && !stealth && !social) {
        clean.userStat = 'PHY';
        clean.oppStat = 'PHY';
        clean.userStatEvidence = clean.userStatEvidence || 'Physical contest uses PHY.';
        clean.oppStatEvidence = clean.oppStatEvidence || 'Living target physically resists or contests with PHY.';
    }

    if (!hasLivingOpposition && hasEnvironmentOpposition) {
        clean.oppStat = 'ENV';
        if (social) {
            clean.userStat = 'CHA';
        } else if (technicalMentalEnv || magicMental || (mentalEnv && !physicalContest)) {
            clean.userStat = 'MND';
        } else if (physicalContest) {
            clean.userStat = 'PHY';
        }
    }

    if (hasLivingOpposition && clean.oppTargetsEnv.length && clean.oppStat === 'ENV') {
        clean.oppStat = social || stealth ? 'MND' : 'PHY';
    }

    return clean;
}

function sanitizeNpcFact(x) {
    return {
        name: cleanText(x?.name),
        aliases: cleanList(x?.aliases),
        descriptor: cleanText(x?.descriptor),
        revealedFrom: cleanText(x?.revealedFrom),
        present: x?.present === false ? false : (x?.present === true ? true : undefined),
        position: cleanText(x?.position),
        condition: cleanText(x?.condition),
        knowsUser: cleanText(x?.knowsUser),
        explicitPreset: ['romanticOpen', 'userBadRep', 'userGoodRep', 'userNonHuman', 'neutralDefault', 'unknown'].includes(x?.explicitPreset) ? x.explicitPreset : 'unknown',
        rank: ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'unknown'].includes(x?.rank) ? x.rank : 'unknown',
        mainStat: ['PHY', 'MND', 'CHA', 'Balanced', 'unknown'].includes(x?.mainStat) ? x.mainStat : 'unknown',
        explicitStats: sanitizeStats(x?.explicitStats, null, 1, 10),
        disposition: sanitizeDisposition(x?.disposition),
        rapport: Number.isFinite(Number(x?.rapport)) ? clamp(Number(x.rapport), 0, 5) : null,
        rapportEncounterLock: ['Y', 'N'].includes(x?.rapportEncounterLock) ? x.rapportEncounterLock : null,
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(x?.intimacyGate) ? x.intimacyGate : null,
        override: ['Transactional', 'Hedonist', 'Exploitation', 'Established', 'NONE', 'unknown'].includes(x?.override) ? x.override : 'unknown',
        archiveStatus: ['Active', 'Inactive', 'Dead', 'Retired', 'Forgotten', 'unknown'].includes(x?.archiveStatus) ? x.archiveStatus : 'unknown',
    };
}

function sanitizeInventoryDelta(x) {
    return {
        action: ['gain', 'lose', 'equip', 'unequip', 'use', 'damage'].includes(x?.action) ? x.action : 'gain',
        item: cleanText(x?.item),
        evidence: cleanText(x?.evidence),
    };
}

function sanitizeTaskDelta(x) {
    return {
        action: ['add', 'complete', 'cancel'].includes(x?.action) ? x.action : 'add',
        task: cleanText(x?.task),
        due: cleanText(x?.due),
        source: cleanText(x?.source),
        evidence: cleanText(x?.evidence),
    };
}

function sanitizeStats(stats, fallback = null, min = 1, max = 10) {
    if (!stats || typeof stats !== 'object') return fallback;
    const out = {};
    for (const stat of STAT_NAMES) {
        if (!Number.isFinite(Number(stats[stat]))) return fallback;
        out[stat] = clamp(Number(stats[stat]), min, max);
    }
    return out;
}

function sanitizeClock(clock) {
    const input = clock && typeof clock === 'object' ? clock : {};
    const absoluteMinutes = Number(input.absoluteMinutes);
    const lastRealTimestamp = Number(input.lastRealTimestamp);
    const scale = Number(input.scale);
    return {
        enabled: input.enabled !== false,
        absoluteMinutes: Number.isFinite(absoluteMinutes) ? Math.round(absoluteMinutes) : null,
        lastRealTimestamp: Number.isFinite(lastRealTimestamp) ? lastRealTimestamp : null,
        scale: Number.isFinite(scale) && scale > 0 ? clamp(scale, 0.1, 120) : 6,
        lastAdvance: cleanText(input.lastAdvance),
        source: cleanText(input.source) || 'unset',
    };
}

function sanitizeDisposition(d) {
    if (!d || typeof d !== 'object') return null;
    if (![d.B, d.F, d.H].every(x => Number.isFinite(Number(x)))) return null;
    return { B: clamp(Number(d.B), 1, 4), F: clamp(Number(d.F), 1, 4), H: clamp(Number(d.H), 1, 4) };
}

function rollD20(rolls, label) {
    const value = Math.floor(Math.random() * 20) + 1;
    rolls.push({ label, value });
    return value;
}

function overrideForNpc(name, clean) {
    const fact = clean.npcFacts.find(x => eqName(x.name, name));
    return fact?.override && fact.override !== 'unknown' ? fact.override : 'NONE';
}

function cleanList(list) {
    return unique((Array.isArray(list) ? list : []).map(cleanText).filter(Boolean).filter(x => normalizeName(x) !== 'none'));
}

function cleanText(value) {
    return String(value || '').trim().slice(0, 300);
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanNpcName(value) {
    const cleaned = String(value || '')
        .trim()
        .replace(/[Ã¢â‚¬â„¢']s$/i, '')
        .replace(/[.,!?;:]+$/g, '')
        .trim();
    if (!cleaned || /^(?:i|me|my|mine|you|your|yours|he|him|his|she|her|hers|they|them|their|theirs|we|us|our|ours|user|nameless|unnamed|unknown|anonymous|and|or|but|as|while|then|finally|once|with|without|toward|towards|behind|beside|near|around|at|on|into|for|against|the|a|an|this|that|there|here|door|gate|coin|bill|table|counter|floor|wall|window|room|path|road|magic|spell|curse|hex|ward|seal|barrier|borrowed|healing|falling|locked)$/i.test(cleaned)) {
        return '';
    }
    if (/^[a-z]/.test(cleaned) && !/^(?:npc|person|man|woman|girl|boy|guard|merchant|soldier|bandit|barmaid|bartender|waitress|patron|stranger|prisoner|captive|villager|noble|servant|knight|mage|witch|cultist|beast|monster|attacker|enemy|friend|girlfriend|boyfriend|lover|companion|observer|bystander)$/i.test(cleaned)) {
        return '';
    }
    return cleaned;
}

function firstCleanNpcName(values) {
    for (const value of values) {
        const cleaned = cleanNpcName(value);
        if (cleaned) return cleaned;
    }
    return '';
}

function yn(value) {
    return String(value).toUpperCase() === 'Y' ? 'Y' : 'N';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Math.trunc(value || min)));
}

function unique(list) {
    return [...new Map(list.map(x => [normalizeName(x), x])).values()];
}

function makeNpcId(name) {
    const id = normalizeName(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return id || 'unnamed_npc';
}

function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

function eqName(a, b) {
    return normalizeName(a) === normalizeName(b);
}

function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}
