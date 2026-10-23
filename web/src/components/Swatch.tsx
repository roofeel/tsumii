export function Swatch({ hex, size = 14, round = false }: { hex: string; size?: number; round?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${round ? 'rounded-full' : 'rounded-[4px]'}`}
      style={{ width: size, height: size, background: hex, boxShadow: 'inset 0 0 0 1px rgba(34,34,34,0.15)' }}
    />
  );
}
