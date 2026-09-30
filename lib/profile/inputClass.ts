/** Shared form control styles for profile editors (matches onboarding).
 *
 * Every class here has to survive Tailwind's content scan, so this file is listed in
 * tailwind.config.ts `content`. Without that the dark: half of each pair is dropped and
 * the controls render as white boxes on the dark card — see the note in that config.
 */
export const profileInputClass = [
  // Box
  "w-full rounded-xl border px-4 py-3 text-sm shadow-sm transition",

  // Light
  "border-black/12 bg-white text-black placeholder:text-black/30",

  // Dark. The surface sits a step BELOW the card (#161b27) so the field reads as a well
  // rather than a raised tile, and the border goes to 15% because an 8% hairline is
  // invisible against it — that was the other half of why these fields looked unstyled.
  "dark:border-white/15 dark:bg-[#0f1623] dark:text-white dark:placeholder:text-white/30",

  // Native chrome: select popups, the number spinner on Roster size, and the date/time
  // pickers follow color-scheme, not our classes. `.dark` on <html> already sets this in
  // globals.css; repeating it here keeps the control correct if it is ever rendered
  // inside a light-themed subtree.
  "dark:[color-scheme:dark]",

  // Focus
  "focus:border-[#1f7ae0] focus:outline-none focus:ring-2 focus:ring-[#1f7ae0]/20",
  "dark:focus:border-[#3d8ef0] dark:focus:ring-[#3d8ef0]/30",

  // Chrome paints -webkit-autofill with a light lilac background it will not let a
  // background-color override touch — on this dark card it reproduces the exact white-box
  // bug we just fixed, only for people whose browser remembers their name and phone. An
  // inset shadow large enough to cover the field is the one thing that does win, and
  // text-fill-color is the matching override for the text itself.
  "autofill:shadow-[inset_0_0_0_1000px_#ffffff]",
  "dark:autofill:shadow-[inset_0_0_0_1000px_#0f1623]",
  "autofill:[-webkit-text-fill-color:#000000]",
  "dark:autofill:[-webkit-text-fill-color:#ffffff]",
].join(" ");
