// Race-day check. The saved date is a YYYY-MM-DD calendar day. "Today" is
// the device clock's local year, month, and day, the same clock the sky
// uses. UTC would flip the celebration at the wrong hour for someone in
// Denver. An empty date is never race day.

export function localDateString(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isRaceDay(raceDate, now = new Date()) {
  if (!raceDate || typeof raceDate !== "string") return false;
  return raceDate === localDateString(now);
}

export function uniqueLandmarkCount(city) {
  if (!city?.landmarks) return 0;
  return new Set(city.landmarks.map((landmark) => landmark.key)).size;
}
