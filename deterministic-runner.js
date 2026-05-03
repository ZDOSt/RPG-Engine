const NONE = '(none)';

export function buildTrackerSnapshot(context) {
    const source = context?.chatMetadata?.structuredPreflightTracker?.npcs || {};
    const snapshot = {};

    for (const [name, value] of Object.entries(source)) {
        snapshot[name] = normalizeTrackerEntry(value);
    }

    return snapshot;
}

export async function saveTrackerUpdate(context, trackerUpdate) {
    if (!context?.chatMetadata || !trackerUpdate?.npcs) return;

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {} };
    root.npcs = root.npcs || {};

    for (const [name, value] of Object.entries(trackerUpdate.npcs)) {
        root.npcs[name] = value;
    }

    context.chatMetadata.structuredPreflightTracker = root;

    if (typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

export function runDeterministicEngines(ledger, trackerSnapshot, context, type) {
    const audit = [];
    const dice = createDice();
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit);
    const aggression = runAggression(ledger, trackerSnapshot, relationships.trackerUpdate, proactivity.results, dice, audit);

    const trackerUpdate = { npcs: relationships.trackerUpdate };
    const finalNarrativeHandoff = {
        generationType: type || 'normal',
        resolutionPacket: resolution.packet,
        npcHandoffs: relationships.handoffs,
        chaosHandoff: chaos.handoff,
        nameGeneration: name,
        proactivityResults: proactivity.results,
        aggressionResults: aggression.results,
        sceneTrackerUpdate: trackerUpdate,
        resultLine: resolution.resultLine,
        narrationGuidance: buildNarrationGuidance(resolution.packet, relationships.handoffs, chaos.handoff, proactivity.results, aggression.results),
    };

    audit.push('SCENE_TRACKER_UPDATE=');
    audit.push(stableStringify(trackerUpdate));
    audit.push('RESULT_LINE=' + resolution.resultLine);

    return {
        auditLines: audit,
        finalNarrativeHandoff,
        trackerUpdate,
    };
}

function runResolution(ledger, trackerSnapshot, dice, audit, context) {
    const semantic = ledger.resolutionSemantic || {};
    const targets = normalizeTargets(semantic.targets);
    const intimacyAdvance = String(semantic.intimacyAdvance || 'none').toLowerCase();
    const goal = intimacyAdvance === 'physical'
        ? 'IntimacyAdvancePhysical'
        : intimacyAdvance === 'verbal'
            ? 'IntimacyAdvanceVerbal'
            : String(semantic.goal || 'Normal_Interaction');

    const rollPool = [dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20()];
    audit.push('STEP 1: SILENT SEMANTIC PASS COMPLETE');
    audit.push('SEMANTIC_LEDGER=');
    audit.push(stableStringify(ledger));
    audit.push('---');
    audit.push('STEP 2: EXECUTE ResolutionEngine(input) USING SEMANTIC_LEDGER');
    audit.push(`2.0 roll_pool=[r0=${rollPool[0]},r1=${rollPool[1]},r2=${rollPool[2]},r3=${rollPool[3]},r4=${rollPool[4]},r5=${rollPool[5]}]`);
    audit.push(`2.1 identifyGoal=${goal}`);
    audit.push(`2.2 identifyTargets=${formatTargets(targets)}`);

    const intimacyTarget = firstReal(targets.ActionTargets) || semantic.primaryOppTarget;
    const targetState = trackerSnapshot[intimacyTarget] || null;
    const intimacyConsent = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)
        && targetState
        && (targetState.currentDisposition?.B >= 4 || targetState.intimacyGate === 'ALLOW')
        ? 'Y'
        : 'N';
    audit.push(`2.3 checkIntimacyGate=${intimacyConsent}`);

    let hasStakes = bool(semantic.hasStakesCandidate) ? 'Y' : 'N';
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)) {
        hasStakes = intimacyConsent === 'N' ? 'Y' : 'N';
    }
    audit.push(`2.4 hasStakes=${hasStakes}`);

    const npcInScene = unique([
        ...targets.ActionTargets,
        ...targets.OppTargets.NPC,
        ...targets.BenefitedObservers,
        ...targets.HarmedObservers,
        ...ledger.relationshipSemantic.map(x => x.NPC),
    ].filter(isReal));
    audit.push(`2.5 NPCInScene=[${npcInScene.join(',') || NONE}]`);

    let actions = ['a1'];
    let outcome = {
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        Outcome: 'no_roll',
        CounterPotential: 'none',
    };
    let resultLine = 'No roll';

    if (hasStakes === 'N') {
        audit.push('2.6 hasStakes=N');
        audit.push('2.6a actions=[a1]');
        audit.push(`2.6b resolveOutcome=${compact(outcome)}`);
    } else {
        actions = normalizeActionMarkers(semantic.actionMarkers);
        const userStat = normalizeStat(semantic.userStat, 'PHY');
        const oppStat = normalizeOppStat(semantic.oppStat);
        const userCore = normalizeCore(ledger.userCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        let targetCore = null;
        const primaryOppTarget = isReal(semantic.primaryOppTarget) ? semantic.primaryOppTarget : firstReal(targets.OppTargets.NPC);
        const currentTargetCore = primaryOppTarget ? trackerSnapshot[primaryOppTarget]?.currentCoreStats : null;

        audit.push('2.7 hasStakes=Y');
        audit.push(`2.7a actionCount=[${actions.join(',')}]`);
        audit.push(`2.7b actions=[${actions.join(',')}]`);
        audit.push(`2.7c mapStats={USER:${userStat},OPP:${oppStat}}`);
        audit.push(`2.7d getUserCoreStats=${compact(userCore)}`);
        audit.push('2.7e targetCore=(none)');

        if (oppStat !== 'ENV') {
            audit.push('2.7f mapStats.OPP!=ENV');
            audit.push(`2.7g primaryOppTarget=${primaryOppTarget || NONE}`);
            if (currentTargetCore) {
                targetCore = normalizeCore(currentTargetCore, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${primaryOppTarget})=${compact(targetCore)}`);
                audit.push(`2.7n targetCore=${compact(targetCore)}`);
            } else {
                targetCore = normalizeCore(semantic.genStatsIfNeeded, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${primaryOppTarget || NONE})=missing`);
                audit.push('2.7i missing -> genStats');
                audit.push(`2.7j genStats.Rank=${semantic.genStatsIfNeeded?.Rank || 'none'}`);
                audit.push(`2.7k genStats.MainStat=${semantic.genStatsIfNeeded?.MainStat || 'none'}`);
                audit.push(`2.7l genStats=${compact(targetCore)}`);
                audit.push(`2.7m targetCore=${compact(targetCore)}`);
            }
        }

        const atkDie = rollPool[0];
        const defDie = rollPool[1];
        const atkTot = atkDie + statValue(userCore, userStat);
        const defTot = oppStat === 'ENV' ? defDie : defDie + statValue(targetCore, oppStat);
        const margin = atkTot - defTot;
        const hostilePhysical = userStat === 'PHY' && bool(semantic.hostilePhysicalIntent);

        if (hostilePhysical) {
            outcome = hostilePhysicalOutcome(margin, actions.length);
        } else {
            outcome = margin >= 1
                ? { OutcomeTier: 'Success', LandedActions: '(none)', Outcome: 'success', CounterPotential: 'none' }
                : { OutcomeTier: 'Failure', LandedActions: '(none)', Outcome: 'failure', CounterPotential: 'none' };
        }

        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, defDie:${defDie}, defTot:${defTot}, margin:${margin}, hostilePhysicalIntent:${hostilePhysical ? 'Y' : 'N'} -> ${compact(outcome)}`);
        resultLine = `1d20(${atkDie}) + ${userStat}(${statValue(userCore, userStat)}) = ${atkTot} vs 1d20(${defDie})${oppStat === 'ENV' ? '' : ` + ${oppStat}(${statValue(targetCore, oppStat)})`} = ${defTot} -> ${outcome.OutcomeTier}`;
    }

    const packet = {
        GOAL: goal,
        actions,
        IntimacyConsent: intimacyConsent,
        STAKES: hasStakes,
        LandedActions: outcome.LandedActions,
        OutcomeTier: outcome.OutcomeTier,
        Outcome: outcome.Outcome,
        CounterPotential: outcome.CounterPotential,
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCInScene: showNone(npcInScene),
    };

    audit.push(`2.8 HANDOFF=${compact(packet)}`);
    audit.push('---');

    return { packet, resultLine };
}

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit) {
    const semanticMap = new Map((ledger.relationshipSemantic || []).filter(x => x?.NPC).map(x => [x.NPC, x]));
    const npcList = toRealArray(resolutionPacket.NPCInScene);
    const handoffs = [];
    const trackerUpdate = {};

    audit.push('STEP 3: EXECUTE RelationshipEngine(npc, resolutionPacket) USING SEMANTIC_LEDGER');
    audit.push(`3.1 NPC_LIST=[${npcList.join(',') || NONE}]`);

    for (const npc of npcList) {
        const sem = semanticMap.get(npc) || { NPC: npc, relevant: false, initFlags: {}, stakeChangeByOutcome: {}, overrideFlags: {} };
        const relevant = bool(sem.relevant) ? 'Y' : 'N';
        audit.push(`3.2 ${npc}.relevant=${relevant}`);

        if (relevant === 'N') {
            const handoff = {
                NPC: npc,
                FinalState: 'UNINITIALIZED',
                Lock: 'None',
                Behavior: 'None',
                Target: 'No Change',
                NPC_STAKES: 'N',
                Override: 'NONE',
                Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
                OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
                NarrationBand: resolutionPacket.Outcome || 'standard',
                IntimacyGate: 'SKIP',
            };
            handoffs.push(handoff);
            audit.push(`3.2a NPC_HANDOFF=${compact(handoff)}`);
            continue;
        }

        const state = normalizeTrackerEntry(trackerSnapshot[npc] || {});
        const newEncounter = bool(sem.newEncounterExplicit) ? 'Y' : 'N';
        let rapportEncounterLock = newEncounter === 'Y' ? 'N' : state.rapportEncounterLock;
        let currentDisposition = state.currentDisposition;
        let currentRapport = state.currentRapport;

        audit.push(`3.3 getCurrentRelationalState=${compact(state)}`);
        audit.push(`3.3a newEncounterExplicit=${newEncounter}`);
        audit.push(`3.3b rapportEncounterLock=${rapportEncounterLock}`);

        if (!currentDisposition) {
            const init = initPreset(sem.initFlags || {});
            currentDisposition = init.disposition;
            audit.push(`3.3e initPreset.romanticOpen=${yn(sem.initFlags?.romanticOpen)}`);
            audit.push(`3.3f initPreset.userBadRep=${yn(sem.initFlags?.userBadRep)}`);
            audit.push(`3.3g initPreset.userGoodRep=${yn(sem.initFlags?.userGoodRep)}`);
            audit.push(`3.3h initPreset.userNonHuman=${yn(sem.initFlags?.userNonHuman)} fearImmunity=${yn(sem.initFlags?.fearImmunity)}`);
            audit.push(`3.3i initPreset=${init.label}`);
            audit.push(`3.3j currentDisposition=${formatDisposition(currentDisposition)}`);
        } else {
            audit.push(`3.3c currentDisposition=${formatDisposition(currentDisposition)}`);
        }

        audit.push(`3.3k currentRapport=${currentRapport}`);

        const isAllowed = resolutionPacket.IntimacyConsent;
        const outcomeKey = String(resolutionPacket.Outcome || 'no_roll');
        const stakeChange = sem.stakeChangeByOutcome?.[outcomeKey] || 'none';
        const auditInteraction = stakeChange === 'benefit' ? 'Y' : 'N';
        const target = routeDispositionTarget(npc, resolutionPacket, auditInteraction, isAllowed, sem);
        const rapport = updateRapport(currentRapport, target, rapportEncounterLock);
        currentRapport = rapport.currentRapport;
        rapportEncounterLock = rapport.rapportEncounterLock;

        audit.push(`3.4 isAllowed=${isAllowed}`);
        audit.push(`3.4a auditInteraction=stakeChangeByOutcome[${outcomeKey}]=${stakeChange} -> ${auditInteraction}`);
        audit.push(`3.4b NPC_STAKES=${auditInteraction}`);
        audit.push(`3.4c routeDispositionTarget=${target}`);
        audit.push(`3.4d updateRapport=${compact(rapport)}`);

        const deltas = deriveDirection(target, currentDisposition, currentRapport, auditInteraction);
        const updatedDisposition = updateDisposition(currentDisposition, deltas);
        currentDisposition = updatedDisposition;
        currentRapport = deltas.rapportReset === 'Y' ? 0 : currentRapport;

        audit.push(`3.5 deriveDirection=${compact(deltas)}`);
        audit.push(`3.5a updateDisposition=${formatDisposition(updatedDisposition)}`);
        audit.push(`3.5e save currentRapport=${currentRapport} to sceneTracker`);
        audit.push(`3.5f save rapportEncounterLock=${rapportEncounterLock} to sceneTracker`);

        const classified = classifyDisposition(currentDisposition);
        const threshold = checkThreshold(currentDisposition, sem.overrideFlags || {});
        const intimacyGate = threshold.LockActive === 'Y'
            ? 'DENY'
            : isAllowed === 'Y'
                ? 'ALLOW'
                : currentDisposition.B >= 4
                    ? 'ALLOW'
                    : threshold.OverrideActive === 'Y'
                        ? 'ALLOW'
                        : 'SKIP';

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6b IntimacyGate=${intimacyGate}`);

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
            Lock: classified.lock,
            Behavior: classified.behavior,
            Target: target,
            NPC_STAKES: auditInteraction,
            Override: threshold.Override,
            Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
            OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
            NarrationBand: resolutionPacket.Outcome || 'standard',
            IntimacyGate: intimacyGate,
        };
        handoffs.push(handoff);

        const coreStats = state.currentCoreStats || normalizeCore(sem.coreStatsIfNeeded, { PHY: 1, MND: 1, CHA: 1 });
        trackerUpdate[npc] = {
            currentDisposition,
            currentRapport,
            rapportEncounterLock,
            intimacyGate,
            currentCoreStats: coreStats,
        };

        audit.push(`3.7 NPC_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoffs, trackerUpdate };
}

function runChaos(ledger, handoffs, resolutionPacket, dice, audit) {
    const diceList = {
        A: dice.d20(),
        O: dice.d20(),
        I: dice.d20(),
        anchorIdx: dice.d20(),
        vectorIdx: dice.d20(),
    };
    const sceneSummary = ledger.chaosSemantic?.sceneSummary || '';
    const ctx = getChaosContext(handoffs, sceneSummary);

    audit.push('STEP 4: EXECUTE CHAOS_INTERRUPT');
    audit.push(`4.1a step_context={GOAL:${resolutionPacket.GOAL},ActionTargets:${compact(resolutionPacket.ActionTargets)}}`);
    audit.push(`4.1b step_handoffs=${compact(handoffs)}`);
    audit.push(`4.1c sceneSummary=${sceneSummary}`);
    audit.push(`4.1d diceList=${compact(diceList)}`);
    audit.push(`4.2 getCtx=${ctx}`);

    let handoff;
    if (diceList.A < 17) {
        handoff = { CHAOS: { triggered: false, band: 'None', magnitude: 'None', anchor: 'None', vector: 'None', personVector: false, fullText: null } };
        audit.push(`4.2b A=${diceList.A}<17 -> CHAOS_HANDOFF=${compact(handoff)}`);
    } else {
        const band = classifyBand(diceList.O);
        const magnitude = classifyMagnitude(diceList.O);
        const anchor = pickAnchor(diceList.anchorIdx);
        const vector = pickVector(ctx, diceList.I, diceList.vectorIdx);
        const personVector = vector === 'NPC' || vector === 'AUTHORITY';
        handoff = { CHAOS: { triggered: true, band, magnitude, anchor, vector, personVector, fullText: null } };
        audit.push(`4.3 classifyBand=${band}`);
        audit.push(`4.3c classifyMagnitude=${magnitude}`);
        audit.push(`4.3e pickAnchor=${anchor}`);
        audit.push(`4.3g pickVector=${vector}`);
        audit.push(`4.3h personVector=${personVector ? 'Y' : 'N'}`);
        audit.push(`4.3i CHAOS_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoff };
}

function runNameGeneration(ledger, audit) {
    const sem = ledger.nameSemantic || {};
    const result = {
        nameRequired: yn(sem.nameRequired),
        explicitNameKnown: yn(sem.explicitNameKnown),
        isLocation: yn(sem.isLocation),
        seed: sem.seed || NONE,
        normalizeSeed: sem.normalizeSeed || NONE,
        detectMode: sem.detectMode || 'none',
        generatedName: bool(sem.nameRequired) ? (sem.generatedName || NONE) : NONE,
    };
    audit.push('STEP 5: EXECUTE NameGenerationEngine');
    audit.push(`5.1 nameRequired=${result.nameRequired}`);
    audit.push(`5.1h generatedName=${result.generatedName}`);
    audit.push('---');
    return result;
}

function runProactivity(ledger, handoffs, resolutionPacket, chaosHandoff, dice, audit) {
    const kind = classifyAction(resolutionPacket);
    const chaosBand = chaosHandoff.CHAOS?.triggered ? chaosHandoff.CHAOS.band : 'None';
    const counterPotential = resolutionPacket.CounterPotential || 'none';
    const cap = clamp(Number(ledger.proactivitySemantic?.cap || 1), 1, 3);
    const candidates = [];
    const results = {};

    audit.push('STEP 6: EXECUTE NPCProactivityEngine');
    audit.push(`6.2 classifyAction=${kind}`);
    audit.push(`6.2a chaosBand=${chaosBand}`);
    audit.push(`6.2b counterPotential=${counterPotential}`);
    audit.push(`6.2c cap=${cap}`);

    for (const handoff of handoffs) {
        const fin = parseFinalState(handoff.FinalState);
        const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
        const impulse = deriveImpulse(kind, lock, fin, handoff.IntimacyGate);
        const tier = classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin);

        results[handoff.NPC] = {
            Proactive: 'N',
            Intent: 'NONE',
            Impulse: impulse,
            TargetsUser: 'N',
            ProactivityTier: tier,
        };

        audit.push(`6.3 FOR ${handoff.NPC}`);
        audit.push(`6.4 parseFinalState=${compact(fin)}`);
        audit.push(`6.4b lock=${lock}`);
        audit.push(`6.4f deriveImpulse=${impulse}`);
        audit.push(`6.4g classifyProactivityTier=${tier}`);

        if (tier === 'FORCED') {
            candidates.push({ NPC: handoff.NPC, die: 20, tier, intent: 'ESCALATE_VIOLENCE', impulse: 'ANGER', TargetsUser: 'Y', Threshold: 'AUTO', passes: 'Y' });
            audit.push('6.4i FORCED candidate');
            continue;
        }

        const die = dice.d20();
        const threshold = thresholdFromTier(tier);
        const passes = die >= threshold ? 'Y' : 'N';
        audit.push(`6.5 proactivityDie=${die}`);
        audit.push(`6.5a thresholdFromTier=${threshold}`);
        audit.push(`6.5b passes=${passes}`);

        results[handoff.NPC].ProactivityDie = die;
        results[handoff.NPC].Threshold = threshold;

        if (passes === 'Y') {
            const intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override);
            const targetsUser = targetsUserFromIntent(intent);
            candidates.push({ NPC: handoff.NPC, die, tier, intent, impulse, TargetsUser: targetsUser, Threshold: threshold, passes });
            audit.push(`6.5c selectIntent=${intent}`);
            audit.push(`6.5e targetsUserFromIntent=${targetsUser}`);
        }
    }

    candidates.sort((a, b) => b.die - a.die);
    const selected = candidates.slice(0, cap);
    audit.push(`6.6 sortCandidates=${compact(candidates)}`);

    for (const candidate of selected) {
        results[candidate.NPC] = {
            Proactive: 'Y',
            Intent: candidate.intent,
            Impulse: candidate.impulse,
            TargetsUser: candidate.TargetsUser,
            ProactivityTier: candidate.tier,
            ProactivityDie: candidate.die,
            Threshold: candidate.Threshold,
        };
    }

    audit.push(`6.8 FINAL_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, dice, audit) {
    const userCore = normalizeCore(ledger.userCoreStats, { PHY: 1, MND: 1, CHA: 1 });
    const aggressive = Object.entries(proactivityResults).filter(([, result]) =>
        result.Proactive === 'Y'
        && result.TargetsUser === 'Y'
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL'].includes(result.Intent));
    const results = {};

    audit.push('STEP 7: EXECUTE NPCAggressionResolution');
    audit.push(`7.2 AggressionPresent=${aggressive.length ? 'Y' : 'N'}`);

    if (!aggressive.length) {
        audit.push('7.2a AGGRESSION_RESULTS={}');
        audit.push('---');
        return { results };
    }

    audit.push(`7.3 getUserCoreStats=${compact(userCore)}`);

    for (const [npc] of aggressive) {
        const npcCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcDie = dice.d20();
        const userDie = dice.d20();
        const npcTotal = npcDie + npcCore.PHY;
        const userTotal = userDie + userCore.PHY;
        const margin = npcTotal - userTotal;
        const ReactionOutcome = margin >= 5 ? 'npc_overpowers' : margin >= 1 ? 'npc_succeeds' : margin >= -3 ? 'user_resists' : 'user_dominates';
        results[npc] = { ReactionOutcome, Margin: margin };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${npcCore.PHY}=${npcTotal}`);
        audit.push(`7.5f userTotal=${userDie}+${userCore.PHY}=${userTotal}`);
        audit.push(`7.6 AGGRESSION_RESULT=${compact(results[npc])}`);
    }

    audit.push(`7.7 AGGRESSION_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function createDice() {
    return {
        d20() {
            return Math.floor(Math.random() * 20) + 1;
        },
    };
}

function hostilePhysicalOutcome(margin, actionLength) {
    let outcome;
    if (margin >= 8) outcome = { OutcomeTier: 'Critical_Success', LandedActions: 3, Outcome: 'dominant_impact', CounterPotential: 'none' };
    else if (margin >= 5) outcome = { OutcomeTier: 'Moderate_Success', LandedActions: 2, Outcome: 'solid_impact', CounterPotential: 'none' };
    else if (margin >= 1) outcome = { OutcomeTier: 'Minor_Success', LandedActions: 1, Outcome: 'light_impact', CounterPotential: 'none' };
    else if (margin >= -3) outcome = { OutcomeTier: 'Minor_Failure', LandedActions: 0, Outcome: 'checked', CounterPotential: 'light' };
    else if (margin >= -7) outcome = { OutcomeTier: 'Moderate_Failure', LandedActions: 0, Outcome: 'deflected', CounterPotential: 'medium' };
    else outcome = { OutcomeTier: 'Critical_Failure', LandedActions: 0, Outcome: 'avoided', CounterPotential: 'severe' };
    outcome.LandedActions = Math.min(outcome.LandedActions, actionLength);
    return outcome;
}

function initPreset(flags) {
    if (bool(flags.romanticOpen)) return { label: 'romanticOpen', disposition: { B: 4, F: 1, H: 1 } };
    if (bool(flags.userBadRep)) return { label: 'userBadRep', disposition: { B: 1, F: 2, H: 3 } };
    if (bool(flags.userGoodRep)) return { label: 'userGoodRep', disposition: { B: 3, F: 1, H: 2 } };
    if (bool(flags.userNonHuman) && !bool(flags.fearImmunity)) return { label: 'userNonHuman', disposition: { B: 1, F: 3, H: 2 } };
    return { label: 'neutralDefault', disposition: { B: 2, F: 2, H: 2 } };
}

function routeDispositionTarget(npc, packet, auditInteraction, isAllowed, sem) {
    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isBenefited = includesName(packet.BenefitedObservers, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    const landed = landedBool(packet.LandedActions);
    const g = packet.GOAL;
    const out = packet.Outcome;

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!isDirect && !isOpp && isBenefited) return auditInteraction === 'Y' ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g)) {
        if (isAllowed === 'Y') return 'Bond';
        if (g === 'IntimacyAdvancePhysical') return 'FearHostility';
        return 'Hostility';
    }
    if (bool(sem.explicitIntimidationOrCoercion)) return 'Fear';
    if (landed && (isDirect || isOpp || isHarmed)) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (auditInteraction === 'Y') return 'Bond';
    return 'No Change';
}

function updateRapport(currentRapport, target, rapportEncounterLock) {
    if (rapportEncounterLock === 'Y') return { currentRapport, rapportEncounterLock: 'Y' };
    if (['Bond', 'No Change'].includes(target)) return { currentRapport: Math.min(5, currentRapport + 1), rapportEncounterLock: 'Y' };
    if (['Hostility', 'Fear', 'FearHostility'].includes(target)) return { currentRapport: Math.max(0, currentRapport - 1), rapportEncounterLock: 'Y' };
    return { currentRapport, rapportEncounterLock };
}

function deriveDirection(target, currentDisposition, currentRapport, auditInteraction) {
    if (target === 'No Change') return { b: 0, f: 0, h: 0 };
    if (target === 'Hostility') return { b: -1, f: 0, h: 1 };
    if (target === 'Fear') return { b: -1, f: 1, h: 0 };
    if (target === 'FearHostility') return { b: -1, f: 1, h: 1 };
    if (currentDisposition.F === 4 || currentDisposition.H === 4) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return { b: 0, f: currentDisposition.F === 4 ? -1 : 0, h: currentDisposition.H === 4 ? -1 : 0, rapportReset: 'Y' };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (currentDisposition.F === 3 || currentDisposition.H === 3) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return { b: 0, f: currentDisposition.F === 3 ? -1 : 0, h: currentDisposition.H === 3 ? -1 : 0 };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (target === 'Bond') {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 3) return currentRapport >= 5 && auditInteraction === 'Y' ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }
    return { b: 0, f: 0, h: 0 };
}

function updateDisposition(disposition, deltas) {
    const next = {
        B: clamp(disposition.B + (deltas.b || 0), 1, 4),
        F: clamp(disposition.F + (deltas.f || 0), 1, 4),
        H: clamp(disposition.H + (deltas.h || 0), 1, 4),
    };
    if (next.F >= 3 || next.H >= 3) next.B = 1;
    return next;
}

function classifyDisposition(disposition) {
    const lock = disposition.F === 4 ? 'TERROR' : disposition.H === 4 ? 'HATRED' : (disposition.F === 3 || disposition.H === 3) ? 'FREEZE' : 'None';
    const behavior = lock !== 'None' ? lock : disposition.B === 4 ? 'CLOSE' : disposition.B === 3 ? 'FRIENDLY' : disposition.B === 2 ? 'NEUTRAL' : 'BROKEN';
    return { lock, behavior };
}

function checkThreshold(disposition, flags) {
    const LockActive = disposition.F >= 3 || disposition.H >= 3 ? 'Y' : 'N';
    let Override = 'NONE';
    if (disposition.B < 4) {
        if (bool(flags.Exploitation)) Override = 'Exploitation';
        else if (bool(flags.Hedonist)) Override = 'Hedonist';
        else if (bool(flags.Transactional)) Override = 'Transactional';
        else if (bool(flags.Established)) Override = 'Established';
    }
    return { LockActive, OverrideActive: Override !== 'NONE' ? 'Y' : 'N', Override };
}

function getChaosContext(handoffs, sceneSummary) {
    if (handoffs.length >= 2) return 'PUBLIC';
    if (/\b(public|crowd|open|market|tavern|street|square)\b/i.test(sceneSummary)) return 'PUBLIC';
    return 'ISOLATED';
}

function classifyBand(o) {
    if (o <= 5) return 'HOSTILE';
    if (o <= 14) return 'COMPLICATION';
    return 'BENEFICIAL';
}

function classifyMagnitude(o) {
    if (o === 1 || o === 20) return 'EXTREME';
    if (o <= 2 || o >= 19) return 'MAJOR';
    if (o <= 4 || o >= 17) return 'MODERATE';
    return 'MINOR';
}

function pickAnchor(index) {
    return ['GOAL', 'ENVIRONMENT', 'KNOWN_NPC', 'RESOURCE', 'CLUE'][index % 5];
}

function pickVector(ctx, i, index) {
    const values = ctx === 'PUBLIC'
        ? ['NPC', 'CROWD', 'AUTHORITY', 'ENVIRONMENT', 'SYSTEM']
        : i >= 17
            ? ['ENVIRONMENT', 'SYSTEM', 'ENTITY']
            : ['ENVIRONMENT', 'SYSTEM'];
    return values[index % values.length];
}

function classifyAction(packet) {
    if (packet.GOAL === 'IntimacyAdvancePhysical') return 'Intimacy_Physical';
    if (packet.GOAL === 'IntimacyAdvanceVerbal') return 'Intimacy_Verbal';
    if (landedBool(packet.LandedActions)) return 'Combat';
    if (toRealArray(packet.ActionTargets).length >= 1 && packet.LandedActions === '(none)') return 'Social';
    if (toRealArray(packet.OppTargets?.ENV).length >= 1) return 'Skill';
    return 'Normal_Interaction';
}

function deriveImpulse(kind, lock, fin, intimacyGate) {
    if (lock === 'HATRED') return 'ANGER';
    if (lock === 'TERROR') return 'FEAR';
    if (['Combat', 'Social'].includes(kind) && fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (kind === 'Social' && fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    if (['Intimacy_Physical', 'Intimacy_Verbal'].includes(kind) && intimacyGate === 'DENY') return 'ANGER';
    if (['Normal_Interaction', 'Skill'].includes(kind) && fin.B >= fin.H && fin.B >= fin.F) return 'BOND';
    if (fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    return 'BOND';
}

function classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin) {
    const NPC_STAKES = handoff.NPC_STAKES || 'N';
    const Target = handoff.Target || 'No Change';
    const Landed = handoff.Landed || 'N';
    if (['light', 'medium', 'severe'].includes(counterPotential) && ['HATRED', 'FREEZE'].includes(lock)) return 'FORCED';
    if (NPC_STAKES === 'N' && Target === 'No Change' && chaosBand === 'None') {
        if (fin.B >= 3 || fin.H >= 3) return 'MEDIUM';
        return 'DORMANT';
    }
    if (lock !== 'None' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (NPC_STAKES === 'Y' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (lock !== 'None' && chaosBand !== 'None') return 'HIGH';
    if (lock !== 'None') return 'MEDIUM';
    if (NPC_STAKES === 'Y') return 'MEDIUM';
    if (Target !== 'No Change' || Landed === 'Y') return 'MEDIUM';
    if (chaosBand !== 'None') return 'LOW';
    return 'DORMANT';
}

function thresholdFromTier(tier) {
    if (tier === 'HIGH') return 8;
    if (tier === 'MEDIUM') return 10;
    if (tier === 'LOW') return 13;
    return 16;
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
    if ((intimacyGate === 'ALLOW' || override !== 'NONE') && fin.B >= 3) return 'INTIMACY_OR_FLIRT';
    if (['Skill', 'Social'].includes(kind)) return 'SUPPORT_ACT';
    return 'PLAN_OR_BANTER';
}

function targetsUserFromIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent) ? 'Y' : 'N';
}

function buildNarrationGuidance(resolution, handoffs, chaos, proactivity, aggression) {
    return {
        resolution: `${resolution.OutcomeTier}/${resolution.Outcome}`,
        relationshipStates: handoffs.map(h => `${h.NPC}:${h.FinalState}:${h.Behavior}:${h.IntimacyGate}`),
        chaos: chaos.CHAOS,
        proactivity,
        aggression,
        instruction: 'Narrate according to these computed outcomes. Do not expose mechanics unless the user asks OOC.',
    };
}

function normalizeTrackerEntry(value) {
    return {
        currentDisposition: normalizeDisposition(value?.currentDisposition),
        currentRapport: clamp(Number(value?.currentRapport ?? 0), 0, 5),
        rapportEncounterLock: value?.rapportEncounterLock === 'Y' ? 'Y' : 'N',
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(value?.intimacyGate) ? value.intimacyGate : 'SKIP',
        currentCoreStats: value?.currentCoreStats ? normalizeCore(value.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 }) : null,
    };
}

function normalizeDisposition(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const match = value.match(/B(\d+)\/F(\d+)\/H(\d+)/i);
        if (match) return { B: Number(match[1]), F: Number(match[2]), H: Number(match[3]) };
    }
    if (typeof value === 'object' && value.B && value.F && value.H) {
        return { B: clamp(Number(value.B), 1, 4), F: clamp(Number(value.F), 1, 4), H: clamp(Number(value.H), 1, 4) };
    }
    return null;
}

function normalizeTargets(value) {
    return {
        ActionTargets: toRealArray(value?.ActionTargets),
        OppTargets: {
            NPC: toRealArray(value?.OppTargets?.NPC),
            ENV: toRealArray(value?.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(value?.BenefitedObservers),
        HarmedObservers: toRealArray(value?.HarmedObservers),
    };
}

function normalizeActionMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return ['a1'];
    return markers.slice(0, 3).map((_, index) => `a${index + 1}`);
}

function normalizeCore(value, fallback) {
    return {
        PHY: clamp(Number(value?.PHY ?? fallback.PHY), 1, 10),
        MND: clamp(Number(value?.MND ?? fallback.MND), 1, 10),
        CHA: clamp(Number(value?.CHA ?? fallback.CHA), 1, 10),
    };
}

function statValue(core, stat) {
    return normalizeCore(core, { PHY: 1, MND: 1, CHA: 1 })[stat] || 1;
}

function normalizeStat(value, fallback) {
    return ['PHY', 'MND', 'CHA'].includes(value) ? value : fallback;
}

function normalizeOppStat(value) {
    return ['PHY', 'MND', 'CHA', 'ENV'].includes(value) ? value : 'ENV';
}

function parseFinalState(value) {
    return normalizeDisposition(value) || { B: 2, F: 2, H: 2 };
}

function deriveLock(fin) {
    if (fin.F === 4) return 'TERROR';
    if (fin.H === 4) return 'HATRED';
    if (fin.F === 3 || fin.H === 3) return 'FREEZE';
    return 'None';
}

function landedBool(value) {
    return Number(value) > 0;
}

function includesName(list, name) {
    return toRealArray(list).some(x => String(x).toLowerCase() === String(name).toLowerCase());
}

function toRealArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(x => String(x).trim()).filter(isReal);
}

function showNone(value) {
    const array = Array.isArray(value) ? value.filter(isReal) : [];
    return array.length ? array : [NONE];
}

function firstReal(value) {
    return toRealArray(value)[0] || null;
}

function isReal(value) {
    const text = String(value ?? '').trim();
    return text && text !== NONE && text.toLowerCase() !== 'none' && text.toLowerCase() !== 'null';
}

function bool(value) {
    return value === true || value === 'Y' || value === 'y' || value === 'true';
}

function yn(value) {
    return bool(value) ? 'Y' : 'N';
}

function unique(values) {
    return [...new Set(values)];
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function formatTargets(targets) {
    return compact({
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
    });
}

function formatDisposition(disposition) {
    return `B${disposition.B}/F${disposition.F}/H${disposition.H}`;
}

function compact(value) {
    return JSON.stringify(value);
}

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}
