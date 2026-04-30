import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_RENDER_RULES,
    DEFAULT_WRITING_STYLE,
    NAME_STYLE_PRESETS,
    buildFinalNarrationPayload,
    createTracker,
    inferFallbackExtraction,
    markRevealedNames,
    mergeExtractionWithFallback,
    reserveNameCandidates,
    resolveTurn,
} from './engine.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'FULL_TEST_REPORT.md');

function withDice(dice, fn) {
    const original = Math.random;
    const queue = [...dice];
    Math.random = () => {
        const die = queue.shift() ?? 10;
        return (Math.max(1, Math.min(20, die)) - 0.5) / 20;
    };
    try {
        const result = fn();
        result.remainingDice = queue;
        return result;
    } finally {
        Math.random = original;
    }
}

function trackerWith(...npcs) {
    const tracker = createTracker();
    tracker.user.stats = { PHY: 5, MND: 6, CHA: 5 };
    tracker.scene.location = 'test yard';
    tracker.scene.time = 'noon';
    tracker.scene.weather = 'clear';
    for (const spec of npcs) {
        const id = spec.name.toLowerCase();
        tracker.npcs[id] = {
            id,
            name: spec.name,
            present: spec.present ?? true,
            position: spec.position || '',
            condition: spec.condition || 'healthy',
            disposition: spec.disposition || { B: 2, F: 2, H: 2 },
            rapport: spec.rapport ?? 0,
            rapportEncounterLock: spec.rapportEncounterLock || 'N',
            intimacyGate: spec.intimacyGate || 'SKIP',
            coreStats: spec.stats || { PHY: 3, MND: 3, CHA: 3 },
            rank: spec.rank || 'Average',
            mainStat: spec.mainStat || 'Balanced',
            override: spec.override || 'NONE',
            knowsUser: spec.knowsUser || '',
        };
        if (tracker.npcs[id].present) tracker.presentNpcIds.push(id);
    }
    return tracker;
}

function baseExtraction(overrides = {}) {
    return {
        ooc: 'N',
        oocMode: 'IC',
        oocInstruction: '',
        goal: 'do a thing',
        goalKind: 'Normal',
        goalEvidence: 'explicit test input',
        decisiveAction: 'do a thing',
        decisiveActionEvidence: 'explicit test input',
        outcomeOnSuccess: '',
        outcomeOnFailure: '',
        actionTargets: [],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        npcInScene: [],
        hasStakes: 'N',
        stakesEvidence: '',
        actionCount: 1,
        userStat: 'MND',
        userStatEvidence: '',
        oppStat: 'ENV',
        oppStatEvidence: '',
        hostilePhysicalHarm: 'N',
        newEncounter: 'N',
        scene: { location: '', time: '', weather: '' },
        npcFacts: [],
        inventoryDeltas: [],
        ...overrides,
    };
}

function npcFact(name, extra = {}) {
    return {
        name,
        position: '',
        condition: '',
        knowsUser: '',
        explicitPreset: 'neutralDefault',
        rank: 'Average',
        mainStat: 'Balanced',
        override: 'NONE',
        ...extra,
    };
}

function summarize(caseNo, label, input, out, dice) {
    const p = out.packet;
    const npcs = out.npcHandoffs.map(n => `${n.NPC}:${n.FinalState}/${n.Target}/${n.IntimacyGate}`).join('; ') || '(none)';
    const chaos = out.chaosHandoff.CHAOS;
    const active = Object.entries(out.proactivityHandoff)
        .map(([name, a]) => `${name}:${a.Proactive}/${a.Intent}/${a.Impulse}/${a.ProactivityTier || ''}/${a.ProactivityDie || ''}/${a.Threshold || ''}`)
        .join('; ') || '(none)';
    const aggression = Object.entries(out.aggressionResults)
        .map(([name, a]) => `${name}:${a.ReactionOutcome}/margin ${a.Margin}/npc ${a.npcDie}/user ${a.userDie}/bonus ${a.CounterBonus}`)
        .join('; ') || '(none)';
    const rollText = out.audit.rolls.map(r => `${r.label}=${r.value}`).join(', ') || '(none)';
    return [
        `| ${caseNo} | ${label.replaceAll('|', '/')} | ${input.replaceAll('|', '/')} | ${p.GOAL} | ${p.DecisiveAction} | ${p.STAKES} | ${p.stats.USER} vs ${p.stats.OPP} | ${p.roll ? `${p.roll.atkDie}+ => ${p.roll.atkTot} / ${p.roll.defDie}+ => ${p.roll.defTot} / margin ${p.roll.margin}` : 'no resolution roll'} | ${p.OutcomeTier}/${p.Outcome}/landed ${p.LandedActions}/counter ${p.CounterPotential} | ${npcs} | ${chaos.triggered ? `${chaos.band}/${chaos.magnitude}/${chaos.anchor}/${chaos.vector}` : 'none'} | ${active} | ${aggression} | ${rollText} |`,
    ].join('\n');
}

function runCase(caseNo, label, input, tracker, extraction, dice, checks = () => {}) {
    const fallback = inferFallbackExtraction(input, '', tracker);
    const seededExtraction = {
        ...extraction,
        goalEvidence: extraction.goalEvidence === 'explicit test input' ? input : extraction.goalEvidence,
        decisiveActionEvidence: extraction.decisiveActionEvidence === 'explicit test input' ? input : extraction.decisiveActionEvidence,
    };
    const merged = mergeExtractionWithFallback(seededExtraction, fallback);
    const out = withDice(dice, () => resolveTurn(merged, tracker));
    checks(out);
    return summarize(caseNo, label, input, out, dice);
}

const report = [];
report.push('# RP Engine Full Test Report');
report.push('');
report.push(`Generated: ${new Date().toISOString()}`);
report.push('');
report.push('## Curated Engine Matrix');
report.push('');
report.push('| # | Test | Input | Goal | Decisive action | Stakes | Stats | Resolution dice | Outcome | Relationship | Chaos | Proactivity | Aggression | All rolls |');
report.push('|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|');

const cases = [
    {
        label: 'Harmless question has no resolution roll',
        input: 'I ask Seraphina for directions to the temple.',
        tracker: trackerWith({ name: 'Seraphina' }),
        ext: baseExtraction({ goal: 'ask Seraphina for directions', decisiveAction: 'ask Seraphina for directions', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'N', userStat: 'CHA', oppStat: 'ENV', npcFacts: [npcFact('Seraphina')] }),
        dice: [2, 10, 11, 12, 13, 4],
        check: out => assert.equal(out.packet.roll, undefined),
    },
    {
        label: 'Declaration of love has no roll',
        input: 'I tell Seraphina, "I love you."',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 3, F: 1, H: 2 } }),
        ext: baseExtraction({ goal: 'tell Seraphina I love her', decisiveAction: 'tell Seraphina I love her', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'N', userStat: 'CHA', oppStat: 'ENV', npcFacts: [npcFact('Seraphina')] }),
        dice: [3, 10, 10, 10, 10, 11],
        check: out => assert.equal(out.packet.Outcome, 'no_roll'),
    },
    {
        label: 'Friendly persuasion maps CHA vs CHA',
        input: 'I calmly persuade Seraphina to lend me her lantern.',
        tracker: trackerWith({ name: 'Seraphina', stats: { PHY: 3, MND: 4, CHA: 6 } }),
        ext: baseExtraction({ goal: 'persuade Seraphina to lend a lantern', decisiveAction: 'persuade Seraphina', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'CHA', npcFacts: [npcFact('Seraphina', { explicitStats: { PHY: 3, MND: 4, CHA: 6 } })] }),
        dice: [14, 8, 5, 7, 10, 11, 16],
        check: out => assert.equal(out.packet.stats.OPP, 'CHA'),
    },
    {
        label: 'Bluff maps CHA vs MND',
        input: 'I point aside and lie, "Look, the captain is calling you," while reaching for the bill.',
        tracker: trackerWith({ name: 'Seraphina', stats: { PHY: 3, MND: 6, CHA: 3 } }),
        ext: baseExtraction({ goal: 'distract Seraphina to take the bill', decisiveAction: 'bluff Seraphina with a false distraction', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina', { explicitStats: { PHY: 3, MND: 6, CHA: 3 } })] }),
        dice: [9, 12, 18, 12, 13, 14, 10],
        check: out => assert.equal(out.packet.stats.OPP, 'MND'),
    },
    {
        label: 'Intimidation maps CHA vs MND and raises Fear',
        input: 'I loom over Seraphina and threaten to expose her secret unless she moves.',
        tracker: trackerWith({ name: 'Seraphina', stats: { PHY: 3, MND: 5, CHA: 4 } }),
        ext: baseExtraction({ goal: 'intimidate Seraphina into moving', decisiveAction: 'threaten Seraphina', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina', { explicitStats: { PHY: 3, MND: 5, CHA: 4 } })] }),
        dice: [12, 8, 5, 15, 15, 16, 11],
        check: out => assert.match(out.npcHandoffs[0].Target, /Fear/),
    },
    {
        label: 'Sneak past guard uses living opposition',
        input: 'I crouch low and sneak past the guard at the gate.',
        tracker: trackerWith({ name: 'Gate Guard', stats: { PHY: 4, MND: 5, CHA: 2 } }),
        ext: baseExtraction({ goal: 'sneak past the guard', decisiveAction: 'sneak past the guard', actionTargets: [], oppTargetsNpc: ['Gate Guard'], npcInScene: ['Gate Guard'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'MND', npcFacts: [npcFact('Gate Guard', { explicitStats: { PHY: 4, MND: 5, CHA: 2 } })] }),
        dice: [16, 10, 4, 12, 12, 12, 10],
        check: out => assert.equal(out.packet.stats.OPP, 'MND'),
    },
    {
        label: 'Environmental jump uses PHY vs ENV',
        input: 'I sprint toward the edge and jump the chasm.',
        tracker: trackerWith(),
        ext: baseExtraction({ goal: 'jump the chasm', decisiveAction: 'jump the chasm', oppTargetsEnv: ['chasm'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'ENV' }),
        dice: [15, 8, 2, 10, 10, 10],
        check: out => assert.equal(out.packet.stats.OPP, 'ENV'),
    },
    {
        label: 'Trap disarm uses MND vs ENV',
        input: 'I study the wire and disarm the trap.',
        tracker: trackerWith(),
        ext: baseExtraction({ goal: 'disarm the trap', decisiveAction: 'disarm the trap mechanism', oppTargetsEnv: ['trap'], hasStakes: 'Y', userStat: 'MND', oppStat: 'ENV' }),
        dice: [10, 13, 17, 8, 9, 10],
        check: out => assert.equal(out.packet.stats.USER, 'MND'),
    },
    {
        label: 'One hostile attack',
        input: 'I slap Seraphina once.',
        tracker: trackerWith({ name: 'Seraphina' }),
        ext: baseExtraction({ goal: 'slap Seraphina', decisiveAction: 'slap Seraphina', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', actionCount: 1, userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Seraphina')] }),
        dice: [12, 9, 10, 2, 3, 4, 9],
        check: out => assert.equal(out.packet.actions.length, 1),
    },
    {
        label: 'Two hostile attacks',
        input: 'I slap Seraphina, then slap her again.',
        tracker: trackerWith({ name: 'Seraphina' }),
        ext: baseExtraction({ goal: 'strike Seraphina twice', decisiveAction: 'two slaps at Seraphina', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', actionCount: 2, userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Seraphina')] }),
        dice: [18, 7, 4, 4, 4, 4, 12],
        check: out => assert.equal(out.packet.actions.length, 2),
    },
    {
        label: 'Three described hostile attacks',
        input: 'I throw a sideways punch, pivot into a backhand slap, then knee Rook in the stomach.',
        tracker: trackerWith({ name: 'Rook', disposition: { B: 2, F: 2, H: 3 }, stats: { PHY: 3, MND: 3, CHA: 2 } }),
        ext: baseExtraction({ goal: 'injure Rook with a three-part attack', decisiveAction: 'punch, backhand slap, and knee Rook', actionTargets: ['Rook'], oppTargetsNpc: ['Rook'], npcInScene: ['Rook'], hasStakes: 'Y', actionCount: 3, userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Rook', { explicitStats: { PHY: 3, MND: 3, CHA: 2 } })] }),
        dice: [13, 13, 17, 17, 17, 17, 14],
        check: out => assert.equal(out.packet.actions.length, 3),
    },
    {
        label: 'Combat setup ignored',
        input: 'I draw my sword, step forward, and slash Rook.',
        tracker: trackerWith({ name: 'Rook' }),
        ext: baseExtraction({ goal: 'slash Rook', decisiveAction: 'slash Rook', actionTargets: ['Rook'], oppTargetsNpc: ['Rook'], npcInScene: ['Rook'], hasStakes: 'Y', actionCount: 1, userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Rook')] }),
        dice: [4, 18, 19, 10, 10, 10, 16],
        check: out => assert.equal(out.packet.CounterPotential, 'severe'),
    },
    {
        label: 'Physical intimacy denied below B4',
        input: 'I lean in and kiss Seraphina.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 2, F: 2, H: 2 } }),
        ext: baseExtraction({ goal: 'kiss Seraphina', goalKind: 'IntimacyAdvancePhysical', decisiveAction: 'kiss Seraphina', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina')] }),
        dice: [10, 10, 5, 5, 5, 5, 12],
        check: out => assert.equal(out.packet.IntimacyConsent, 'N'),
    },
    {
        label: 'Physical intimacy allowed at B4',
        input: 'I kiss Seraphina.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 4, F: 1, H: 1 }, intimacyGate: 'ALLOW' }),
        ext: baseExtraction({ goal: 'kiss Seraphina', goalKind: 'IntimacyAdvancePhysical', decisiveAction: 'kiss Seraphina', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'N', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina')] }),
        dice: [7, 7, 7, 7, 7, 15],
        check: out => assert.equal(out.packet.IntimacyConsent, 'Y'),
    },
    {
        label: 'B4 with F3 canonicalizes and denies',
        input: 'I kiss a frightened Seraphina.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 4, F: 3, H: 1 }, intimacyGate: 'ALLOW' }),
        ext: baseExtraction({ goal: 'kiss Seraphina', goalKind: 'IntimacyAdvancePhysical', decisiveAction: 'kiss Seraphina', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina')] }),
        dice: [9, 9, 9, 9, 9, 20],
        check: out => {
            assert.equal(out.packet.IntimacyConsent, 'N');
            assert.match(out.npcHandoffs[0].FinalState, /B2\/F3/);
        },
    },
    {
        label: 'Successful rescue benefits observer',
        input: 'I break the cage latch and free Mira.',
        tracker: trackerWith({ name: 'Mira' }),
        ext: baseExtraction({ goal: 'free Mira from the cage', decisiveAction: 'break the cage latch', actionTargets: [], oppTargetsEnv: ['cage latch'], benefitedObservers: ['Mira'], npcInScene: ['Mira'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'ENV', npcFacts: [npcFact('Mira')] }),
        dice: [19, 4, 10, 10, 10, 10, 12],
        check: out => assert.equal(out.npcHandoffs[0].Target, 'Bond'),
    },
    {
        label: 'Failed rescue does not benefit observer',
        input: 'I pull at Mira’s cage latch but fail to break it.',
        tracker: trackerWith({ name: 'Mira' }),
        ext: baseExtraction({ goal: 'free Mira from the cage', decisiveAction: 'break the cage latch', actionTargets: [], oppTargetsEnv: ['cage latch'], benefitedObservers: ['Mira'], npcInScene: ['Mira'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'ENV', npcFacts: [npcFact('Mira')] }),
        dice: [2, 18, 10, 10, 10, 10, 12],
        check: out => assert.equal(out.npcHandoffs[0].Target, 'No Change'),
    },
    {
        label: 'FearHostility canonicalizes Bond down',
        input: 'I shove Seraphina into the wall hard enough to hurt her.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 4, F: 2, H: 2 } }),
        ext: baseExtraction({ goal: 'hurt Seraphina by shoving her', decisiveAction: 'shove Seraphina into the wall', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Seraphina')] }),
        dice: [20, 3, 10, 10, 10, 10, 10],
        check: out => assert.match(out.npcHandoffs[0].FinalState, /B2\/F3\/H3/),
    },
    {
        label: 'F4 makes B1 and DENY',
        input: 'I corner a terrified Seraphina and demand she obey.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 3, F: 4, H: 2 } }),
        ext: baseExtraction({ goal: 'coerce Seraphina', decisiveAction: 'corner and demand obedience', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'Y', userStat: 'CHA', oppStat: 'MND', npcFacts: [npcFact('Seraphina')] }),
        dice: [10, 10, 10, 10, 10, 10, 10],
        check: out => assert.match(out.npcHandoffs[0].FinalState, /B1\/F4/),
    },
    {
        label: 'Severe failed attack forces counter candidate',
        input: 'I make a clumsy slash at Rook and overextend.',
        tracker: trackerWith({ name: 'Rook', disposition: { B: 2, F: 3, H: 2 }, stats: { PHY: 4, MND: 3, CHA: 2 } }),
        ext: baseExtraction({ goal: 'slash Rook', decisiveAction: 'clumsy slash at Rook', actionTargets: ['Rook'], oppTargetsNpc: ['Rook'], npcInScene: ['Rook'], hasStakes: 'Y', userStat: 'PHY', oppStat: 'PHY', hostilePhysicalHarm: 'Y', npcFacts: [npcFact('Rook', { explicitStats: { PHY: 4, MND: 3, CHA: 2 } })] }),
        dice: [1, 20, 10, 10, 10, 10, 10, 12, 4],
        check: out => {
            assert.equal(out.proactivityHandoff.Rook.Proactive, 'Y');
            assert.equal(out.proactivityHandoff.Rook.CounterBonus, 3);
            assert.ok(out.aggressionResults.Rook);
        },
    },
    {
        label: 'Chaos hostile extreme public event',
        input: 'In the market square, I examine the notice board.',
        tracker: trackerWith({ name: 'Vendor' }, { name: 'Guard' }),
        ext: baseExtraction({ goal: 'examine the notice board', decisiveAction: 'examine the notice board', npcInScene: ['Vendor', 'Guard'], hasStakes: 'N', userStat: 'MND', oppStat: 'ENV', npcFacts: [npcFact('Vendor'), npcFact('Guard')] }),
        dice: [17, 1, 20, 2, 3, 5, 5],
        check: out => {
            assert.equal(out.chaosHandoff.CHAOS.triggered, true);
            assert.equal(out.chaosHandoff.CHAOS.band, 'HOSTILE');
        },
    },
    {
        label: 'Bonded NPC can initiate intimacy/flirt',
        input: 'I sit beside Seraphina in quiet conversation.',
        tracker: trackerWith({ name: 'Seraphina', disposition: { B: 4, F: 1, H: 1 }, intimacyGate: 'ALLOW' }),
        ext: baseExtraction({ goal: 'sit with Seraphina', decisiveAction: 'sit in quiet conversation', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], hasStakes: 'N', userStat: 'CHA', oppStat: 'ENV', npcFacts: [npcFact('Seraphina')] }),
        dice: [1, 10, 10, 10, 10, 20],
        check: out => assert.equal(out.proactivityHandoff.Seraphina.Intent, 'INTIMACY_OR_FLIRT'),
    },
];

let caseNo = 1;
for (const testCase of cases) {
    report.push(runCase(caseNo++, testCase.label, testCase.input, testCase.tracker, testCase.ext, testCase.dice, testCase.check));
}

report.push('');
report.push('## Semantic Fallback Checks');
report.push('');
const semanticInputs = [
    ['Multi-action combat wording', 'I get up, take a step toward her, throw a sideways punch at the side of her face, pivot into a backhand slap, then knee her in the stomach.', 3, 'PHY'],
    ['Setup ignored before attack', 'I draw my blade, adjust my grip, step forward, and cut at Rook.', 1, 'PHY'],
    ['Weapon swing semantic attack', 'I swing my sword toward Rook’s ribs.', 1, 'PHY'],
    ['Bluff decisive action', 'I say "Look over there!" and point aside while reaching for the hundred-dollar bill.', 1, 'CHA'],
    ['Environmental physical task', 'I run and jump the chasm.', 1, 'PHY'],
    ['Harmless social action', 'I ask the guard for directions.', 1, 'CHA'],
    ['OOC stop', '((Pause and explain the rules.))', 1, 'MND'],
    ['Proxy narrator triple parens', '(((I try to distract her, and if she looks away I kiss her.)))', 1, 'CHA'],
];
report.push('| # | Check | Input | Fallback goal | Decisive action | Action count | User stat | Stakes | OOC mode |');
report.push('|---:|---|---|---|---|---:|---|---|---|');
for (const [label, input, expectedActions, expectedStat] of semanticInputs) {
    const fb = inferFallbackExtraction(input, 'Seraphina', trackerWith({ name: 'Seraphina' }));
    assert.equal(fb.actionCount, expectedActions);
    assert.equal(fb.userStat, expectedStat);
    report.push(`| ${caseNo++} | ${label} | ${input.replaceAll('|', '/')} | ${fb.goal} | ${fb.decisiveAction} | ${fb.actionCount} | ${fb.userStat} | ${fb.hasStakes} | ${fb.oocMode} |`);
}

report.push('');
report.push('## Generated Coverage Sweep');
report.push('');
report.push('These cases vary dice ranges across social, combat, environmental, chaos, proactivity, and aggression paths to catch boundary regressions.');
report.push('');
report.push('| # | Family | Input | Stakes | Stats | Outcome | Relationship | Chaos | Proactivity | Aggression | Rolls |');
report.push('|---:|---|---|---|---|---|---|---|---|---|---|');

const families = [
    ['social-friendly', 'I negotiate with Seraphina for a fair price.', { userStat: 'CHA', oppStat: 'CHA', hasStakes: 'Y', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], goal: 'negotiate with Seraphina', decisiveAction: 'negotiate a fair price' }],
    ['social-hostile', 'I lie to Seraphina to get past the door.', { userStat: 'CHA', oppStat: 'MND', hasStakes: 'Y', actionTargets: ['Seraphina'], oppTargetsNpc: ['Seraphina'], npcInScene: ['Seraphina'], goal: 'bluff Seraphina', decisiveAction: 'lie to Seraphina' }],
    ['combat', 'I strike Rook with a hard punch.', { userStat: 'PHY', oppStat: 'PHY', hasStakes: 'Y', hostilePhysicalHarm: 'Y', actionTargets: ['Rook'], oppTargetsNpc: ['Rook'], npcInScene: ['Rook'], goal: 'punch Rook', decisiveAction: 'punch Rook' }],
    ['environment-phy', 'I force the stuck door open.', { userStat: 'PHY', oppStat: 'ENV', hasStakes: 'Y', oppTargetsEnv: ['stuck door'], goal: 'force open the door', decisiveAction: 'force the stuck door open' }],
    ['environment-mnd', 'I search the ruined camp for tracks.', { userStat: 'MND', oppStat: 'ENV', hasStakes: 'Y', oppTargetsEnv: ['ruined camp'], goal: 'find tracks', decisiveAction: 'search for tracks' }],
    ['no-risk', 'I ask Seraphina what time it is.', { userStat: 'CHA', oppStat: 'ENV', hasStakes: 'N', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], goal: 'ask the time', decisiveAction: 'ask what time it is' }],
];
for (let i = 0; i < 120; i++) {
    const [family, input, extBase] = families[i % families.length];
    const targetName = family === 'combat' ? 'Rook' : 'Seraphina';
    const tracker = trackerWith({ name: targetName, disposition: i % 9 === 0 ? { B: 2, F: 3, H: 2 } : i % 11 === 0 ? { B: 1, F: 2, H: 4 } : { B: 2, F: 2, H: 2 }, stats: { PHY: 3 + (i % 4), MND: 3 + (i % 5), CHA: 2 + (i % 5) } });
    const dice = [
        (i * 3) % 20 + 1,
        (i * 7) % 20 + 1,
        (i * 11) % 20 + 1,
        (i * 13) % 20 + 1,
        (i * 17) % 20 + 1,
        (i * 5) % 20 + 1,
        (i * 9) % 20 + 1,
        (i * 4) % 20 + 1,
        (i * 6) % 20 + 1,
    ];
    const out = withDice(dice, () => resolveTurn(baseExtraction({ ...extBase, npcFacts: [npcFact(targetName)] }), tracker));
    const p = out.packet;
    const relationship = out.npcHandoffs.map(n => `${n.NPC}:${n.FinalState}/${n.Target}/${n.IntimacyGate}`).join('; ') || '(none)';
    const chaos = out.chaosHandoff.CHAOS.triggered ? `${out.chaosHandoff.CHAOS.band}/${out.chaosHandoff.CHAOS.magnitude}` : 'none';
    const proactive = Object.entries(out.proactivityHandoff).map(([n, a]) => `${n}:${a.Proactive}/${a.Intent}/${a.ProactivityDie || ''}`).join('; ') || '(none)';
    const aggro = Object.entries(out.aggressionResults).map(([n, a]) => `${n}:${a.ReactionOutcome}/${a.Margin}`).join('; ') || '(none)';
    report.push(`| ${caseNo++} | ${family} | ${input} | ${p.STAKES} | ${p.stats.USER} vs ${p.stats.OPP} | ${p.OutcomeTier}/${p.Outcome}/landed ${p.LandedActions}/counter ${p.CounterPotential} | ${relationship} | ${chaos} | ${proactive} | ${aggro} | ${out.audit.rolls.map(r => `${r.label}=${r.value}`).join(', ') || '(none)'} |`);
}

report.push('');
report.push('## Name Generation And Render Payload');
report.push('');
const nameTracker = createTracker();
for (const style of Object.keys(NAME_STYLE_PRESETS)) {
    const names = reserveNameCandidates(nameTracker, 4, { style, customStyle: 'desert empire names with Persian and Byzantine influence' });
    assert.equal(names.male.length, 4);
    assert.equal(names.female.length, 4);
    assert.equal(names.neutral.length, 4);
    assert.equal(names.location.length, 2);
    report.push(`- ${names.styleLabel}: male=${names.male.join(', ')}; female=${names.female.join(', ')}; neutral=${names.neutral.join(', ')}; location=${names.location.join(', ')}${names.customStyle ? `; custom=${names.customStyle}` : ''}`);
}
const reserved = reserveNameCandidates(nameTracker, 4, { style: 'tolkienic' });
const beforeReveal = [...reserved.female];
markRevealedNames(nameTracker, `The guard says, "Ask ${beforeReveal[0]}."`);
assert.equal(nameTracker.nameState.used.includes(beforeReveal[0]), true);
assert.equal(nameTracker.nameState.reserved.female.includes(beforeReveal[0]), false);
report.push(`- Reveal tracking: ${beforeReveal[0]} moved from reserved to used after appearing in generated text.`);

const payload = buildFinalNarrationPayload({
    packet: {
        GOAL: 'ask the guard about the temple',
        OOCMode: 'IC',
        OOCInstruction: '',
        DecisiveAction: 'ask the guard about the temple',
        OutcomeOnSuccess: '',
        OutcomeOnFailure: '',
        STAKES: 'N',
        IntimacyConsent: 'N',
        OutcomeTier: 'NONE',
        Outcome: 'no_roll',
        LandedActions: '(none)',
        CounterPotential: 'none',
        ActionTargets: [],
        OppTargets: { NPC: [], ENV: [] },
    },
    npcHandoffs: [],
    namePayload: { ...reserved, customStyle: '' },
    renderRules: DEFAULT_RENDER_RULES,
    writingStyle: Array.isArray(DEFAULT_WRITING_STYLE) ? DEFAULT_WRITING_STYLE.join('\n') : String(DEFAULT_WRITING_STYLE),
});
assert.match(payload, /AUTHORITATIVE NAME GENERATION/);
assert.match(payload, /OUTCOME MEANINGS are authoritative narration constraints/);
assert.match(payload, /dominant_impact: Critical success/);
assert.match(payload, /stalemate: Tie\. No clean progress for either side/);
assert.match(payload, /AUTHORITATIVE RENDER RULES/);
assert.match(payload, /epistemicRender\(response, smellGate, context\)/);
assert.match(payload, /jaws setting/);
assert.match(payload, /temple pulses/);
assert.match(payload, /small physical tells are allowed only when they produce or reveal concrete scene behavior/);
assert.match(payload, /Proxy exception/);
assert.match(payload, /Start at the consequence\/result\/reaction/);
assert.match(payload, /Radical literalism/);
assert.match(payload, /WRITING STYLE OVERLAY/);
assert.match(payload, /Do not attach a generated name to a generic guard/);
assert.match(payload, /MALE_NAME_CANDIDATES:/);
assert.match(payload, /FEMALE_NAME_CANDIDATES:/);
assert.match(payload, /NEUTRAL_NAME_CANDIDATES:/);
assert.match(payload, /NEXT_MALE_NAME:/);
assert.match(payload, /MUST copy the next matching candidate exactly/);
report.push('');
report.push('Render/name payload checks passed for: hidden name candidates, reveal discipline, epistemic render, strict behaviorism, radical literalism, agency separation, and writing style overlay.');
report.push('');
report.push(`Total checks recorded: ${caseNo - 1}`);

fs.writeFileSync(OUT, `${report.join('\n')}\n`, 'utf8');
console.log(`full tests passed: ${caseNo - 1} checks`);
console.log(`report written: ${OUT}`);
