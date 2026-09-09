"use client";

import { useRef, useState } from "react";

/**
 * Keeps a submit button disabled from the first click until the page actually goes away.
 *
 * Two guards, because they close different holes:
 *
 *   - the ref closes the SAME-TICK double click. React state updates are asynchronous, so
 *     two clicks dispatched in one tick both read `busy === false` and both fire.
 *   - the terminal "done" state closes the RSC-TRANSITION window. `router.push()` returns
 *     immediately; the server component tree then takes as long as it takes. Code shaped
 *     like `finally { setLoading(false) }` re-enables the button during exactly that gap,
 *     which is when the user — seeing no feedback — clicks again.
 *
 * That second case is not cosmetic here. A double submit on the deliverable proof form
 * reaches the submit route twice, and its cleanup pass deletes the first submission's S3
 * objects and thumbnails.
 *
 * THE RULE: never release() in a `finally` when the happy path navigates. finish() is
 * terminal on purpose — the unmount is what "re-enables" the button. release() is for
 * error paths only, where the user really does need to try again on this same page.
 */
export function useSubmitGuard() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const inFlight = useRef(false);

  return {
    /** True from the first click onward — bind to `disabled`. */
    busy: state !== "idle",

    /** Claim the submit. Returns false if one is already in flight; bail out of the handler. */
    begin: () => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setState("busy");
      return true;
    },

    /** TERMINAL. Call immediately before router.push / location.href. Never re-enables. */
    finish: () => setState("done"),

    /** Error paths only. Hands the form back to the user. */
    release: () => {
      inFlight.current = false;
      setState("idle");
    },
  };
}
