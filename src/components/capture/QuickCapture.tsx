'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui-store';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useQuickCapture, type CaptureDuplicate } from '@/lib/hooks/use-quick-capture';
import { useCompanyLookup } from '@/lib/hooks/use-company-lookup';
import { CAPTURE_MAX_CHARS, type CaptureResult } from '@/lib/validators/capture';
import { extractEmail, extractInn } from '@/lib/utils/capture-helpers';
import { okvedToIndustry } from '@/lib/data/okved';
import type { ContactFormValues } from '@/lib/validators/contact';
import type { CompanyFormValues } from '@/lib/validators/company';
import { ContactModal } from '@/components/contacts/ContactModal';
import { CompanyModal } from '@/components/companies/CompanyModal';
import { QuickCaptureButton } from '@/components/capture/QuickCaptureButton';

// ═══════════════════════════════════════════════════════
// S-QUICK-CAPTURE-1 — виджет быстрого ввода.
//
// Текст → AI разбирает поля → открывается ШТАТНАЯ модалка с préfill. Сохранение
// идёт обычным путём модалки (Zod, optimistic-хук, RLS, триггеры): у AI нет и не
// должно быть собственного пути записи в БД.
//
// Реквизиты компании модель не извлекает — ИНН распознаётся чексуммой на клиенте
// (`extractInn`) и уходит в существующий `company-lookup` (ЕГРЮЛ).
// ═══════════════════════════════════════════════════════

type CaptureKind = 'contact' | 'company';

/**
 * Интент, который виджет умеет открыть сам. Всё прочее — спрашиваем у человека.
 *
 * ⚠️ ПРОВЕРКА ПОЛОЖИТЕЛЬНАЯ, А НЕ `!== 'unclear'` (S-TG-TASK-1). Функция
 *    `ai-capture` деплоится ОТДЕЛЬНО от фронта и уже умеет интент `task`, а
 *    ветки открытия `TaskModal` с прифиллом здесь пока нет. При проверке «всё,
 *    что не unclear, — открываем» задача уехала бы в модалку компании: у неё
 *    ветка `else`. Незнакомый интент обязан вести себя как `unclear`.
 */
function openableKind(intent: CaptureResult['intent']): CaptureKind | null {
  return intent === 'contact' || intent === 'company' ? intent : null;
}

/** Непустая строка или null — форма ждёт null, а не ''. */
function blank(value: string | undefined | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function QuickCapture() {
  const router = useRouter();
  const open = useUiStore((s) => s.quickCaptureOpen);
  const toggle = useUiStore((s) => s.toggleQuickCapture);
  const close = useUiStore((s) => s.closeQuickCapture);
  const { data: orgRole } = useOrgRole();
  // Тот же гейт, что у «Действий» палитры (T2): viewer не создаёт сущности —
  // RLS отдала бы 42501 уже на сохранении.
  const canCreate = orgRole != null && orgRole !== 'viewer';

  const { parse, findDuplicate } = useQuickCapture();
  const lookup = useCompanyLookup();

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Разбор, ждущий решения человека: выбор ветки или подтверждение дубля. */
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const [duplicate, setDuplicate] = useState<CaptureDuplicate | null>(null);
  // Préfill'ы держат и данные, и признак «какая модалка открыта». Ссылка стабильна
  // (state), как того требует контракт пропа `prefill`.
  const [contactPrefill, setContactPrefill] = useState<Partial<ContactFormValues> | null>(null);
  const [companyPrefill, setCompanyPrefill] = useState<Partial<CompanyFormValues> | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const busy = parse.isPending || lookup.isPending;

  // Клик мимо и Esc закрывают поповер. Слушатели вешаем только пока он открыт.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const resetOutput = useCallback(() => {
    setError(null);
    setPending(null);
    setDuplicate(null);
  }, []);

  function buildContactPrefill(result: CaptureResult, raw: string): Partial<ContactFormValues> {
    const c = result.contact;
    const phone = blank(c?.phone);
    return {
      first_name: c?.first_name?.trim() ?? '',
      last_name: c?.last_name?.trim() ?? '',
      position: blank(c?.position),
      // Почту берём детерминированно из текста, если модель её не вернула:
      // регулярка тут надёжнее любого разбора.
      email: blank(c?.email) ?? extractEmail(raw),
      // legacy-зеркало; `onSubmit` модалки всё равно перепишет его из phones.
      phone,
      phones: phone ? [{ type: 'mobile' as const, value: phone, is_primary: true }] : [],
      notes: blank(c?.notes),
    };
  }

  async function buildCompanyPrefill(
    result: CaptureResult,
    raw: string,
    inn: string | null,
  ): Promise<Partial<CompanyFormValues>> {
    const co = result.company;
    const phone = blank(co?.phone);
    const base: Partial<CompanyFormValues> = {
      name: co?.name?.trim() ?? '',
      inn,
      email: blank(co?.email) ?? extractEmail(raw),
      website: blank(co?.website),
      // Фактический адрес — только из текста. Юрадрес реестра ниже кладётся в
      // `legal_address` и `address` не трогает (инвариант миграции 102).
      address: blank(co?.address),
      phone,
      phones: phone ? [{ type: 'work' as const, value: phone, is_primary: true }] : [],
      notes: blank(co?.notes),
    };
    if (!inn) return base;

    try {
      const r = await lookup.mutateAsync(inn);
      if (!r.found) return base;
      const industry = okvedToIndustry(r.okved);
      return {
        ...base,
        // Здесь реестр перебивает разбор: название из ЕГРЮЛ — факт, название от
        // модели — догадка по тексту. (В самой карточке правило обратное: там в
        // поле уже лежит имя, введённое человеком, и его реестр не трогает.)
        name: r.short_name?.trim() || base.name,
        legal_name: r.legal_name,
        kpp: r.kpp,
        ogrn: r.ogrn,
        legal_address: r.legal_address,
        inn_status: r.status,
        okved: r.okved,
        industry: industry ?? null,
        // Сверка действительно произошла только что — дата честная.
        inn_verified_at: new Date().toISOString(),
        email: base.email ?? blank(r.emails[0]),
        phones: base.phones?.length
          ? base.phones
          : r.phones.map((value, i) => ({ type: 'work' as const, value, is_primary: i === 0 })),
      };
    } catch {
      // Текст ошибки уже показал глобальный mutationCache.onError. Сбой реестра
      // не повод терять разбор — открываем модалку с тем, что есть.
      return base;
    }
  }

  const openModalFor = useCallback(
    async (result: CaptureResult, kind: CaptureKind) => {
      const raw = text.trim();
      if (kind === 'contact') {
        setContactPrefill(buildContactPrefill(result, raw));
      } else {
        setCompanyPrefill(await buildCompanyPrefill(result, raw, extractInn(raw)));
      }
      resetOutput();
      close();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, close, resetOutput],
  );

  async function runParse() {
    const raw = text.trim();
    if (!raw) return;
    resetOutput();
    try {
      const result = await parse.mutateAsync(raw.slice(0, CAPTURE_MAX_CHARS));
      const dup = findDuplicate(result, extractInn(raw));
      if (dup) {
        setPending(result);
        setDuplicate(dup);
        return;
      }
      const kind = openableKind(result.intent);
      if (!kind) {
        // Ветку выбирает человек — гадать за него нечестно.
        setPending(result);
        return;
      }
      await openModalFor(result, kind);
    } catch (err) {
      // Текст не теряем: он остаётся в textarea, рядом — «Повторить».
      setError(err instanceof Error ? err.message : 'Не удалось разобрать текст');
    }
  }

  function openExisting(dup: CaptureDuplicate) {
    close();
    resetOutput();
    setText('');
    router.push(dup.kind === 'contact' ? `/contacts/${dup.id}` : `/companies/${dup.id}`);
  }

  if (!canCreate) return null;

  const chipClass =
    'rounded-lg border border-border px-2.5 py-1 text-xs text-text-dim transition-colors ' +
    'hover:bg-surface-hover hover:text-text-main';

  return (
    <div className="relative" ref={popoverRef}>
      <QuickCaptureButton onClick={toggle} expanded={open} />

      {open && (
        // Слой — как у дропдауна NotificationBell: z-9999 внутри стекинг-контекста
        // шапки (`relative z-[35]`), см. docs/Z-INDEX.md.
        <div className="absolute right-0 top-full z-[9999] mt-1 w-[22rem] rounded-lg border border-border bg-popover p-3 elevation-3">
          <label htmlFor="quick-capture-input" className="mb-1.5 block text-xs font-semibold text-text-dim">
            Быстрый ввод
          </label>
          <textarea
            id="quick-capture-input"
            autoFocus
            rows={4}
            value={text}
            maxLength={CAPTURE_MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void runParse();
              }
            }}
            placeholder="Вставьте контакты или реквизиты…"
            className="w-full resize-none rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main
                       placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xs text-text-mute">
              {text.length}/{CAPTURE_MAX_CHARS} · Enter — разобрать, Shift+Enter — перенос
            </span>
            <button
              type="button"
              onClick={() => void runParse()}
              disabled={busy || text.trim().length === 0}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium
                         text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {parse.isPending ? 'Разбираю…' : lookup.isPending ? 'Ищу в ЕГРЮЛ…' : 'Разобрать'}
            </button>
          </div>

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-red/40 px-3 py-2 text-xs">
              <AlertTriangle size={13} className="shrink-0 text-red" />
              <span className="text-text-dim">{error}</span>
              <button
                type="button"
                onClick={() => void runParse()}
                className="ml-auto shrink-0 text-accent hover:underline"
              >
                Повторить
              </button>
            </div>
          )}

          {/* Дубль — предлагаем открыть существующее, но не запрещаем создать. */}
          {duplicate && pending && (
            <div className="mt-2 rounded-lg border border-yellow/40 bg-yellow-l px-3 py-2 text-xs">
              <p className="text-text-dim">
                Похоже, это существующая запись:{' '}
                <span className="font-medium text-text-main">{duplicate.label}</span>
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <button type="button" onClick={() => openExisting(duplicate)} className={chipClass}>
                  Открыть
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void openModalFor(
                      pending,
                      openableKind(pending.intent) ?? duplicate.kind,
                    )
                  }
                  className={`${chipClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Всё равно создать
                </button>
              </div>
            </div>
          )}

          {/* Непонятный текст — спрашиваем, а не угадываем. */}
          {pending && !openableKind(pending.intent) && !duplicate && (
            <div className="mt-2 rounded-lg border border-border px-3 py-2 text-xs">
              <p className="text-text-dim">Что создать из этого текста?</p>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openModalFor(pending, 'contact')}
                  className={`${chipClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Контакт
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openModalFor(pending, 'company')}
                  className={`${chipClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Компания
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        Модалки рендерятся ЛОКАЛЬНО (свой стейт), а не через ui-store.openModal:
        его `modalContext` умеет только id-шники и произвольный préfill не несёт.

        Портал в body обязателен: шапка живёт в `relative z-[35]`, а это стекинг-
        контекст — оверлей модалки (z-999/1000 из globals.css) внутри него оказался
        бы НИЖЕ peek-панели и поповеров страниц. Тот же приём, что у Combobox.
      */}
      {typeof document !== 'undefined' && contactPrefill && createPortal(
        <ContactModal
          isOpen
          onClose={() => setContactPrefill(null)}
          editContact={null}
          prefill={contactPrefill}
        />,
        document.body,
      )}
      {typeof document !== 'undefined' && companyPrefill && createPortal(
        <CompanyModal
          isOpen
          onClose={() => setCompanyPrefill(null)}
          editCompany={null}
          prefill={companyPrefill}
        />,
        document.body,
      )}
    </div>
  );
}
