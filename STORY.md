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
* a `shade` NPC may appear on later floors and speak as the last one killed;
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
