'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Rocket, Clock, Loader2, ChevronLeft, Check } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { createClient } from '@/lib/supabase/client';
import { deliveryKindLabel } from '@/lib/constants/delivery-phases';

// ═══════════════════════════════════════════════════════
// S-WIN-WIZARD-1 — осознанный handoff sales → delivery.
// Заменяет «голую» панель выбора шаблона: контур (создавать / пока
// нет) + шаблон (kind по direction) + выбор owner/РП нового внедрения.
// RPC spawn_delivery_project(044) резолвит шаблон по direction+kind
// внутри; owner = COALESCE(p_owner_id, deal.owner_id, auth.uid()).
// ═══════════════════════════════════════════════════════

type DeliveryKind = 'launch' | 'experiment';
type WizardStep = 'contour' | 'form';

interface SpawnWizardProps {
  dealId: string;
  dealDirection: 'erp' | 'iiot' | null;
  /** Дефолтный РП — owner сделки; null → RPC подставит COALESCE. */
  defaultOwnerId?: string | null;
  onCreated: (newId: string) => void;
  onClose: () => void;
}

export function SpawnWizard({
  dealId,
  dealDirection,
  defaultOwnerId,
  onCreated,
  onClose,
}: SpawnWizardProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<WizardStep>('contour');
  // D1: у ERP один шаблон — «Эксперимент» создал бы пустую доску (ловушка)
  const kinds: readonly DeliveryKind[] =
    dealDirection === 'erp' ? (['launch'] as const) : (['launch', 'experiment'] as const);
  const [kind, setKind] = useState<DeliveryKind>('launch');
  const [ownerId, setOwnerId] = useState<string | null>(defaultOwnerId ?? null);
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('spawn_delivery_project', {
      p_deal_id: dealId,
      p_kind: kind,
      p_template_id: undefined,
      p_owner_id: ownerId ?? undefined,
    });
    setPending(false);
    if (error) {
      // 42501 — доступ/owner не в орге; P0001 — не won / нет пайплайна; 22023 — шаблон/kind
      const msg =
        error.code === '42501'
          ? 'Недостаточно прав: внедрение создаёт владелец сделки или админ организации, а назначаемый РП должен быть членом организации'
          : error.code === 'P0001'
          ? 'Внедрение создаётся только из выигранной сделки при настроенной воронке проектов'
          : error.code === '22023'
          ? 'Не найден шаблон внедрения для выбранного типа'
          : error.message;
      toast.error(msg);
      return;
    }
    qc.invalidateQueries({ queryKey: ['projects'] });
    toast.success('Проект внедрения создан');
    onCreated(data as string);
  }

  // ─── Шаг «контур» ───
  if (step === 'contour') {
    return (
      <Modal
        title="Создание проекта внедрения"
        description="Выигранная сделка — можно передать её в производство"
        onClose={onClose}
      >
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setStep('form')}
            className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent-l/40 p-4 text-left
                       transition-colors hover:border-accent hover:bg-accent-l/60
                       focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
              <Rocket size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-main">Создать внедрение</span>
              <span className="mt-0.5 block text-xs text-text-dim">
                Выбрать шаблон и назначить руководителя проекта
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left
                       transition-colors hover:border-border2 hover:bg-surface-hover
                       focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface2 text-text-mute">
              <Clock size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-main">Пока не создавать</span>
              <span className="mt-0.5 block text-xs text-text-dim">
                Сделка останется выигранной — внедрение можно создать позже
              </span>
            </span>
          </button>
        </div>
      </Modal>
    );
  }

  // ─── Шаг «форма создания» ───
  return (
    <Modal
      title="Настройка внедрения"
      description="Шаблон и руководитель проекта"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => setStep('contour')}
            disabled={pending}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-text-dim
                       transition-colors hover:bg-surface-hover hover:text-text-main disabled:opacity-50"
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white
                       shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Создать внедрение
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Шаблон / kind */}
        <div>
          <span className="mb-2 block text-xs font-medium text-text-dim">Шаблон внедрения</span>
          <div className="flex flex-col gap-2">
            {kinds.map((k) => {
              const active = k === kind;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={active}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left
                             transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                               active
                                 ? 'border-accent bg-accent-l/50'
                                 : 'border-input bg-surface2 hover:border-border2'
                             }`}
                >
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${active ? 'text-accent' : 'text-text-main'}`}>
                      {deliveryKindLabel(k, dealDirection)}
                      {dealDirection === 'erp' && ' (6 этапов)'}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-dim">
                      {k === 'launch'
                        ? dealDirection === 'erp'
                          ? 'Обследование → Моделирование → Проектирование → Разработка → Внедрение → Эксплуатация'
                          : 'Полный запуск — весь цикл внедрения'
                        : 'Пилот / эксперимент — сокращённый контур'}
                    </span>
                  </span>
                  {active && <Check size={16} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Owner / РП */}
        <div>
          <AssigneeSelect
            value={ownerId}
            onChange={setOwnerId}
            label="Руководитель проекта"
            placeholder="Владелец сделки (по умолчанию)"
          />
          <p className="mt-1 text-[11px] text-text-mute">
            По умолчанию — владелец сделки. Можно назначить другого члена организации.
          </p>
        </div>
      </div>
    </Modal>
  );
}
