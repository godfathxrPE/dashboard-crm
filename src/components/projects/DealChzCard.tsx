'use client';

import Link from 'next/link';
import { Loader2, ScanBarcode } from 'lucide-react';
import { RailCard } from '@/components/shared/RailCard';
import { ChzBadge } from '@/components/shared/ChzBadge';
import { useCompanyChz } from '@/lib/hooks/use-company-chz';
import { resolveChzProfile } from '@/lib/domain/chz-profile';
import { chzStatusLabel, CHZ_SNAPSHOT_DATE } from '@/lib/data/chz-groups';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-DEAL-CHZ-1: маркировочный профиль на карточке СДЕЛКИ.
//
// Профиль уже собран (`companies.chz_groups`, 123) и показывался только на
// карточке компании и в лиде. Разговор и КП идут на сделке — сюда он и приходит.
//
// Язык статусов один на весь продукт: `ChzBadge` и нейтральный тег для сирот —
// те же, что в `CompanySidebar`. Своих цветов и своих формулировок здесь нет
// намеренно: два языка про маркировку означали бы, что продавец читает один и
// тот же факт по-разному на двух экранах.
//
// Правка профиля живёт в `CompanyModal` — профиль принадлежит КОМПАНИИ, не
// сделке. Карточка только ссылается туда: второй ввод = второй источник истины.
// ═══════════════════════════════════════════════════════

/** Подпись мелким по низу карточки: откуда цифра и на какое число. */
function SnapshotNote() {
  return (
    <p className="mt-3 text-xs text-text-dim">Справочник на {CHZ_SNAPSHOT_DATE}</p>
  );
}

function ClarifyLink({ companyId }: { companyId: string }) {
  return (
    <Link
      href={`/companies/${companyId}`}
      className="text-xs text-accent transition-colors hover:underline"
    >
      Уточнить в карточке компании
    </Link>
  );
}

export function DealChzCard({ project }: { project: Project }) {
  const companyId = project.company_id;
  const { data, isLoading, isError, error } = useCompanyChz(companyId);

  // У сделки нет компании — говорить о её маркировке нечего. Не «пустое
  // состояние», а отсутствие предмета: карточки быть не должно вовсе.
  if (!companyId) return null;

  if (isLoading) {
    return (
      <RailCard icon={ScanBarcode} title="Честный Знак">
        <div className="flex items-center justify-center py-3">
          <Loader2 size={16} className="animate-spin text-accent" />
        </div>
      </RailCard>
    );
  }

  if (isError) {
    return (
      <RailCard icon={ScanBarcode} title="Честный Знак">
        <p className="py-1 text-xs text-red">
          Не удалось загрузить профиль маркировки
          {error instanceof Error ? `: ${error.message}` : ''}
        </p>
      </RailCard>
    );
  }

  // Компания есть у сделки, но её строка не читается (удалена либо закрыта RLS).
  // Молчим: «не выяснено» было бы утверждением о данных, которых мы не видели.
  if (!data) return null;

  const profile = resolveChzProfile(data.chz_groups, data.okved);

  // ⚠️ `resolveChzProfile` схлопывает NULL и `[]` в один `source: 'none'` — ему
  // это и не нужно, он резолвит ГРУППЫ. Различие живёт в сырой колонке, и здесь
  // оно обязано быть восстановлено: NULL — «не спросили», `[]` — «спросили,
  // ответ отрицательный». Это разная работа продавца и разный следующий шаг.
  const asked = Array.isArray(data.chz_groups);

  if (profile.source === 'none') {
    return (
      <RailCard icon={ScanBarcode} title="Честный Знак">
        {asked ? (
          <p className="text-sm text-text-main">Групп маркировки нет</p>
        ) : (
          <>
            <p className="text-sm text-text-mute">Не выяснено</p>
            <div className="mt-1.5">
              <ClarifyLink companyId={companyId} />
            </div>
          </>
        )}
        <SnapshotNote />
      </RailCard>
    );
  }

  return (
    <RailCard
      icon={ScanBarcode}
      title="Честный Знак"
      badge={
        profile.source === 'declared' ? (
          <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
            подтверждено
          </span>
        ) : (
          // Гипотеза, поданная как факт, уедет в КП. Пометка стоит в шапке,
          // рядом с названием карточки, а не сноской под списком.
          <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
            гипотеза по ОКВЭД
          </span>
        )
      }
    >
      <div className="space-y-2">
        {profile.groups.map((g) => (
          <div key={g.group}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-main">{g.group}</span>
              <ChzBadge status={g.status} label={chzStatusLabel(g)} />
            </div>
            {g.note && <p className="mt-0.5 text-xs text-text-mute">{g.note}</p>}
          </div>
        ))}
      </div>

      {/* Сироты: имена из БД, которых нет в справочнике-снапшоте (группу
          переименовали после снимка). Нейтральный тег, а НЕ `ChzBadge` — тот же
          приём, что в `CompanySidebar`: статуса и даты обязательности у сироты
          нет, и цветной бейдж соврал бы про обязательность. Проглотить молча
          тоже нельзя — это данные, которые ввёл человек. */}
      {profile.unknown.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1.5 text-xs text-text-mute">Нет в справочнике {CHZ_SNAPSHOT_DATE}</p>
          <div className="flex flex-wrap gap-1">
            {profile.unknown.map((name) => (
              <span
                key={name}
                data-tag
                className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <SnapshotNote />
      <div className="mt-1.5">
        <ClarifyLink companyId={companyId} />
      </div>
    </RailCard>
  );
}
