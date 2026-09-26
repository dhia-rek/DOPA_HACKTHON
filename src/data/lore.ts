/**
 * The mythos behind the war. Every boss, enemy, NPC and character points at a
 * LoreEntry; dialogue generation gets the relevant entries so the LLM writes
 * from the real genealogy (Hesiod's Theogony, Apollodorus' Library, Homer)
 * instead of inventing one.
 *
 * Factions are the sides of the Second Titanomachy:
 *   olympian  Zeus' house and the mortals under its order
 *   titan     Cronus' generation, chained in Tartarus, and their thralls
 *   giant     Gaia's earthborn children (Gigantes) and Typhon's brood
 *   mortal    innocents; belong to nobody, everybody's victims
 */
export type Faction = 'olympian' | 'titan' | 'giant' | 'mortal';

export const WAR_FACTIONS = ['olympian', 'titan', 'giant'] as const;
export type WarFaction = (typeof WAR_FACTIONS)[number];

export interface LoreEntry {
  id: string;
  name: string;
  epithet: string;
  faction: Faction;
  /** Lore ids (or plain names when the parent has no entry). */
  parents: string[];
  /** 1-2 sentences of sourced myth, present tense, that a prompt can quote. */
  myth: string;
  /** Lore ids of whoever killed, chained or maimed them in the sources. */
  undoneBy?: string[];
}

export const LORE: Record<string, LoreEntry> = {
  // ---------------------------------------------------------------- primordials
  gaia: {
    id: 'gaia',
    name: 'Gaia',
    epithet: 'the Earth, mother of all',
    faction: 'giant',
    parents: ['Chaos'],
    myth: 'Mother of the Titans by Uranus and of the Giants from the blood he spilled on her; she bore Typhon with Tartarus to avenge her fallen children. Every war against Olympus begins in her.',
  },
  uranus: {
    id: 'uranus',
    name: 'Uranus',
    epithet: 'the Sky',
    faction: 'titan',
    parents: ['gaia'],
    myth: 'First king of the cosmos, castrated by his son Cronus with a sickle Gaia forged; from his blood the Giants and the Furies were born.',
    undoneBy: ['cronus'],
  },
  tartarus: {
    id: 'tartarus',
    name: 'Tartarus',
    epithet: 'the Pit beneath the roots of the earth',
    faction: 'titan',
    parents: ['Chaos'],
    myth: 'As far below Hades as the sky is above the earth; Zeus chained the defeated Titans here and set the Hundred-Handers to guard them.',
  },
  styx: {
    id: 'styx',
    name: 'Styx',
    epithet: 'the river of oaths',
    faction: 'olympian',
    parents: ['Oceanus', 'Tethys'],
    myth: 'First of the immortals to bring her children to Zeus when he called for allies against the Titans; in return the gods swear their unbreakable oaths on her waters.',
  },

  // ---------------------------------------------------------------- titans
  cronus: {
    id: 'cronus',
    name: 'Cronus',
    epithet: 'King of the Titans, Sickle-Bearer',
    faction: 'titan',
    parents: ['uranus', 'gaia'],
    myth: 'Overthrew his father and swallowed his own children to keep the throne, until Rhea hid Zeus on Crete. After ten years of war he was cast into Tartarus. Under his reign mortals lived a Golden Age without toil.',
    undoneBy: ['zeus'],
  },
  rhea: {
    id: 'rhea',
    name: 'Rhea',
    epithet: 'Mother of the Gods',
    faction: 'titan',
    parents: ['uranus', 'gaia'],
    myth: 'Wife of Cronus who saved her sixth child by handing him a swaddled stone to swallow; Zeus is her son, and so she stands on both sides of the war.',
  },
  iapetus: {
    id: 'iapetus',
    name: 'Iapetus',
    epithet: 'the Piercer',
    faction: 'titan',
    parents: ['uranus', 'gaia'],
    myth: 'Titan father of Atlas, Menoetius, Prometheus and Epimetheus; chained in Tartarus with Cronus.',
    undoneBy: ['zeus'],
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    epithet: 'the Enduring',
    faction: 'titan',
    parents: ['iapetus', 'Clymene'],
    myth: 'Led the Titan armies against Olympus and, being too dangerous to chain, was condemned to hold up the sky forever at the western edge of the world. Heracles once held it for him.',
    undoneBy: ['zeus'],
  },
  menoetius: {
    id: 'menoetius',
    name: 'Menoetius',
    epithet: 'the Insolent',
    faction: 'titan',
    parents: ['iapetus', 'Clymene'],
    myth: 'Brother of Atlas and Prometheus, so violent and proud that Zeus struck him with the thunderbolt and hurled him into Erebus during the Titanomachy.',
    undoneBy: ['zeus'],
  },
  prometheus: {
    id: 'prometheus',
    name: 'Prometheus',
    epithet: 'Forethought',
    faction: 'titan',
    parents: ['iapetus', 'Clymene'],
    myth: 'The Titan who sided with Zeus, then stole fire for mortals and was chained to a Caucasian peak by Kratos and Bia; freed at last by Heracles.',
    undoneBy: ['zeus', 'kratos'],
  },
  campe: {
    id: 'campe',
    name: 'Campe',
    epithet: 'Jailer of Tartarus',
    faction: 'titan',
    parents: ['tartarus', 'gaia'],
    myth: 'The she-dragon Cronus set to guard the Cyclopes and Hundred-Handers in Tartarus; Zeus slew her to free them, and their thunderbolts and stones won him the war.',
    undoneBy: ['zeus'],
  },

  // ---------------------------------------------------------------- olympians
  zeus: {
    id: 'zeus',
    name: 'Zeus',
    epithet: 'Cloud-Gatherer, Father of gods and men',
    faction: 'olympian',
    parents: ['cronus', 'rhea'],
    myth: 'Freed his swallowed siblings, freed the Cyclopes from Campe, and cast the Titans into Tartarus. Protector of guests and suppliants: he counts the killing of the helpless as a crime against himself.',
  },
  poseidon: {
    id: 'poseidon',
    name: 'Poseidon',
    epithet: 'Earth-Shaker',
    faction: 'olympian',
    parents: ['cronus', 'rhea'],
    myth: 'Lord of the sea and father of monsters and heroes alike: of Polyphemus, of Theseus, of the bull that begot the Minotaur. He crushed the Giant Polybotes under a torn-off piece of Kos.',
  },
  hades: {
    id: 'hades',
    name: 'Hades',
    epithet: 'the Unseen, Host of the Dead',
    faction: 'olympian',
    parents: ['cronus', 'rhea'],
    myth: 'Received the underworld when the brothers drew lots. Every shade a hero leaves behind arrives at his gates, and he keeps the ledger.',
  },
  athena: {
    id: 'athena',
    name: 'Athena',
    epithet: 'Grey-Eyed, Guardian of the city',
    faction: 'olympian',
    parents: ['zeus', 'Metis'],
    myth: 'Born in armour from the head of Zeus. In the Gigantomachy she buried Enceladus under Sicily and flayed Pallas for his skin. Patron of Athens, Theseus, Heracles and every clever hero.',
  },
  apollo: {
    id: 'apollo',
    name: 'Apollo',
    epithet: 'Far-Shooter',
    faction: 'olympian',
    parents: ['zeus', 'Leto'],
    myth: 'Slew the Python at Delphi and shot the Giant Ephialtes in the left eye while Heracles took the right. Father or patron of Orpheus, whose lyre was his gift.',
  },
  artemis: {
    id: 'artemis',
    name: 'Artemis',
    epithet: 'Lady of the Wild',
    faction: 'olympian',
    parents: ['zeus', 'Leto'],
    myth: 'Sent the she-bear that suckled the abandoned infant Atalanta, and later the Calydonian Boar to punish a king who forgot her sacrifice.',
  },
  ares: {
    id: 'ares',
    name: 'Ares',
    epithet: 'Sacker of cities',
    faction: 'olympian',
    parents: ['zeus', 'Hera'],
    myth: 'God of the bloody side of war, once imprisoned in a bronze jar by the Giants Otus and Ephialtes for thirteen months. He prefers heroes who do not count the dead.',
  },
  hephaestus: {
    id: 'hephaestus',
    name: 'Hephaestus',
    epithet: 'the Smith',
    faction: 'olympian',
    parents: ['Hera'],
    myth: 'Killed the Giant Mimas with missiles of molten iron; his bronze automata guard the halls of the gods.',
  },
  kratos: {
    id: 'kratos',
    name: 'Kratos',
    epithet: 'Strength, son of Styx',
    faction: 'olympian',
    parents: ['Pallas', 'styx'],
    myth: 'Personified Strength, brother of Bia, Zelus and Nike; the first to take Zeus\u2019 side against the Titans and the hand that chained Prometheus. A god who serves the throne, not the law.',
  },

  // ---------------------------------------------------------------- giants and Typhon's brood
  porphyrion: {
    id: 'porphyrion',
    name: 'Porphyrion',
    epithet: 'King of the Giants',
    faction: 'giant',
    parents: ['gaia', 'uranus'],
    myth: 'Greatest of the Giants, who hurled the island of Delos at the gods and lunged at Hera; Zeus struck him with the thunderbolt and Heracles finished him with an arrow, for a Giant could only die to a god and a mortal together.',
    undoneBy: ['zeus', 'heracles'],
  },
  alcyoneus: {
    id: 'alcyoneus',
    name: 'Alcyoneus',
    epithet: 'the Deathless of Pallene',
    faction: 'giant',
    parents: ['gaia', 'uranus'],
    myth: 'Immortal as long as he stood on his native soil; Athena told Heracles to drag him across the border of Pallene, where he died.',
    undoneBy: ['heracles', 'athena'],
  },
  enceladus: {
    id: 'enceladus',
    name: 'Enceladus',
    epithet: 'the Buried',
    faction: 'giant',
    parents: ['gaia', 'uranus'],
    myth: 'Fled the battle and was pinned beneath Sicily by Athena; Etna burns where he breathes.',
    undoneBy: ['athena'],
  },
  polybotes: {
    id: 'polybotes',
    name: 'Polybotes',
    epithet: 'the Drowned',
    faction: 'giant',
    parents: ['gaia', 'uranus'],
    myth: 'Chased across the sea by Poseidon, who tore off a piece of Kos and buried him under it; the island Nisyros is his tomb.',
    undoneBy: ['poseidon'],
  },
  typhon: {
    id: 'typhon',
    name: 'Typhon',
    epithet: 'Father of Monsters',
    faction: 'giant',
    parents: ['gaia', 'tartarus'],
    myth: 'Gaia\u2019s last child, born to avenge the Giants; a hundred serpent heads and a voice of every beast. Zeus buried him under Etna. With Echidna he fathered the Hydra, Cerberus, the Chimera and the Nemean Lion.',
    undoneBy: ['zeus'],
  },
  echidna: {
    id: 'echidna',
    name: 'Echidna',
    epithet: 'Mother of Monsters',
    faction: 'giant',
    parents: ['Phorcys', 'Ceto'],
    myth: 'Half nymph, half serpent, living in a cave under the earth; bore Typhon\u2019s brood and outlived most of them.',
  },
  hydra: {
    id: 'hydra',
    name: 'the Hydra of Lerna',
    epithet: 'Nine-Headed',
    faction: 'giant',
    parents: ['typhon', 'echidna'],
    myth: 'Raised by Hera to kill Heracles; two heads grew where one was cut until Iolaus burned the stumps. Heracles buried the immortal head under a rock and dipped his arrows in her venom.',
    undoneBy: ['heracles'],
  },
  earthborn: {
    id: 'earthborn',
    name: 'the Gegenees',
    epithet: 'Earthborn',
    faction: 'giant',
    parents: ['gaia'],
    myth: 'Six-armed sons of Gaia who ambushed the Argonauts on the Bear Mountain and were shot down by Heracles.',
    undoneBy: ['heracles'],
  },

  // ---------------------------------------------------------------- monsters of the Olympian order
  minotaur: {
    id: 'minotaur',
    name: 'Asterion',
    epithet: 'the Minotaur',
    faction: 'olympian',
    parents: ['Pasiphae', 'the Cretan Bull'],
    myth: 'Born of Poseidon\u2019s curse on Minos: the queen loved the bull the god had sent. Minos hid him in Daedalus\u2019 labyrinth and fed him Athenian youths until Theseus, son of Poseidon, killed him with Ariadne\u2019s thread.',
    undoneBy: ['theseus'],
  },
  polyphemus: {
    id: 'polyphemus',
    name: 'Polyphemus',
    epithet: 'the Cyclops',
    faction: 'olympian',
    parents: ['poseidon', 'Thoosa'],
    myth: 'Son of Poseidon who ate Odysseus\u2019 men and was blinded with a heated olive stake; his father\u2019s wrath followed the hero for ten years.',
    undoneBy: ['Odysseus'],
  },
  cyclops: {
    id: 'cyclops',
    name: 'the Cyclopes',
    epithet: 'Brontes, Steropes and Arges',
    faction: 'olympian',
    parents: ['uranus', 'gaia'],
    myth: 'Freed from Tartarus by Zeus when he slew Campe; forged the thunderbolt, Poseidon\u2019s trident and Hades\u2019 helm of darkness in return.',
  },
  automaton: {
    id: 'automaton',
    name: 'the Bronze Automata',
    epithet: 'Hephaestus\u2019 handiwork',
    faction: 'olympian',
    parents: ['hephaestus'],
    myth: 'Golden handmaidens, bronze tripods and the giant Talos: Hephaestus\u2019 servants of metal that guard what the gods value.',
  },

  // ---------------------------------------------------------------- sons and daughters of gods (the playable heroes)
  heracles: {
    id: 'heracles',
    name: 'Heracles',
    epithet: 'son of Zeus',
    faction: 'olympian',
    parents: ['zeus', 'Alcmene'],
    myth: 'Born so that the gods could win the Gigantomachy: an oracle said the Giants would fall only to a god and a mortal together. Strangled the Hydra, dragged Alcyoneus from Pallene, shot Porphyrion, freed Prometheus.',
  },
  achilles: {
    id: 'achilles',
    name: 'Achilles',
    epithet: 'son of Thetis',
    faction: 'olympian',
    parents: ['Peleus', 'Thetis'],
    myth: 'Zeus desired the sea-nymph Thetis but Prometheus foretold her son would outgrow his father, so she was married to a mortal; her son became the greatest of the Greeks at Troy and died to Apollo\u2019s guided arrow.',
    undoneBy: ['apollo'],
  },
  atalanta: {
    id: 'atalanta',
    name: 'Atalanta',
    epithet: 'nursed by Artemis\u2019 bear',
    faction: 'olympian',
    parents: ['Iasus', 'Clymene'],
    myth: 'Exposed at birth for being a girl, suckled by a she-bear Artemis sent; drew first blood on the Calydonian Boar and sailed, some say, with the Argonauts.',
  },
  orpheus: {
    id: 'orpheus',
    name: 'Orpheus',
    epithet: 'son of Calliope',
    faction: 'olympian',
    parents: ['apollo', 'Calliope'],
    myth: 'His lyre, Apollo\u2019s gift, charmed stones and beasts; he walked living into Hades for Eurydice and softened Persephone\u2019s heart. The nekyia is his road.',
  },
  theseus: {
    id: 'theseus',
    name: 'Theseus',
    epithet: 'son of Poseidon',
    faction: 'olympian',
    parents: ['poseidon', 'Aethra'],
    myth: 'Killed the Minotaur, his half-brother by the sea, and later sat in Hades\u2019 chair of forgetfulness until Heracles pulled him free.',
  },

  // ---------------------------------------------------------------- the mortal world
  polis: {
    id: 'polis',
    name: 'the Polis',
    epithet: 'the ruined city',
    faction: 'mortal',
    parents: [],
    myth: 'A city of the Iron Age, whose people remember the Golden Age under Cronus as a story and the wrath of the gods as a fact.',
  },
  labyrinth: {
    id: 'labyrinth',
    name: 'the Labyrinth of Knossos',
    epithet: 'Daedalus\u2019 prison',
    faction: 'olympian',
    parents: ['Daedalus'],
    myth: 'Built to hide the Minotaur; its maker was later imprisoned in it and flew out on wings of wax. Under Crete, Zeus himself was hidden from Cronus as a child.',
  },
};

export function loreOf(id: string | undefined): LoreEntry | undefined {
  return id ? LORE[id] : undefined;
}

function nameOf(id: string): string {
  return LORE[id]?.name ?? id;
}

/** "Porphyrion, King of the Giants — child of Gaia and Uranus; undone by Zeus and Heracles." */
export function loreBrief(id: string): string {
  const e = LORE[id];
  if (!e) return id;
  const parents = e.parents.length ? `; child of ${e.parents.map(nameOf).join(' and ')}` : '';
  const undone = e.undoneBy?.length ? `; undone by ${e.undoneBy.map(nameOf).join(' and ')}` : '';
  return `${e.name}, ${e.epithet}${parents}${undone}.`;
}

/**
 * The real relationship between two lore ids, if the sources give one:
 * "child of", "parent of", "sibling of", "slayer of", "slain by", "kin of", or null.
 */
export function kinship(a: string, b: string): string | null {
  const ea = LORE[a];
  const eb = LORE[b];
  if (!ea || !eb || a === b) return null;
  if (ea.parents.includes(b)) return 'child of';
  if (eb.parents.includes(a)) return 'parent of';
  if (ea.undoneBy?.includes(b)) return 'undone by';
  if (eb.undoneBy?.includes(a)) return 'slayer of';
  if (ea.parents.some((p) => eb.parents.includes(p))) return 'sibling of';
  if (ea.faction === eb.faction && ea.faction !== 'mortal') return 'kin of';
  return null;
}

/** Everything a prompt needs about one speaker facing one hero: their entry, the hero's, and the link between them. */
export function loreContext(speakerLoreId: string | undefined, heroLoreId: string | undefined): string[] {
  const out: string[] = [];
  if (speakerLoreId && LORE[speakerLoreId]) out.push(loreBrief(speakerLoreId) + ' ' + LORE[speakerLoreId].myth);
  if (heroLoreId && LORE[heroLoreId]) out.push(loreBrief(heroLoreId) + ' ' + LORE[heroLoreId].myth);
  if (speakerLoreId && heroLoreId) {
    const k = kinship(speakerLoreId, heroLoreId);
    if (k) out.push(`Link: ${nameOf(speakerLoreId)} is ${k} ${nameOf(heroLoreId)}.`);
  }
  return out;
}
