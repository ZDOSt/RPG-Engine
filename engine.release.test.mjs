import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
    DEFAULT_RENDER_RULES,
    DEFAULT_WRITING_STYLE,
    buildFinalNarrationPayload,
    buildCharacterSheet,
    chaosInterrupt,
    createTracker,
    inferFallbackExtraction,
    mergeExtractionWithFallback,
    npcAggressionResolution,
    npcProactivityEngine,
    parseNpcArchiveContent,
    reserveNameCandidates,
    resolveTurn,
    rollCharacterCreatorBasics,
    rollCharacterCreatorStats,
    applyCharacterCreatorReroll,
    applyCharacterCreatorSwap,
    serializeNpcArchiveEntry,
    summarizeTracker,
    upsertArchivedNpc,
} from './engine.js';

const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function textBlock(value) {
    return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function lcg(seed) {
    let s = seed >>> 0;
    return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}

function withRandom(seed, fn) {
    const old = Math.random;
    Math.random = lcg(seed);
    try {
        return fn();
    } finally {
        Math.random = old;
    }
}

function withSequence(values, fn) {
    const old = Math.random;
    let i = 0;
    Math.random = () => values[i++] ?? values.at(-1) ?? 0.5;
    try {
        return fn();
    } finally {
        Math.random = old;
    }
}

function baseTracker() {
    const t = createTracker();
    t.scene = { location: 'Market Street', time: '14:00', weather: 'light rain' };
    t.worldClock = {
        enabled: true,
        absoluteMinutes: 14 * 60,
        lastRealTimestamp: Date.now(),
        scale: 6,
        lastAdvance: 'release stress seed',
        source: 'manual',
    };
    t.user.name = 'TestUser';
    t.user.stats = { PHY: 6, MND: 6, CHA: 6 };
    for (const [name, disposition, stats, gate] of [
        ['Seraphina', { B: 2, F: 1, H: 1 }, { PHY: 5, MND: 6, CHA: 5 }, 'DENY'],
        ['Mira', { B: 4, F: 1, H: 1 }, { PHY: 4, MND: 5, CHA: 7 }, 'ALLOW'],
        ['Garron', { B: 1, F: 2, H: 3 }, { PHY: 8, MND: 4, CHA: 3 }, 'DENY'],
    ]) {
        t.npcs[name] = {
            id: name,
            name,
            present: true,
            position: 'nearby',
            condition: 'healthy',
            knowsUser: 'name',
            disposition,
            rapport: 0,
            rapportEncounterLock: 'N',
            intimacyGate: gate,
            coreStats: stats,
            rank: 'capable',
            mainStat: 'unknown',
            override: 'NONE',
            archiveStatus: 'active',
            continuity: '',
            personality: '',
        };
        t.presentNpcIds.push(name);
    }
    t.inventory = ['rope', 'lantern'];
    t.pendingTasks = [{ title: 'Meet the informant', status: 'pending' }];
    return t;
}

function runMessageCase(id, message, seed = id + 1000, characterName = 'Seraphina') {
    const tracker = baseTracker();
    const fallback = inferFallbackExtraction(message, characterName, tracker);
    const extraction = mergeExtractionWithFallback({}, fallback);
    const result = withRandom(seed, () => resolveTurn(extraction, tracker, { userStats: tracker.user.stats }));
    return {
        id,
        message,
        goal: extraction.goal || '(none)',
        decisiveAction: extraction.decisiveAction || '(none)',
        actionTargets: extraction.actionTargets || [],
        oppNpc: extraction.oppTargetsNpc || [],
        oppEnv: extraction.oppTargetsEnv || [],
        hasStakes: extraction.hasStakes,
        stats: `${extraction.userStat || '(none)'} vs ${extraction.oppStat || '(none)'}`,
        actionCount: extraction.actionCount,
        outcome: result.packet.Outcome,
        tier: result.packet.OutcomeTier,
        margin: result.packet.Margin,
        landed: result.packet.LandedActions,
        counter: result.packet.CounterPotential,
        rolls: result.audit.rolls,
        relationships: result.npcHandoffs.map(h => ({
            npc: h.NPC,
            target: h.Target,
            before: h.Before,
            after: h.After,
            gate: h.IntimacyGate,
            stakes: h.NPC_STAKES,
        })),
        chaos: result.chaosHandoff.CHAOS,
        proactivity: result.proactivityHandoff,
        aggression: result.aggressionResults,
    };
}

const messages = [
    'I ask Seraphina for directions to the temple.',
    'I tell Seraphina I love her.',
    'I ask Seraphina to show me her panties.',
    'I kiss Seraphina.',
    'I distract Seraphina, then kiss her if she looks away.',
    'I distract Seraphina and reach for the 100 dollar bill on the table.',
    'I slap Seraphina once.',
    'I slap Seraphina twice.',
    'I get up, and take a step towards her... then throw a sideways punch at the side of her face. Using the momentum of my swing, I pivot on my foot, bringing my other hand around in a backhand slap. Finally, I knee her in the stomach',
    'I draw my sword, step forward, and slash Seraphina across the arm.',
    'I shove past Seraphina without trying to hurt her.',
    'I sneak past the guard while he watches the gate.',
    'I palm the silver coin while Seraphina watches my hands.',
    'I jump over the chasm.',
    'I kick the locked door open.',
    'I carefully inspect the trap mechanism and disarm it.',
    'I forage for edible plants in the woods.',
    'I search the pantry for edible supplies.',
    'I cast a curse at Seraphina.',
    'I try to charm Seraphina with magic.',
    'I dispel the warded door.',
    'I use spirit sight to look for hidden ghosts.',
    'I heal Seraphina while the curse is still active.',
    'I hand Seraphina a healing potion.',
    'I return the borrowed dagger to Seraphina.',
    'I protect Seraphina from the falling beam.',
    'I free the prisoner from the locked cage.',
    'I mock Seraphina in front of everyone.',
    'I threaten Seraphina unless she gives me the key.',
    'I honestly persuade Seraphina to let me pass.',
    'I compliment Seraphina on her sword stance.',
    'I apologize to Seraphina for bothering her.',
    'I ask Seraphina what time it is.',
    'I ask the bartender for the public rumor about the road.',
    'I demand that Garron kneel.',
    'I try to intimidate Garron into backing down.',
    'I run away from Garron as he blocks the alley.',
    'I wrestle Garron for the knife.',
    'I throw a bottle at Garron.',
    'I duck under Garron and sprint for the exit.',
    'I ask Mira to kiss me.',
    'I kiss Mira.',
    'I tell Mira I missed her.',
    'I help Mira carry the heavy crate.',
    'I save Mira from the collapsing shelf.',
    'I ask Mira for her private password.',
    'I lie to Mira about where I was last night.',
    'I negotiate with Mira over the price.',
    'I give Mira the silver ring.',
    'I offer Mira water.',
    'I pick the iron lock.',
    'I read the runes on the altar.',
    'I climb the wet wall.',
    'I swim across the flooded tunnel.',
    'I track footprints through the market mud.',
    'I identify the strange herb.',
    'I investigate the silent room.',
    'I ask the guard his name.',
    'I greet the barmaid politely.',
    'I taunt Garron about losing.',
    'I spit at Garron.',
    'I pin Garron against the wall.',
    'I trip Garron as he steps in.',
    'I slash at Garron with my knife, then kick his knee.',
    'I cast a fear aura at Garron.',
    'I summon a light over the dark stairwell.',
    'I bless the sealed gate.',
    'I teleport across the ravine.',
    'I scry for the missing merchant.',
    'I look for a hidden aura around Seraphina.',
];

const resolutionCases = messages.map((m, i) => runMessageCase(
    i + 1,
    m,
    i * 97 + 13,
    m.includes('Garron') ? 'Garron' : m.includes('Mira') ? 'Mira' : 'Seraphina',
));

const byMsg = text => resolutionCases.find(c => c.message === text);
assert.equal(byMsg('I ask Seraphina for directions to the temple.').hasStakes, 'N');
assert.equal(byMsg('I ask Seraphina for directions to the temple.').outcome, 'no_roll');
assert.equal(byMsg(messages[8]).actionCount, 3);
assert.deepEqual(byMsg(messages[8]).actionTargets, ['Seraphina']);
assert.equal(byMsg('I distract Seraphina and reach for the 100 dollar bill on the table.').stats, 'CHA vs MND');
assert.equal(byMsg('I cast a curse at Seraphina.').stats, 'MND vs MND');
assert.equal(byMsg('I try to charm Seraphina with magic.').stats, 'CHA vs MND');
assert.equal(byMsg('I dispel the warded door.').stats, 'MND vs ENV');
assert.equal(byMsg('I protect Seraphina from the falling beam.').stats, 'PHY vs ENV');
assert.equal(byMsg('I search the pantry for edible supplies.').stats, 'MND vs ENV');
assert.equal(byMsg('I mock Seraphina in front of everyone.').stats, 'CHA vs MND');

const chaosCases = [];
for (let i = 0; i < 10; i++) {
    const handoffs = [
        {
            NPC: 'Seraphina',
            FinalState: i % 2 ? 'B4/F1/H1' : 'B2/F1/H1',
            Lock: 'None',
            Behavior: i % 2 ? 'CLOSE' : 'NEUTRAL',
            Target: i % 3 ? 'No Change' : 'Bond',
            NPC_STAKES: i % 3 ? 'N' : 'Y',
            Landed: 'N',
            IntimacyGate: i % 2 ? 'ALLOW' : 'DENY',
            Override: 'NONE',
        },
        ...(i % 4 === 0 ? [{
            NPC: 'Garron',
            FinalState: 'B1/F2/H3',
            Lock: 'FREEZE',
            Behavior: 'FREEZE',
            Target: 'Hostility',
            NPC_STAKES: 'Y',
            Landed: 'N',
            IntimacyGate: 'DENY',
            Override: 'NONE',
        }] : []),
    ];
    const packet = {
        GOAL: 'Normal',
        ActionTargets: ['Seraphina'],
        OppTargets: { NPC: [], ENV: [] },
        Outcome: 'no_roll',
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        CounterPotential: 'none',
    };
    const seq = i % 2 === 0
        ? [0.9, 0.02 + i / 100, 0.9, 0.1, 0.35, 0.95, 0.95, 0.95]
        : [0.2, 0.5, 0.5, 0.1, 0.1, 0.95, 0.95];
    const c = withSequence(seq, () => chaosInterrupt(packet, handoffs, i % 2 ? 'quiet room' : 'public market', []));
    const p = withSequence([0.99, 0.75, 0.55], () => npcProactivityEngine(handoffs, packet, c, baseTracker(), []));
    chaosCases.push({ id: i + 71, chaos: c.CHAOS, proactivity: p, handoffs });
}
assert(chaosCases.some(c => c.chaos.triggered));
assert(chaosCases.some(c => Object.values(c.proactivity).some(p => p.Proactive === 'Y')));

const forcedPacket = {
    GOAL: 'Normal',
    ActionTargets: ['Garron'],
    OppTargets: { NPC: ['Garron'], ENV: [] },
    Outcome: 'avoided',
    OutcomeTier: 'CRITICAL_FAILURE',
    LandedActions: 0,
    CounterPotential: 'severe',
};
const forcedHandoff = [{
    NPC: 'Garron',
    FinalState: 'B1/F2/H3',
    Lock: 'FREEZE',
    Behavior: 'FREEZE',
    Target: 'Hostility',
    NPC_STAKES: 'Y',
    Landed: 'N',
    IntimacyGate: 'DENY',
    Override: 'NONE',
}];
const forcedPro = npcProactivityEngine(
    forcedHandoff,
    forcedPacket,
    { CHAOS: { triggered: false, band: 'None' } },
    baseTracker(),
    [],
);
const forcedAgg = withSequence([0.8, 0.1], () => npcAggressionResolution(forcedPro, baseTracker(), []));
assert.equal(forcedPro.Garron.Proactive, 'Y');
assert.equal(forcedPro.Garron.CounterBonus, 3);

const nameTracker = createTracker();
const names = reserveNameCandidates(nameTracker, 6, { style: 'tolkienic', customStyle: '' });
assert.equal(names.person.length, 6);
assert(names.person.every(n => n.length >= 5 && n.length <= 10));
assert(names.location.every(n => n.length >= 7 && n.length <= 14));
const payload = buildFinalNarrationPayload({
    packet: {
        GOAL: 'Normal',
        DecisiveAction: 'test payload',
        STAKES: 'N',
        USER_STAT: 'CHA',
        OPP_STAT: 'ENV',
        Outcome: 'no_roll',
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        CounterPotential: 'none',
        ActionTargets: [],
        OppTargets: { NPC: [], ENV: [] },
    },
    npcHandoffs: [],
    namePayload: {
        person: names.person.slice(0, 2),
        male: names.male.slice(0, 2),
        female: names.female.slice(0, 2),
        neutral: names.neutral.slice(0, 2),
        location: names.location.slice(0, 2),
        styleLabel: 'Tolkienic / High Fantasy',
        styleGuidance: 'lyrical fantasy names',
        customStyle: '',
    },
    renderRules: textBlock(DEFAULT_RENDER_RULES),
    writingStyle: textBlock(DEFAULT_WRITING_STYLE),
});
assert(payload.includes('AUTHORITATIVE RENDER RULES'));
assert(payload.includes('AUTHORITATIVE NAME GENERATION'));
assert(payload.includes('WRITING STYLE OVERLAY'));
assert(payload.includes('direct in-scene sensory evidence'));
assert(payload.includes('jaws setting'));
assert(payload.includes('temple pulses'));
assert(payload.includes('small physical tells are allowed only when they produce or reveal concrete scene behavior'));
assert(payload.includes('Proxy exception'));
assert(payload.includes('Start at the consequence/result/reaction'));

const archiveContent = serializeNpcArchiveEntry(baseTracker().npcs.Seraphina, { includeHeader: true, chatId: 'release-chat' });
assert.match(archiveContent, /ArchiveScope: Chat/);
assert.match(archiveContent, /ArchiveChatKey: release-chat/);
const parsedArchive = parseNpcArchiveContent(archiveContent);
assert.equal(parsedArchive.chatId, 'release-chat');
assert.equal(parsedArchive.archiveScope, 'Chat');
const archiveTracker = upsertArchivedNpc(createTracker(), parsedArchive, false);
assert(archiveTracker.npcs.Seraphina || archiveTracker.npcs.seraphina);

const creatorCases = [];
for (let i = 0; i < 10; i++) {
    const rolled = rollCharacterCreatorStats(lcg(900 + i));
    const basics = rollCharacterCreatorBasics(lcg(950 + i));
    const stat = i % 3 === 0 ? 'PHY' : i % 3 === 1 ? 'MND' : 'CHA';
    const rerolled = applyCharacterCreatorReroll(rolled.stats, stat, rolled.rerollValue);
    const swapped = applyCharacterCreatorSwap(rerolled.stats, 'PHY', 'CHA');
    const sheet = buildCharacterSheet({
        name: `Aelir${i}`,
        race: basics.race,
        gender: basics.gender,
        age: String(18 + i),
        appearance: {
            height: 'average',
            build: 'lean',
            hair: 'black',
            eyes: 'grey',
            skin: 'brown',
            distinctFeatures: 'travel-worn cloak',
        },
        traits: [
            { name: 'Night Adaptation', effect: 'Sees better in dim natural light.' },
            { name: 'Steady Memory', effect: 'Retains route details accurately.' },
        ],
        abilities: [
            { name: 'Threshold Step', effect: 'Briefly crosses a short gap when consciously invoked.' },
            { name: 'Thread Mark', effect: 'Marks one visible object for later recognition.' },
        ],
        inventory: ['traveler cloak', 'bedroll', 'flint kit'],
        notes: ['Private perception stays private unless shared or visibly acted upon.'],
    }, swapped.stats);
    assert(sheet.includes('PHY:'));
    assert(sheet.includes(`Race: ${basics.race}`));
    assert(sheet.includes('Gender:'));
    assert(sheet.includes('PRIVATE PERCEPTION RULE'));
    creatorCases.push({
        id: i + 91,
        rolls: rolled,
        basics,
        reroll: rerolled,
        swap: swapped,
        sheetPreview: sheet.split('\n').slice(0, 18),
    });
}

const allCases = [
    ...resolutionCases,
    ...chaosCases,
    { id: 81, forcedProactivity: forcedPro, forcedAggression: forcedAgg },
    { id: 82, names },
    { id: 83, archive: parsedArchive },
    ...creatorCases,
];

const reportLines = [];
reportLines.push('# RP Engine Release Stress Report');
reportLines.push('');
reportLines.push(`Generated: ${new Date().toISOString()}`);
reportLines.push('');
reportLines.push('## Summary');
reportLines.push(`- Resolution/relationship message cases: ${resolutionCases.length}`);
reportLines.push(`- Chaos/proactivity direct cases: ${chaosCases.length}`);
reportLines.push('- Forced counter/aggression case: 1');
reportLines.push('- Name/render/style/lorebook checks: 3');
reportLines.push(`- Character creator passes: ${creatorCases.length}`);
reportLines.push(`- Total checks/cases represented: ${allCases.length}`);
reportLines.push('');
reportLines.push('## Resolution And Relationship Cases');
for (const c of resolutionCases) {
    reportLines.push(`### ${c.id}. ${c.message}`);
    reportLines.push(`- Goal: ${c.goal}`);
    reportLines.push(`- Decisive action: ${c.decisiveAction}`);
    reportLines.push(`- Targets: action=${JSON.stringify(c.actionTargets)} oppNPC=${JSON.stringify(c.oppNpc)} oppENV=${JSON.stringify(c.oppEnv)}`);
    reportLines.push(`- Stakes/stats/actions: stakes=${c.hasStakes}; stats=${c.stats}; actionCount=${c.actionCount}`);
    reportLines.push(`- Outcome: ${c.outcome}; tier=${c.tier}; margin=${c.margin}; landed=${c.landed}; counter=${c.counter}`);
    reportLines.push(`- Rolls: ${c.rolls.map(r => `${r.label}:${r.value}`).join(', ') || '(none)'}`);
    reportLines.push(`- Relationship: ${c.relationships.map(r => `${r.npc} ${r.before || ''}->${r.after || ''} target=${r.target} gate=${r.gate}`).join('; ') || '(none)'}`);
    reportLines.push(`- Chaos: ${c.chaos.triggered ? `${c.chaos.band}/${c.chaos.magnitude} anchor=${c.chaos.anchor} vector=${c.chaos.vector}` : 'not triggered'}`);
    const pro = Object.entries(c.proactivity || {})
        .map(([n, p]) => `${n}:${p.Proactive}/${p.Intent}/tier=${p.ProactivityTier}/die=${p.ProactivityDie ?? '(none)'}/threshold=${p.Threshold ?? '(none)'}`)
        .join('; ');
    reportLines.push(`- Proactivity: ${pro || '(none)'}`);
    if (Object.keys(c.aggression || {}).length) reportLines.push(`- Aggression: ${JSON.stringify(c.aggression)}`);
    reportLines.push('');
}
reportLines.push('## Chaos And Proactivity Direct Cases');
for (const c of chaosCases) {
    reportLines.push(`### ${c.id}. Chaos/proactivity seeded case`);
    reportLines.push(`- Chaos: ${c.chaos.triggered ? `${c.chaos.band}/${c.chaos.magnitude}; anchor=${c.chaos.anchor}; vector=${c.chaos.vector}; dice=${JSON.stringify(c.chaos.dice)}` : `not triggered; dice=${JSON.stringify(c.chaos.dice)}`}`);
    reportLines.push(`- Proactivity: ${JSON.stringify(c.proactivity)}`);
    reportLines.push('');
}
reportLines.push('## Forced Counter');
reportLines.push(`- Proactivity: ${JSON.stringify(forcedPro)}`);
reportLines.push(`- Aggression: ${JSON.stringify(forcedAgg)}`);
reportLines.push('');
reportLines.push('## Name / Render / Style / Lorebook');
reportLines.push(`- Reserved names: ${JSON.stringify(names)}`);
reportLines.push(`- Payload includes render rules: ${payload.includes('AUTHORITATIVE RENDER RULES')}`);
reportLines.push(`- Payload includes style overlay: ${payload.includes('WRITING STYLE OVERLAY')}`);
reportLines.push(`- Payload includes grounded POV/render scaffolding: ${payload.includes('direct in-scene sensory evidence')}`);
reportLines.push(`- Parsed archive NPC: ${parsedArchive.name}; feeling=${parsedArchive.feeling || '(none)'}; archiveStatus=${parsedArchive.archiveStatus}`);
reportLines.push('');
reportLines.push('## Character Creator');
for (const c of creatorCases) {
    reportLines.push(`### ${c.id}. Character creator pass`);
    reportLines.push(`- Pool: ${JSON.stringify(c.rolls.pool)}; stats=${JSON.stringify(c.rolls.stats)}; hidden reroll=${c.rolls.rerollValue}`);
    reportLines.push(`- After reroll: ${JSON.stringify(c.reroll.stats)}; after swap: ${JSON.stringify(c.swap.stats)}`);
    reportLines.push(`- Sheet preview: ${c.sheetPreview.join(' / ')}`);
    reportLines.push('');
}

fs.writeFileSync(`${OUT_DIR}/RELEASE_STRESS_OUTPUT.json`, JSON.stringify({
    pass: true,
    generatedAt: new Date().toISOString(),
    cases: allCases.length,
    resolutionCases,
    chaosCases,
    forcedPro,
    forcedAgg,
    names,
    archive: parsedArchive,
    creatorCases,
}, null, 2));
fs.writeFileSync(`${OUT_DIR}/RELEASE_STRESS_REPORT.md`, reportLines.join('\n'));

console.log(JSON.stringify({
    pass: true,
    cases: allCases.length,
    resolution: resolutionCases.length,
    chaos: chaosCases.length,
    creator: creatorCases.length,
    report: `${OUT_DIR}/RELEASE_STRESS_REPORT.md`,
}, null, 2));
