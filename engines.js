export const ENGINE_PROMPT_TEXT = String.raw`function ResolutionEngine(input) {
  const DEF = Object.freeze({
    UNIVERSAL:
'EXPLICIT-ONLY. MUST be stated in Character Card / Lore / Scene text / tracker. NO invention. Uncertain = N or default. FIRST-YES-WINS = first matching explicit rule becomes final. No reconsideration. NEVER invent stats, targets, actions, obstacles, or outcomes. MAX 3 ACTIONS. TIE = DEFENDER / OPPOSITION WINS. ROLLS = 1d20 + relevant stat vs opposing 1d20 + relevant stat, or vs plain Environment 1d20.',
    STATS:
'PHY = challenges that require physical effort, strength, agility, speed, coordination, endurance, stealth movement, combat skill, or bodily execution under risk. MND = challenges that require thought, memory, perception, focus, reasoning, knowledge, awareness, will, or deliberate mental/supernatural exertion. CHA = social challenges that require persuasion, deception, intimidation, negotiation, emotional influence, personal presence, or interpersonal skill. Core stat scale is 1 to 10.',
    STAKES:
'Stakes are meaningful possible consequences tied to success or failure. Stakes include physical risk, harm, danger, detection, material gain or loss, social status shift, loss of autonomy, meaningful obstacle resolution or failure, or explicit goal advancement or failure for {{user}} or a specific living entity. If success or failure would not materially change the outcome, no roll is needed.'
  });

  identifyGoal(input):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return a short, plain description of the final goal/intent of {{user}}'s actions in the last input
    rule: if the goal is an explicit direct intimate advance toward a specific NPC, return IntimacyAdvancePhysical for physical contact or IntimacyAdvanceVerbal for verbal proposition
    rule: flirting, compliments, teasing, affectionate tone, or non-explicit romantic/social behavior do NOT count as intimacy advances

  identifyTargets(input, goal, context):
    policy: LOCKED, EXPLICIT-ONLY
    ActionTargets = LIVING entities targeted by {{user}}'s actions
    OppTargets.NPC = LIVING entities who are actively or passively opposing, contesting, or resisting {{user}}'s actions
    OppTargets.ENV = NON-LIVING environmental or terrain feature, hazard, object, or other obstacle directly obstructing {{user}}'s actions
    BenefitedObservers = LIVING entities present in scene not in ActionTargets or OppTargets.NPC whose stakes improve as a result of {{user}}'s actions, as per DEF.STAKES
    HarmedObservers = LIVING entities present in scene not in ActionTargets or OppTargets.NPC whose stakes worsen as a result of {{user}}'s actions, as per DEF.STAKES
    rule: if any target list is not present, return [(none)]
    return {ActionTargets, OppTargets, BenefitedObservers, HarmedObservers}

  checkIntimacyGate(goal, targets, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: if goal=IntimacyAdvancePhysical or goal=IntimacyAdvanceVerbal, read exact target NPC entry in latest sceneTracker
    rule: return Y if B>=4 under currentDisposition OR IntimacyGate=ALLOW
    else -> N

  hasStakes(input, goal, targets, IntimacyConsent, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: if goal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal] and IntimacyConsent=N, return Y
    rule: if goal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal], return N
    rule: return Y if success or failure of the explicit means used in input to pursue the goal could affect {{user}} or NPC's stakes, as per DEF.STAKES
    else -> N

  actionCount(input, goal):
    policy: LOCKED, EXPLICIT-ONLY, MAX 3 ACTIONS
    rule: only applies to explicit hostile/combat attack sequences
    rule: do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as additional actions
    rule: each individual attack within a sequence counts as one action
    rule: return one action marker per attack: [a1], [a1,a2], or [a1,a2,a3]

  mapStats(input, goal, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: if the final goal relies heavily on a specific enabling action (e.g., a physical feat to intimidate, or clearing an obstacle to dodge), determine USER stat based strictly on that enabling action.
    rule: determine {{user}} stat by applying DEF.STATS to the explicit action-attempt that determines whether {{user}}'s goal succeeds or fails.
    rule: use final goal only if no distinct explicit means are present
    rule: if OppTargets.NPC contains an opposing entity, determine opposing stat by applying DEF.STATS to that entity's resistance to {{user}}'s explicit means or goal
    rule: if OppTargets.NPC=[(none)] and OppTargets.ENV contains an obstacle, OPP=ENV
    return {USER, OPP}

  getUserCoreStats():
    policy: LOCKED, EXPLICIT-ONLY
    rule: read {{user}}'s character sheet/persona
    return {PHY, MND, CHA}

  getCurrentCoreStats(target):
    policy: LOCKED, EXPLICIT-ONLY
    rule: read most recent sceneTracker under exact target NPC entry, currentCoreStats
    if found -> return {PHY, MND, CHA}
    else -> missing

  genStats(target, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    output: {Rank, MainStat, PHY, MND, CHA}
    rule: use only if target currentCoreStats missing
    rule: determine Rank from explicit portrayal only by comparing the target to narrative baselines
    rankGuide:
      Weak = clearly below an ordinary healthy adult; examples include a child, frail elder, badly injured person, small harmless animal, or sickly minor creature
      Average = roughly comparable to an ordinary healthy adult or ordinary capable creature; examples include a civilian adult, common laborer, goblin, or other ordinary non-elite being
      Trained = at least comparable to a trained and capable professional or dangerous lesser threat; examples include a city guard, soldier, adventurer, orc, ogre, or competent lesser monster
      Elite = clearly beyond ordinary trained professionals or lesser threats; examples include a veteran knight, master duelist, powerful mage, apex predator, elder beast, or major supernatural threat
      Boss = overwhelmingly beyond elite; examples include a legendary hero, warlord, ancient guardian, archmage, dragon, titan, ancient horror, or mythic apex entity
    mainStat:
      rule: identify the target's clearest proficiency from explicit portrayal in scene/context/backstory, referring to DEF.STATS, and assign a primary stat
      rule: MainStat must be PHY, MND, CHA, or Balanced
    assignStats:
      rule: assign stats only within the allowed range for the chosen Rank
      rule: do not assign any stat outside the allowed range for the chosen Rank
      rule: if MainStat is PHY, MND, or CHA, that stat must be highest
      rule: if MainStat=Balanced, no single stat should be clearly dominant
      ranges:
        Weak = 1
        Average = 1 to 3
        Trained = 2 to 4
        Elite = 3 to 6
        Boss = 6 to 10
    rule: save currentCoreStats to sceneTracker and never change unless explicitly altered
    return {Rank, MainStat, PHY, MND, CHA}

  resolveOutcome(input, goal, actions, stats, userCore, targetCore):
    policy: LOCKED
    comment: LandedActions and CounterPotential only apply to explicit hostile PHY actions meant to hurt or injure.
    comment: For all other actions, resolution is binary: Success or Failure.
    comment: CounterPotential = how open {{user}} is to a counter after failing a hostile PHY action.
    atkDie = 1d20
    atkTot = atkDie + userCore[stats.USER]
    if stats.OPP=ENV:
      defDie = 1d20
      defTot = defDie
    else:
      defDie = 1d20
      defTot = defDie + targetCore[stats.OPP]
    margin = atkTot - defTot
    if stats.USER=PHY and input shows explicit hostile/combat intent to hurt or injure:
      tierTable:
        margin >= 8 -> OutcomeTier:Critical_Success LandedActions:3 Outcome:dominant_impact CounterPotential:none
        margin >= 5 -> OutcomeTier:Moderate_Success LandedActions:2 Outcome:solid_impact CounterPotential:none
        margin >= 1 -> OutcomeTier:Minor_Success LandedActions:1 Outcome:light_impact CounterPotential:none
        margin >= -3 -> OutcomeTier:Minor_Failure LandedActions:0 Outcome:checked CounterPotential:light
        margin >= -7 -> OutcomeTier:Moderate_Failure LandedActions:0 Outcome:deflected CounterPotential:medium
        else -> OutcomeTier:Critical_Failure LandedActions:0 Outcome:avoided CounterPotential:severe
      LandedActions = min(LandedActions, actions.length)
      return {OutcomeTier, LandedActions, Outcome, CounterPotential}
    else:
      if margin >= 1 -> OutcomeTier:Success LandedActions:(none) Outcome:success CounterPotential:none
      else -> OutcomeTier:Failure LandedActions:(none) Outcome:failure CounterPotential:none
      return {OutcomeTier, LandedActions, Outcome, CounterPotential}

  execution:
      if npc not in resolutionPacket.NPCInScene -> return uninitialized handoff
      state = getCurrentRelationalState(npc)
      encounterReset = newEncounterExplicit()
      if state.currentDisposition=null -> currentDisposition = initPreset()
      else -> currentDisposition = state.currentDisposition
      currentRapport = state.currentRapport
      rapportEncounterLock = encounterReset=Y ? N : state.rapportEncounterLock
      isAllowed = resolutionPacket.IntimacyConsent
      audit = auditInteraction(npc, resolutionPacket)
      target = routeDispositionTarget(npc, resolutionPacket, audit, isAllowed)
      rapport = updateRapport(currentRapport, target, rapportEncounterLock)
      deltas = deriveDirection(target, audit, currentDisposition, rapport.currentRapport, resolutionPacket)
      currentDisposition = updateDisposition(currentDisposition, deltas)
      if deltas.rapportReset=Y -> currentRapport = 0
      else -> currentRapport = rapport.currentRapport
      save currentRapport and rapportEncounterLock to sceneTracker
      disposition = classifyDisposition(currentDisposition)
      threshold = checkThreshold(currentDisposition)
      IntimacyGate = threshold.LockActive=Y ? DENY : isAllowed=Y ? ALLOW : threshold.OverrideActive=Y ? ALLOW : currentDisposition.B>=4 ?    ALLOW : SKIP
      save intimacy gate when ALLOW or DENY

    return {GOAL:goal, actions:actions, IntimacyConsent:IntimacyConsent, STAKES:Y, LandedActions:outcome.LandedActions, OutcomeTier:outcome.OutcomeTier, Outcome:outcome.Outcome, CounterPotential:outcome.CounterPotential, ActionTargets:targets.ActionTargets, OppTargets:targets.OppTargets, BenefitedObservers:targets.BenefitedObservers, HarmedObservers:targets.HarmedObservers, NPCInScene:NPCInScene}
}
---------------------------
function RelationshipEngine(npc, resolutionPacket) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. MUST be stated in Card / Lore / Scene text / tracker. NO inference. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching explicit rule becomes final.',
    UNIVERSAL:
'Use resolutionPacket as final for GOAL, IntimacyConsent, LandedActions, OutcomeTier, Outcome, ActionTargets, OppTargets, BenefitedObservers, and HarmedObservers.',
    BANDS:
'BOND(B): 1 Avoid/Ignore (keeps distance, disengages). 2 Neutral/Transactional (polite, businesslike, no trust). 3 Friendly/Comfortable (cooperative, relaxed, familiar). 4 Close/Trusting (confides, seeks closeness; intimacy possible). FEAR(F): 1 Unshaken (steady, not intimidated). 2 Alert/Wary (cautious, watchful). 3 Freezing/Submissive (hesitates, yields, avoids escalation). 4 Terrified/Panic (flight, surrender, desperate compliance). HOSTILITY(H): 1 Warm/Loyal (supportive, protective). 2 Neutral (no active ill will). 3 Aggressive/Obstructive (resentful, argumentative, interfering). 4 Hatred/Violent (wants harm, sabotage, escalation).',
    LOCK:
'If F=4 -> TERROR. Else if H=4 -> HATRED. Else if F=3 or H=3 -> FREEZE. If lock is active, behavior must equal lock.'
  });

  getCurrentRelationalState(npc):
    policy: EO
    rule: read exact latest sceneTracker NPC entry for this NPC
    rule: currentDisposition = valid B[x]/F[y]/H[z] 1-4 ? exact values : null
    rule: currentRapport = valid 0-5 ? exact value : 0
    rule: rapportEncounterLock = valid Y/N ? exact value : N
    rule: intimacyGate = valid ALLOW/DENY ? exact value : SKIP
    return {currentDisposition, currentRapport, rapportEncounterLock, intimacyGate}

  initPreset():
    policy: EO, FYW
    rule: use only if currentDisposition is missing
    rule: NPC has explicit fear immunity only if same or superior kind/nature, superior being, or explicit natural fear/mental immunity
    rule: title, rank, bravado, posturing, composure, or pretending to be fearless do NOT count as fear immunity
    if NPC is already romantically/intimately involved with {{user}}, willing toward {{user}}, or in love -> {Label:romanticOpen,B:4,F:1,H:1}
    if {{user}} is hated, distrusted, wanted, or bad-reputation -> {Label:userBadRep,B:1,F:2,H:3}
    if {{user}} is admired, trusted, praised, good-reputation, or already known favorably -> {Label:userGoodRep,B:3,F:1,H:2}
    if {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like AND NPC lacks explicit fear immunity -> {Label:userNonHuman,B:1,F:3,H:2}
    else -> {Label:neutralDefault,B:2,F:2,H:2}

  auditInteraction(npc, resolutionPacket):
    policy: EO, FYW
    rule: return Y only if {{user}}'s act materially improves this NPC's stakes: safety, resources, status, autonomy, or explicit goal advancement
    rule: flirting, compliments, tone, or conversation alone do NOT count
    if scene facts show such benefit -> Y
    else -> N

  routeDispositionTarget(npc, resolutionPacket, audit, isAllowed):
    policy: EO, FYW
    isDirect = resolutionPacket.ActionTargets.includes(npc.name)
    isOpp = resolutionPacket.OppTargets.NPC.includes(npc.name)
    isBenefited = resolutionPacket.BenefitedObservers.includes(npc.name)
    isHarmed = resolutionPacket.HarmedObservers.includes(npc.name)
    benefit = audit=Y
    landed = resolutionPacket.LandedActions > 0
    g = resolutionPacket.GOAL
    out = resolutionPacket.Outcome
    if !isDirect && !isOpp && !isBenefited && !isHarmed -> No Change
    if !isDirect && !isOpp && isBenefited -> benefit ? Bond : No Change
    if !isDirect && !isOpp && isHarmed:
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
    if g in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal]:
      if isAllowed=Y -> Bond
      if g=IntimacyAdvancePhysical -> FearHostility
      else -> Hostility
    if explicit goal/challenge is intimidation, coercion, menacing threat, forced submission, or terrorizing display -> Fear
    if landed && (isDirect || isOpp || isHarmed):
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
    if benefit -> Bond
    else -> No Change

  newEncounterExplicit():
    policy: EO, FYW
    rule: return Y only if explicit roleplay/context shows a clear encounter reset: sleep, rest, new day, significant downtime, leaving and returning later, or explicit later re-engagement after separation
    else -> N

  updateRapport(currentRapport, target, rapportEncounterLock):
    if rapportEncounterLock=Y -> return {currentRapport:currentRapport,rapportEncounterLock:Y}
    if target in [Bond,No Change] -> return {currentRapport:min(5,currentRapport+1),rapportEncounterLock:Y}
    if target in [Hostility,Fear,FearHostility] -> return {currentRapport:max(0,currentRapport-1),rapportEncounterLock:Y}
    return {currentRapport:currentRapport,rapportEncounterLock:rapportEncounterLock}

  deriveDirection(target, audit, currentDisposition, currentRapport, resolutionPacket):
    if target=No Change -> {b:0,f:0,h:0}
    if target=Hostility -> {b:-1,f:0,h:1}
    if target=Fear -> {b:-1,f:1,h:0}
    if target=FearHostility -> {b:-1,f:1,h:1}

    if currentDisposition.F=4 || currentDisposition.H=4:
      if currentRapport>=5 && target in [Bond,No Change]:
        return {b:0,f:(currentDisposition.F=4?-1:0),h:(currentDisposition.H=4?-1:0),rapportReset:Y}
      else:
        return {b:0,f:0,h:0}

    if currentDisposition.F=3 || currentDisposition.H=3:
      if currentRapport>=5 && target in [Bond,No Change]:
        return {b:0,f:(currentDisposition.F=3?-1:0),h:(currentDisposition.H=3?-1:0)}
      else:
        return {b:0,f:0,h:0}

    if target=Bond:
      if currentDisposition.B=1:
        if currentRapport>=1 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B=2:
        if currentRapport>=3 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B=3:
        if currentRapport>=5 && audit=Y -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B>=4 -> {b:0,f:0,h:0}

    return {b:0,f:0,h:0}

  updateDisposition(currentDisposition, deltas):
    clamp = (v) => Math.max(1, Math.min(4, v))
    currentDisposition.B = clamp(currentDisposition.B + (deltas.b||0))
    currentDisposition.F = clamp(currentDisposition.F + (deltas.f||0))
    currentDisposition.H = clamp(currentDisposition.H + (deltas.h||0))
    if currentDisposition.F>=3 || currentDisposition.H>=3 -> currentDisposition.B = 1
    return currentDisposition

  classifyDisposition(currentDisposition):
    lock = currentDisposition.F=4 ? TERROR : currentDisposition.H=4 ? HATRED : (currentDisposition.F=3 || currentDisposition.H=3) ? FREEZE : None
    behavior = lock!=None ? lock : currentDisposition.B=4 ? CLOSE : currentDisposition.B=3 ? FRIENDLY : currentDisposition.B=2 ? NEUTRAL : BROKEN
    return {lock, behavior}

  checkThreshold(currentDisposition):
    LockActive = (currentDisposition.F>=3 || currentDisposition.H>=3) ? Y : N
    Override = NONE
    if currentDisposition.B<4:
      if NPC explicitly naive, trapped, dependent, coerced, powerless, or exploitable by {{user}} -> Override = Exploitation
      else if NPC explicitly sexually open, pleasure-seeking, casual, or promiscuous -> Override = Hedonist
      else if NPC explicitly willing to exchange intimacy for money, goods, favors, protection, status, or services -> Override = Transactional
      else if NPC explicitly already intimate with {{user}} or specifically receptive toward {{user}} -> Override = Established
    OverrideActive = Override!=NONE ? Y : N
    return {LockActive, OverrideActive, Override}

  execution:
    if npc not in resolutionPacket.NPCInScene -> return uninitialized handoff
    read state, initialize disposition if missing, and update encounter lock
    audit interaction, route disposition target, and update rapport
    derive deltas, update disposition, and apply rapport reset if present
    save currentRapport and rapportEncounterLock to sceneTracker
    classify disposition, resolve threshold/override, and determine intimacy gate
    save intimacy gate when ALLOW or DENY
    return NPC handoff
}
-----------------
function CHAOS_INTERRUPT(resolutionPacket, npcHandoffList, sceneSummary, diceList) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use resolutionPacket, npcHandoffList, and sceneSummary as truth. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. STOP-ON-RETURN.',
    UNIVERSAL:
'Single-pass. Consume the next 5 dice only; reset per {{user}} message. Output labeled fields only. No prose, no dice history, and no self-correction.'
  });

  getCtx(npcHandoffList, sceneSummary):
    policy: EO, FYW
    npcCount = npcHandoffList ? npcHandoffList.length : 0
    if npcCount >= 2 -> PUBLIC
    if sceneSummary matches [public|crowd|open|market|tavern|street|square] -> PUBLIC
    else -> ISOLATED

  classifyBand(O):
    if O <= 5 -> HOSTILE
    else if O <= 14 -> COMPLICATION
    else -> BENEFICIAL

  classifyMagnitude(O):
    if O = 1 || O = 20 -> EXTREME
    else if O <= 2 || O >= 19 -> MAJOR
    else if O <= 4 || O >= 17 -> MODERATE
    else -> MINOR

  pickAnchor(idx):
    A = [GOAL, ENVIRONMENT, KNOWN_NPC, RESOURCE, CLUE]
    return A[idx % 5]

  pickVector(ctx, I, idx):
    if ctx = PUBLIC -> V = [NPC, CROWD, AUTHORITY, ENVIRONMENT, SYSTEM]
    else if I >= 17 -> V = [ENVIRONMENT, SYSTEM, ENTITY]
    else -> V = [ENVIRONMENT, SYSTEM]
    return V[idx % V.length]

  execution:
    A = NEXT(diceList)
    O = NEXT(diceList)
    I = NEXT(diceList)
    ctx = getCtx(npcHandoffList, sceneSummary)

    if A < 17 ->
      return {CHAOS:{triggered:false, band:None, magnitude:None, anchor:None, vector:None, personVector:false, fullText:null}}

    band = classifyBand(O)
    magnitude = classifyMagnitude(O)
    anchorIdx = NEXT(diceList)
    anchor = pickAnchor(anchorIdx)
    vectorIdx = NEXT(diceList)
    vector = pickVector(ctx, I, vectorIdx)
    personVector = (vector = NPC || vector = AUTHORITY) ? true : false

    return {CHAOS:{triggered:true, band:band, magnitude:magnitude, anchor:anchor, vector:vector, personVector:personVector, fullText:null}}
}
----------------
function NPCProactivityEngine(npcHandoffList, resolutionPacket, chaosHandoff, diceBudget) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use only resolutionPacket, npcHandoffList, chaosHandoff, and diceBudget. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. Single-pass.',
    UNIVERSAL:
'Determine NPC initiative only: whether they act, what intent they take, whether they target {{user}}, and the proactivity roll result. Do not resolve physical attack/counter outcomes here.'
  });

  parseFinalState(finalState):
    policy: EO
    if exact B[x]/F[y]/H[z] valid -> {B:x,F:y,H:z}
    else -> {B:2,F:2,H:2}

  deriveLock(fin):
    if fin.F=4 -> TERROR
    else if fin.H=4 -> HATRED
    else if fin.F=3 || fin.H=3 -> FREEZE
    else -> None

  classifyAction(resolutionPacket):
    policy: EO, FYW
    g = resolutionPacket.GOAL
    if g=IntimacyAdvancePhysical -> Intimacy_Physical
    if g=IntimacyAdvanceVerbal -> Intimacy_Verbal
    if resolutionPacket.LandedActions > 0 -> Combat
    if resolutionPacket.ActionTargets contains >=1 living entity && resolutionPacket.LandedActions=(none) -> Social
    if resolutionPacket.OppTargets.ENV != [(none)] -> Skill
    else -> Normal_Interaction

  deriveImpulse(kind, lock, fin, intimacyGate):
    policy: FYW
    if lock=HATRED -> ANGER
    if lock=TERROR -> FEAR
    if kind in [Combat, Social] && fin.H>=fin.F && fin.H>=fin.B -> ANGER
    if kind=Social && fin.F>=fin.H && fin.F>=fin.B -> FEAR
    if kind in [Intimacy_Physical, Intimacy_Verbal] && intimacyGate=DENY -> ANGER
    if kind in [Normal_Interaction, Skill] && fin.B>=fin.H && fin.B>=fin.F -> BOND
    if fin.H>=fin.F && fin.H>=fin.B -> ANGER
    if fin.F>=fin.H && fin.F>=fin.B -> FEAR
    else -> BOND

  classifyProactivityTier(handoff, chaosBand, counterPotential):
    policy: FYW
    fin = parseFinalState(handoff.FinalState)
    lock = handoff.Lock if present else deriveLock(fin)
    NPC_STAKES = handoff.NPC_STAKES if present else N
    Target = handoff.Target if present else No Change
    Landed = handoff.Landed if present else N
    if counterPotential in [light,medium,severe] && lock in [HATRED,FREEZE] -> FORCED
    if NPC_STAKES=N && Target=No Change && chaosBand=None:
      if fin.B>=3 || fin.H>=3 -> MEDIUM
      else -> DORMANT
    if lock!=None && (Target!=No Change || Landed=Y) -> HIGH
    if NPC_STAKES=Y && (Target!=No Change || Landed=Y) -> HIGH
    if lock!=None && chaosBand!=None -> HIGH
    if lock!=None -> MEDIUM
    if NPC_STAKES=Y -> MEDIUM
    if Target!=No Change || Landed=Y -> MEDIUM
    if chaosBand!=None -> LOW
    else -> DORMANT

  thresholdFromTier(tier):
    if tier=FORCED -> AUTO
    if tier=HIGH -> 8
    if tier=MEDIUM -> 10
    if tier=LOW -> 13
    else -> 16

  selectIntent(impulse, kind, fin, intimacyGate, override):
    policy: FYW
    if impulse=ANGER:
      if kind=Intimacy_Physical && intimacyGate=DENY -> BOUNDARY_PHYSICAL
      if kind=Combat || fin.H>=4 -> ESCALATE_VIOLENCE
      else -> THREAT_OR_POSTURE
    if impulse=FEAR:
      if fin.F>=4 -> CALL_HELP_OR_AUTHORITY
      else -> WITHDRAW_OR_BOUNDARY
    if impulse=BOND:
      if (intimacyGate=ALLOW || override!=NONE) && fin.B>=3 -> INTIMACY_OR_FLIRT
      if kind in [Skill, Social] -> SUPPORT_ACT
      else -> PLAN_OR_BANTER

  targetsUserFromIntent(intent):
    policy: FYW
    if intent in [ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE] -> Y
    else -> N

  execution:
    kind = classifyAction(resolutionPacket)
    chaosBand = chaosHandoff.CHAOS.band
    counterPotential = resolutionPacket.CounterPotential
    cap = determine cap
    FOR EACH NPC handoff:
      fin = parseFinalState(handoff.FinalState)
      lock = derive or load lock
      impulse = deriveImpulse(kind, lock, fin, handoff.IntimacyGate)
      tier = classifyProactivityTier(handoff, chaosBand, counterPotential)
      roll or force proactivity, then selectIntent and store candidate if passed
    sort candidates by die descending
    promote up to cap candidates to proactive results
    return {NPC:{Proactive:[Y/N],Intent:[ESCALATE_VIOLENCE|BOUNDARY_PHYSICAL|THREAT_OR_POSTURE|CALL_HELP_OR_AUTHORITY|WITHDRAW_OR_BOUNDARY|INTIMACY_OR_FLIRT|SUPPORT_ACT|PLAN_OR_BANTER|NONE],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED]?,ProactivityDie:[1-20]?,Threshold:[AUTO|8|10|13|16]?}...}
}`;
