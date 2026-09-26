# Nekyia — story bible: the war of the gods

Not an adaptation of any game. Nekyia is the Greek gods' own war, told from
below: the hero descends while, above, the Olympians fight a second
Titanomachy and a Gigantomachy at once, and every deed in the dark tips it.

## The three sides (and why they are real)

| Faction | Who | Source of the grudge |
|---|---|---|
| **Olympians** | Zeus and his house: Poseidon, Hades, Athena, Apollo, Artemis, Ares, Hephaestus; their mortal sons (Heracles, Achilles) and heroes under their protection (Theseus, Atalanta, Orpheus) | Zeus overthrew his father Cronus and shut the Titans in Tartarus (Hesiod, *Theogony* 617–735). |
| **Titans** | Cronus's kin: Menoetius (struck by Zeus's bolt), Iapetus, Atlas (holding the sky), Campe (jailer of Tartarus), Prometheus (chained, later freed by Heracles) | They ruled the Golden Age and were cast down; the *Titanomachy* is their war to return. |
| **Giants** | Gaia's earthborn sons, sprung from the blood of castrated Uranus: Porphyrion, Alcyoneus, Enceladus, Polybotes; Typhon and Echidna's brood (the Hydra); the Gegenees | Gaia raised them to avenge the Titans. An oracle said no god could kill them without a mortal's help — that is why Heracles was born (Apollodorus 1.6.1). |

Mortals (the polis, the villagers, the shades) have no side. They are what the
war is fought *over*, and what the hero keeps stepping on.

All of this lives in `src/data/lore.ts` as a small genealogy: each entry has
`parents` and `undoneBy` from the sources, so the code — and the LLM — can say
"Alcyoneus is undone by Heracles" and mean it.

## How the player moves the war

`StoryState.tide` holds a score for each faction (−100…100).

| Deed | Tide | Why |
|---|---|---|
| Kill an innocent | Olympian −6, **Giant +7** | Blood on the earth feeds Gaia. |
| Spare an innocent | Olympian +4 | Zeus Xenios, protector of guests. |
| Kill a boss | its faction −18, each rival +9 | A champion falls. |
| Dialogue `favor` | −20…20 per faction | Swear to Cronus, invoke the Thunderer, cut your palm for the Mother. |

Whoever leads the tide **holds the next floor** (ties go to the stage's
default `holder`). `FRONTS[stage][faction]` in `src/data/war.ts` says what a
held floor looks like: bosses, extra enemies, palette, chapter card.

| Stage | Olympian | Titan | Giant |
|---|---|---|---|
| Ruined Polis | Minotaur | Menoetius + cultists | Alcyoneus + earthborn |
| Labyrinth | Minotaur / Talos | Campe + cultists, skeletons | Hydra + earthborn |
| Gates of Tartarus | Talos | Menoetius / Campe | Porphyrion + earthborn |

Bosses also get modifiers from the war (`takeBossMods(faction)`): a boss of
the leading faction hits up to 20 % harder; a cruel hero faces tougher bosses.

## Shades: the death collectible

Kill an innocent by mistake and it is not a number. `makeShade()` gives the
dead a name and an epitaph — *"Timon the villager was counting the goats when the
arrow came."* — and the run remembers:

* the shade is listed in every `StorySnapshot` (`shades: string[]`), so boss
  intros can say the name;
* a `restless_shade` NPC may appear on later floors and speak as the last one killed;
* the game-over screen reads the epitaphs out under the verdict;
* the mock provider and the `SYSTEM_PROMPT` are both told to name them and
  never invent other victims.

## The verdict

`judge()` reads the final tide, karma, shade count and the hero:

* **THE EARTH RISES / GAIA IS FED** — the Giants won; the shades are why.
* **THE GOLDEN AGE RETURNS** — the Titans won; Cronus is loose.
* **A SEAT AMONG THE STARS** — Olympus held and the hero was just.
* **KRATOS, NOT DIKE** — Olympus held, but by force, not justice.
* **A HERO'S SHADE** — Olympus held and the hero was just, but died before the last gate.
* **THE ORDER HOLDS** — nothing changed.

## Writing rules for new content

1. Real links only. If a boss "hates" a hero, `lore.ts` must show why
   (`parents`, `undoneBy`). No invented gods.
2. Every innocent id needs an `EPITAPHS` line: the shade must be a person.
3. Content in `src/data/*.ts`; the generic systems (`chronicle.ts`,
   `story.ts`) should never mention a god by name.

## Where the story goes next (Phase 4 candidates)

Seven arcs that turn *remembered choices* into content. Each one only uses
things the engine already has: flags, deeds, karma/tide, `judge()`, the
Director's `FloorDirective` and `achievements.ts`.

| # | Arc | One line | Hooks |
|---|---|---|---|
| 1 | Recurring Shepherd | Spare him on floor 1 → he returns on floor 2 with the boss's weakness; rob him → he warns the boss (boss gets `mods.damage ×1.2`). | flags `spared_shepherd` / `robbed_shepherd`, Director `npcCast` |
| 2 | Personal quests | Orpheus: "don't look back" (turning around at the last gate loses Eurydice); Heracles: bosses remember the labours; Achilles: every boss aims for the heel, cruel Achilles dies "young and forgotten"; Atalanta: Artemis guides her through shrines; Kratos: the gods refuse him, revenge is the only path. | `character.storyFlags`, `lore.undoneBy`, shrine `god` checks |
| 3 | Gods' favour | Thunderbolt = Zeus, Trident = Poseidon, Helm = Hades: taking one makes that god like you and his rivals hate you (Medusa hates Trident carriers, Cerberus hunts the Helm thief). | `story.favour(god)`, `effects.favor`, `mutators` |
| 4 | Boss mercy | At low hp the boss begs; kill or spare. A spared Minotaur fights beside you once; a killed one makes the Hydra afraid (`speed ×0.8`). | `kind: 'boss_mercy'` dialogue at `hp < 20 %`, flag `spared_<boss>` |
| **5** | **Lost Child twist** | Protect the Child through the whole run and they are revealed as young Persephone in disguise → true heroic ending. | see below |
| 6 | Charon's toll | Coins matter: pay to cross the Styx or fight Charon. Robbing NPCs makes paying easy — at a karma cost. | `run.coins`, Gates of Tartarus boss pool |
| **7** | **Three endings** | Heroic / Neutral / Cruel by alignment (+ tide). | see below |

**Pick: 5 + 7.** One secret that ties every system together, and an ending
that is only reachable through it — the reason to replay.

### 5. The Lost Child is Persephone

* `child` (already an innocent, `data/enemies.ts`) is cast by the Director on
  at least one room per floor when `flags` lack `child_dead`
  (`FloorDirective.npcCast` weight ×3 for `child` while `child_alive`).
* Every floor the Child is *met and spared* sets `child_floor_<n>`; the mock
  and the prompt get one hint per floor that something is off ("she is not
  afraid of the dark", "the shades bow when she passes", "the pomegranate
  seeds in her pocket").
* Killing the Child: `npc_killed` as today **plus** flag `child_dead`,
  karma −30 (`KARMA.npcKill × 2`), tide Giant +14 — and Hades's grudge on every
  later boss ("You slew my queen's childhood").
* Reveal: if the run reaches the last gate with `child_floor_1…N` all set and
  no `child_dead`, the game-over/victory flow shows a one-line
  `kind: 'epilogue'` script where the Child speaks as Persephone. Flag
  `persephone_revealed` → achievement `kore` ("Kore — you brought the girl
  home") and unlock of the **heroic** ending below.
* Kratos can never trigger it: his `storyFlags` include `godslayer`, and
  Persephone will not show herself to him — his heroic slot is replaced by
  "the throne of the dead is yours if you want it" (see Cruel).

### 7. Three endings

`judge()` already produces a verdict from tide + karma. The ending is one
level above it: the last screen, the achievement, and the next run's
opening line.

| Ending | Condition (checked at the last gate) | Screen | Achievement |
|---|---|---|---|
| **Heroic — A star in the sky** | `alignment === 'heroic'` **and** `persephone_revealed` | Persephone leads the hero up; Zeus sets them among the stars (catasterism, as with Heracles and the Dioscuri). | `catasterism` |
| **Neutral — The deal** | anything else while alive | Hades offers terms: one more descent, one more soul. Loop continues: next run starts with the flag `hades_deal` and Hades's voice in the first shrine. | `oath_to_hades` |
| **Cruel — The new god of death** | `alignment === 'cruel'` (or `child_dead` regardless of karma) | The hero takes the throne; the shades kneel and read their own epitaphs. Next run's NPCs recognise the tyrant (`flags: ['tyrant']`). | `new_god_of_death` |

Death before the last gate keeps today's `judge()` verdicts (`A HERO'S SHADE`
etc.) — endings are only for runs that finish.

Implementation order (all Stream A except the last two, which are B):
1. ~~flags + karma + tide changes for the Child~~ — landed: `data/child.ts` holds the
   arc (`CHILD`, `childProtected()`, hints, reveal text); `child_dead` gives every
   later boss ×1.15 damage in `takeBossMods()`; `kore` achievement fires at the last
   gate while the child is protected (met and let go on ≥ 2 floors, never robbed).
2. ~~hints in `data/*` + `SYSTEM_PROMPT` wording~~ (landed); Director casting weight (open).
3. `kind: 'epilogue'` content in the mock provider (`src/dialogue/types.ts` needs
   the new kind → review by all three).
4. three ending achievements in `data/achievements.ts`.
5. `GameOverScene` ending panel per ending; the victory flow runs the epilogue script.
