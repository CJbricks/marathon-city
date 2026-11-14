// Whether a car or a person is hidden by a building sprite.
//
// Each building is one picture, sorted by the front corner of its lot.
// The picture is transparent everywhere the building did not paint, and a
// tall narrow tower paints a shaft, not the whole lot. A walker on the
// sidewalk just beside that shaft is behind the lot, so the tower is drawn
// later, but the transparent pixels do not cover the walker. At the height
// of the roof they look like they are standing on the crown.
//
// If the walker's body touches a nearer sprite's box, they are left out.
// A walker in front of that sprite has a greater depth and is still drawn.
// The same test covers every building and landmark, in Denver and Austin.

export function moverHidden(occluders, x, y, depth, padX = 10, padY = 16) {
  if (!occluders?.length) return false;
  const left = x - padX;
  const right = x + padX;
  const top = y - padY;
  const bottom = y + 4;
  for (let i = 0; i < occluders.length; i += 1) {
    const box = occluders[i];
    if (!(box.depth > depth)) continue;
    if (right < box.x || left > box.x + box.w) continue;
    if (bottom < box.y || top > box.y + box.h) continue;
    return true;
  }
  return false;
}
