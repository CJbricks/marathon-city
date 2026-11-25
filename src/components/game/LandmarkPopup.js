"use client";

// The card that opens when someone taps a landmark.
//
// It is HTML on top of the canvas, the same way the records panel is, so
// a drag does not carry it and Share my city does not paint it into the
// PNG. The scale animation starts at the building (transform-origin is
// that point, even when the point sits outside the card) and steps in
// four jumps so it stays pixelated instead of easing like a window.
//
// The words come from landmarkNames.js. This file does not fetch. A city
// opened by code already has the run on the landmark, copied from the
// activities that were saved with that city. Asking Strava again would
// need the owner's token, which this phone may not have.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { describeRun, landmarkName } from "@/lib/landmarkNames";
import { placeLandmarkPopup } from "./landmarkHit";

const CARD_W = 232;

export default function LandmarkPopup({ theme, landmarkKey, run, anchorX, anchorY, onClose }) {
  const title = landmarkName(theme, landmarkKey);
  const detail = describeRun(run);
  const cardRef = useRef(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [height, setHeight] = useState(150);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    const frame = node?.parentElement;
    if (!frame) return;
    const read = () => setView({ w: frame.clientWidth, h: frame.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const next = cardRef.current?.offsetHeight;
    if (next && next !== height) setHeight(next);
  }, [height, title, detail.linked, detail.distance, detail.pace, detail.url]);

  if (!title) return null;
  const viewW = view.w || 320;
  const viewH = view.h || 480;
  const placed = placeLandmarkPopup({
    anchorX,
    anchorY,
    width: CARD_W,
    height,
    viewW,
    viewH,
  });

  return (
    <>
      <div className="landmark-scrim" onClick={onClose} />
      <div
        ref={cardRef}
        className="landmark-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landmark-title"
        data-landmark={landmarkKey}
        style={{
          left: placed.left,
          top: placed.top,
          width: placed.width,
          transformOrigin: `${placed.originX}px ${placed.originY}px`,
        }}
      >
        <div className="records-head">
          <p id="landmark-title" className="landmark-title">
            {title}
          </p>
          <button
            type="button"
            className="pixel-btn records-x"
            aria-label="Close landmark"
            onClick={onClose}
          >
            X
          </button>
        </div>
        {detail.linked ? (
          <>
            <p className="landmark-date">{detail.date}</p>
            {detail.distance ? <p className="landmark-stat">{detail.distance}</p> : null}
            {detail.pace ? <p className="landmark-stat">{detail.pace}</p> : null}
            {detail.url ? (
              <a className="pr-link" href={detail.url} target="_blank" rel="noreferrer">
                View on Strava
              </a>
            ) : (
              <p className="records-status">No Strava page for this run.</p>
            )}
          </>
        ) : (
          <p className="records-status">No run is linked to this landmark yet.</p>
        )}
      </div>
    </>
  );
}
