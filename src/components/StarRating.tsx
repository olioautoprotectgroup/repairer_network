/**
 * Stars as Unicode glyphs, not an icon library or inline SVG -- this repo
 * has neither, and uses the bare `↗` glyph for external links, so ★/☆ is
 * the consistent choice. Colour is `highlight` (the brand accent already
 * used for the selected-card and needs-review states).
 */

const FULL = "★";
const EMPTY = "☆";

/** Read-only display. Rounds to the nearest whole star for the glyphs; the
 * exact average is shown alongside by the caller. */
export function StarRatingDisplay({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="text-highlight" aria-label={`${rating} out of 5 stars`}>
      {FULL.repeat(filled)}
      <span className="text-slate-300">{EMPTY.repeat(5 - filled)}</span>
    </span>
  );
}

interface InputProps {
  value: number | null;
  onChange: (rating: number) => void;
  /** Rendered as the radio group's name; must be unique per form on the page. */
  name: string;
}

/**
 * A radio group styled as stars. Radios rather than buttons so the control
 * is keyboard- and screen-reader-navigable for free, and so the browser's
 * own `required` validation applies -- the same HTML-native validation
 * approach the Manage Repairers form takes.
 */
export function StarRatingInput({ value, onChange, name }: InputProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <label
          key={star}
          className="cursor-pointer text-lg leading-none"
          title={`${star} star${star === 1 ? "" : "s"}`}
        >
          <input
            type="radio"
            name={name}
            value={star}
            required
            checked={value === star}
            onChange={() => onChange(star)}
            className="sr-only"
          />
          <span
            className={
              value != null && star <= value
                ? "text-highlight"
                : "text-slate-300 hover:text-highlight/60"
            }
          >
            {value != null && star <= value ? FULL : EMPTY}
          </span>
        </label>
      ))}
    </span>
  );
}
