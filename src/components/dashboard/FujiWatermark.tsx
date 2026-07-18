// W4a: вынесен из DashboardHome — нужен и оставшимся секциям (дедлайны,
// активность), и чарт-чанку OverviewCharts (dynamic), без дублирования.
// ═══════════════════════════════════════════════════════
// Fuji watermark helper
// ═══════════════════════════════════════════════════════

export function FujiWatermark({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className="absolute select-none pointer-events-none"
      aria-hidden="true"
      style={{
        right: 16,
        bottom: 12,
        fontSize: '48px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '2px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: color ?? 'rgba(26,39,68,0.05)',
      }}
    >
      {text}
    </span>
  );
}
