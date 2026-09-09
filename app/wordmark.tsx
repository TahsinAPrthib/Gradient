/**
 * The Gradient wordmark — the product name rendered as an actual gradient.
 *
 * This is the app's single piece of colour. Every other surface is zinc
 * neutral, which is what lets the wordmark carry the identity on its own: if
 * other elements start competing for attention, this stops reading as a
 * signature and starts reading as noise.
 *
 * How the effect works: the element paints a linear-gradient *background*,
 * `bg-clip-text` crops that background to the glyph shapes, and
 * `text-transparent` hides the normal text fill so the cropped gradient shows
 * through. All three are required — drop any one and you get either flat text
 * or a coloured rectangle.
 *
 * The dark-mode stops are deliberately lighter (400 vs 600). The same mid-tone
 * ramp that reads clearly on white turns muddy on near-black, so each theme
 * gets stops chosen against its own background.
 *
 * Not a client component: it has no interactivity, so it renders on the server
 * and ships no JavaScript.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 bg-clip-text font-semibold tracking-tight text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-sky-400 ${className}`}
    >
      Gradient
    </span>
  );
}
