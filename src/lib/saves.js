// Named save files. A person can keep three cities. The name is the label
// they pick ("Training block"), and it is not the theme (Denver, Austin).
// The same Strava runs and the same start date rebuild the same skyline,
// so a save is a snapshot, not a second copy of the rules.
// This file is safe to import from the browser: it does not touch the
// database or the filesystem.

export const MAX_SAVES = 3;
export const NAME_MAX = 24;

export class SaveRejected extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SaveRejected";
    this.status = status;
  }
}

// Blank names are refused. Extra spaces collapse so "  CJ's   Denver "
// is stored as "CJ's Denver" and still counts toward the 24-character cap.
export function cleanName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > NAME_MAX) return null;
  if (/[\u0000-\u001f]/.test(name)) return null;
  return name;
}

// Both stores call this before inserting. The cap lives here so a route
// cannot save a fourth city, and so a blank name never reaches the table.
// replaceId must be one of this user's cities. The slot number is reused
// so the three positions stay 1, 2, and 3.
export function planCreate(saves, input) {
  const name = cleanName(input?.name);
  if (!name) throw new SaveRejected("Name the city first.");
  const list = saves || [];
  if (input?.replaceId) {
    const victim = list.find((save) => save.id === input.replaceId);
    if (!victim) throw new SaveRejected("That city is not one of yours.");
    return { name, slot: Number(victim.slot), replaceId: victim.id };
  }
  const slot = nextSlot(list);
  if (!slot) {
    throw new SaveRejected("Three cities are already saved. Choose one to replace.", 409);
  }
  return { name, slot, replaceId: null };
}

// Slots are 1, 2, and 3. A deleted city leaves a hole, and the next new
// city fills the lowest hole so the cap stays at three.
export function nextSlot(saves) {
  const used = new Set((saves || []).map((save) => Number(save.slot)));
  for (let slot = 1; slot <= MAX_SAVES; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

// One line under the name on the resume list: where the miles came from.
export function saveLabel(save) {
  if (!save) return "";
  if (save.demo || save.startMode === "demo") return "DEMO";
  if (save.startMode === "date" && save.startDate) return `FROM ${save.startDate}`;
  return "ALL HISTORY";
}
