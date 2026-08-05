'use client';

import { ClipboardPlus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// S-QUICK-CAPTURE-1: кнопка-триггер поповера быстрого ввода в правой зоне шапки.
// Иконка именно ClipboardPlus, а не Sparkles: Sparkles в проекте уже означает
// AI-воркспейс сделки, и вторым смыслом её нагружать нельзя.

interface QuickCaptureButtonProps {
  onClick: () => void;
  expanded: boolean;
}

export function QuickCaptureButton({ onClick, expanded }: QuickCaptureButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Быстрый ввод"
      aria-expanded={expanded}
      title="Быстрый ввод — вставьте контакты или реквизиты"
      className={cn(
        'p-2 transition-colors',
        expanded ? 'text-text-main' : 'text-text-dim hover:text-text-main',
      )}
    >
      <ClipboardPlus size={16} />
    </button>
  );
}
