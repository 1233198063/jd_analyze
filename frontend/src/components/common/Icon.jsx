import clsx from "clsx";

/**
 * Renders a glyph from the Material Symbols Outlined web font (loaded in index.html) by name —
 * the app's single icon source, standing in for every emoji/dingbat that used to be sprinkled
 * through JSX as raw unicode.
 */
export default function Icon({ name, size = 18, className, filled = false, weight = 400 }) {
  return (
    <span
      className={clsx("material-symbols-outlined align-middle select-none", className)}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
