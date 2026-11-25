// Placeholder seal (a 24-spoke wheel). Replace with the department's official
// emblem file when you have the approved artwork.
export default function PortalEmblem({ size = 40 }) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="none" stroke="#123a66" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="17" fill="none" stroke="#123a66" strokeWidth="1" />
      {spokes.map((angle) => (
        <line
          key={angle}
          x1="24"
          y1="24"
          x2="24"
          y2="8.5"
          stroke="#123a66"
          strokeWidth="1.1"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="4" fill="#123a66" />
    </svg>
  );
}
