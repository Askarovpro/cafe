import { ICONS, type IconName } from './icons.generated.js';

export type { IconName };

// Renders a HugeIcons glyph. Color follows CSS `color` (currentColor); size in px.
export function Icon({
  name,
  size = 22,
  className,
  style,
}: {
  name: IconName;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ic = ICONS[name];
  return (
    <svg
      viewBox={ic.vb}
      width={size}
      height={size}
      className={className}
      style={style}
      fill="currentColor"
      role="img"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ic.inner }}
    />
  );
}
