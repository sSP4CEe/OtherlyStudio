// Character and place canon. A later episode that returns to Broughton reuses these entries instead of redesigning
// them; a new episode adds its own entries here before it adds drawings.
// All names, faces and stories are original to Otherly.
import type { Outfit } from "../../engine/cast/toon";
import { KID, OFFICER, PARENT, RIFLEMAN } from "../../engine/cast/toon";

export type Character = {
  id: string;
  name: string;
  role: string;
  /** the drawing outfit record used by engine/cast/toon.ts */
  outfit: Outfit;
  /** fixed visual quirks the drawings must keep */
  notes: string;
};

export const CHARACTERS: Record<string, Character> = {
  whistler: {
    id: "whistler",
    name: "The Whistler",
    role: "front-rank soldier; the tune that starts it all",
    outfit: { ...RIFLEMAN, skin: "#ffe2c2" },
    notes: "green rifleman coat, shako, whistle grin; front-on in close-ups",
  },
  officer: {
    id: "officer",
    name: "The Officer",
    role: "commands the column; loses the argument with physics",
    outfit: OFFICER,
    notes: "navy-green coat, tall shako, gold buttons, red sash, moustache; carries the sign at the end",
  },
  kid: {
    id: "kid",
    name: "The Kid",
    role: "park swing, present tense",
    outfit: KID,
    notes: "orange jacket, red cap, blue trousers; draw from the side while on the swing",
  },
  parent: {
    id: "parent",
    name: "The Parent",
    role: "pushes the swing; the reason the story is being told",
    outfit: PARENT,
    notes: "violet jacket, brown hair; always 3/4 from the child's side",
  },
};

export type Place = {
  id: string;
  name: string;
  /** the set module that builds it */
  set: string;
  notes: string;
};

export const PLACES: Record<string, Place> = {
  broughton: {
    id: "broughton",
    name: "Broughton-on-the-Water",
    set: "src/episodes/broughton/town.ts",
    notes: "1831 riverside town: twin banks, chain bridge at z = +-27, park with swing on the near bank",
  },
  park: {
    id: "park",
    name: "The Swing Park",
    set: "src/episodes/broughton/town.ts",
    notes: "near bank, x 50..92, z -96..-56; seven trees, hedge line at z = -57, lantern at (64.5, -71)",
  },
  mill: {
    id: "mill",
    name: "The Mill",
    set: "src/episodes/broughton/town.ts",
    notes: "near-bank brick block at x -58..-28, z -82..-70, two smoking chimneys",
  },
};

/** Which canon entries an episode uses; keeps a returning episode consistent. */
export type EpisodeCast = { characters: string[]; places: string[] };
