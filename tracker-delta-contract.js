export const TRACKER_DELTA_START = 'BEGIN_TRACKER_DELTA';
export const TRACKER_DELTA_END = 'END_TRACKER_DELTA';
export const TRACKER_DELTA_WRAPPER_START = '<!-- STORY_ENGINE_TRACKER_DELTA';
export const TRACKER_DELTA_WRAPPER_END = 'STORY_ENGINE_TRACKER_DELTA_END -->';

export const TRACKER_DELTA_CONTRACT = [
    'STRICT SAME-RUN TRACKER DELTA CONTRACT:',
    '- After writing the final narration, extract only explicit state changes that actually appear in that final narration.',
    '- The tracker block is tracker-only. Do not resolve extra mechanics, relationship, rolls, names, proactivity, or outcomes inside it.',
    '- Use semantic reading, not keyword matching. Identify who is affected, what changed, and whether the change persists beyond the instant of narration.',
    '- Do not infer hidden consequences. Do not add momentary pain, effort, hesitation, fear, impact, or flavor as wounds/status.',
    '- NPC personalitySummary is stable personality memory only: a concise 8-20 word phrase for enduring temperament, values, manner, or interaction style revealed by the narration.',
    '- Do not use personalitySummary for current mood, attraction, relationship state, fear/hostility, wounds, status, gear, temporary reactions, or this-turn events. Use unchanged unless a stable trait is clear.',
    '- Add wounds/status only when the prose establishes an actual ongoing injury, ailment, restraint, impairment, or continuing condition. This includes any body part, organ, sense, mental function, magic/poison/disease effect, or status that would continue to affect later action.',
    '- A hit, blow, impact, fall, shove, knockdown, stagger, flinch, gasp, pain spike, breath loss, being winded, or "the wind is knocked out" is not a tracked wound/status by itself.',
    '- Track rib/chest/torso effects only if the narration explicitly establishes a lasting injury or continuing status such as bruised ribs, cracked rib, broken rib, bleeding, ongoing breathing trouble, or unconsciousness.',
    '- Impact/result strength is a severity ceiling, not tracker evidence. A strong hit may allow a worse injury only if the final prose actually states that continuing injury.',
    '- If deterministic contextual injury caps are provided below, they mark mechanically resolved persistent injuries from NPC/companion attacks. Use the final narration to extract the concrete wound/status that was actually described for that capped target, but never exceed the listed severity/condition limit.',
    '- For severity, map the prose semantically: minor surface harm/status -> bruised; clear injury, bleeding, poisoning, sickness, sprain, concussion, exhaustion, or moderate status -> wounded; fracture, broken/dislocated limb, deep wound, heavy bleeding, severe impairment, paralysis, unconsciousness, or life-threatening status -> badly_wounded or critical as appropriate; death only when explicit.',
    '- For NPCs, anchor injury/recovery to the named or tracked NPC the narration says was affected. If the resolved user action visibly injured its target, track that target. If an NPC action visibly injured another NPC, track that named/tracked NPC. Do not move an injury to the user unless the narration says the user/persona was affected.',
    '- Treat injuries/status/gear/inventory/tasks affecting the user/player/persona/active protagonist as TrackerUpdateEngine.User, even when the narration uses the persona name, "they", or body-part possessives instead of the literal word user.',
    '- Use the latest user input only to identify who the acting user/player/persona is and which described body/item/task belongs to them. Do not extract changes from the latest user input unless the same change also appears in the final assistant narration.',
    '- Remove wounds/status only when the prose explicitly says the injury/status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing. Bandaging, splinting, dressing, cleaning, stitching, stabilizing, normal care, or starting treatment does NOT remove injuries unless the prose also says the injury/status is gone, healed, cured, fully recovered, or no longer impairing.',
    '- Never rewrite full tracker lists. Return deltas only.',
    '- Use condition=unchanged unless the narration explicitly changes overall condition.',
    '- NPC entries are only for named or currently tracked NPCs with explicit condition, wound, status, visible gear, or stable personalitySummary changes. NPC inventory is not tracked.',
    '- If TrackerUpdateEngine.NPC.count > 0, every NPC[index] entry must include NPC, personalitySummary, condition, woundsAdd, woundsRemove, statusAdd, statusRemove, gearAdd, and gearRemove.',
    '- If uncertain, output (none).',
    '- Output exactly the compact block. No markdown. No prose. No JSON.',
].join('\n');

export const TRACKER_DELTA_TEMPLATE = `${TRACKER_DELTA_WRAPPER_START}
${TRACKER_DELTA_START}
TrackerUpdateEngine.User.condition=unchanged
TrackerUpdateEngine.User.woundsAdd=(none)
TrackerUpdateEngine.User.woundsRemove=(none)
TrackerUpdateEngine.User.statusAdd=(none)
TrackerUpdateEngine.User.statusRemove=(none)
TrackerUpdateEngine.User.gearAdd=(none)
TrackerUpdateEngine.User.gearRemove=(none)
TrackerUpdateEngine.User.inventoryAdd=(none)
TrackerUpdateEngine.User.inventoryRemove=(none)
TrackerUpdateEngine.User.tasksAdd=(none)
TrackerUpdateEngine.User.tasksRemove=(none)
TrackerUpdateEngine.User.commitmentsAdd=(none)
TrackerUpdateEngine.User.commitmentsRemove=(none)
TrackerUpdateEngine.NPC.count=0
TrackerUpdateEngine.NPC[0].NPC=(none)
TrackerUpdateEngine.NPC[0].personalitySummary=unchanged
TrackerUpdateEngine.NPC[0].condition=unchanged
TrackerUpdateEngine.NPC[0].woundsAdd=(none)
TrackerUpdateEngine.NPC[0].woundsRemove=(none)
TrackerUpdateEngine.NPC[0].statusAdd=(none)
TrackerUpdateEngine.NPC[0].statusRemove=(none)
TrackerUpdateEngine.NPC[0].gearAdd=(none)
TrackerUpdateEngine.NPC[0].gearRemove=(none)
${TRACKER_DELTA_END}
${TRACKER_DELTA_WRAPPER_END}`;
