'use client';

import { Calculator, ExternalLink, Search } from 'lucide-react';
import type { CompanyBriefResult } from '@/types/database';
import { matchChzGroups, chzStatusLabel } from '@/lib/data/chz-groups';
import { safeHref } from '@/lib/utils/safe-href';

/**
 * S-COMPANY-AI-1 (104) — бриф по компании из открытых источников. READ-ONLY.
 *
 * Весь текст модели рендерится КАК ТЕКСТ (никакого HTML/markdown) — тот же контур,
 * что у остальных рендереров ai_runs. Отличие одно: у брифа есть ссылки на источники,
 * и они кликабельны. URL приходит от модели, то есть недоверен, поэтому:
 *   • схема фильтруется `safeHref` (javascript:/data: не станут href),
 *   • `rel="noopener noreferrer"` + `target="_blank"`,
 *   • не прошёл фильтр — рендерим URL текстом, а не молча выкидываем утверждение.
 *
 * Предложение подставить найденный сайт живёт НЕ здесь, а в AiCompanyPanel: писать
 * в компанию может только тот, кто знает компанию, и делает это по явному клику.
 *
 * S-DEBT-1 — секция «Маркировка» говорит ДВЕ разные вещи РАЗНЫМИ подписями:
 *
 *   • ВЫЧИСЛЕНО — товарные группы из `matchChzGroups(okved)`. Справочник, ноль AI,
 *     ноль поиска: у строки нет и не может быть источника, поэтому вместо ссылки
 *     она несёт «по ОКВЭД …, справочник CRM» и иконку счётов. В схему инструмента
 *     это НЕ уезжает и модели фактом не показывается (в промпт ОКВЭД идёт как
 *     направление поиска — `<data kind="chz_profile">` в ai-run).
 *   • НАЙДЕНО — `chz_signals` модели, каждый со ссылкой на источник.
 *
 * ⚠️ Смешивать их одним видом нельзя: через месяц никто не вспомнит, что из этого
 * проверено источником, а «обязана маркировать» и «замечена в ГИС МТ» — разговоры
 * с клиентом разной силы.
 *
 * `okved` — ПРОП, а не запрос: рендерер презентационный, хук данных внутри него
 * ломает чужие тесты («No QueryClient set»). Даёт его тот хост, у которого карточка
 * компании уже на руках (`AiCompanyPanel`); в модалке прогона из ленты карточки нет,
 * и вычисленной строки там не будет — молчание честнее, чем группа, выведенная из
 * неизвестно чего.
 */
export function CompanyBriefRenderer({
  result,
  okved,
}: {
  result: CompanyBriefResult;
  okved?: string | null;
}) {
  const derived = matchChzGroups(okved);
  const signals = result.chz_signals;
  // Массив есть и он пуст — поиск состоялся и ничего не дал (это факт, его и пишем).
  // Поля нет вовсе (старый прогон) — сказать нечего, молчим.
  const searched = Array.isArray(signals);

  return (
    <div className="space-y-3 text-sm">
      {result.summary && (
        <p className="whitespace-pre-wrap text-text-main">{result.summary}</p>
      )}

      {result.activity && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Чем занимается</p>
          <p className="whitespace-pre-wrap text-text-main">{result.activity}</p>
        </div>
      )}

      {result.scale && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Масштаб</p>
          <p className="whitespace-pre-wrap text-text-main">{result.scale}</p>
        </div>
      )}

      {(derived.length > 0 || searched) && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Маркировка</p>
          <ul className="space-y-1">
            {/* ВЫЧИСЛЕНО справочником: без ссылки, но с явным «откуда». */}
            {derived.map((g) => (
              <li key={g.group} className="flex items-start gap-1.5 text-text-main">
                <Calculator
                  size={12}
                  className="mt-0.5 shrink-0 text-text-mute"
                  aria-hidden="true"
                />
                <span>
                  {g.group} — {chzStatusLabel(g)}
                  <span className="text-xs text-text-mute">
                    {' '}· по ОКВЭД {okved}, справочник CRM
                  </span>
                </span>
              </li>
            ))}

            {/* НАЙДЕНО поиском: каждое утверждение со ссылкой. */}
            {signals?.map((s, i) => (
              <li key={`signal-${i}`} className="flex items-start gap-1.5 text-text-main">
                <Search size={12} className="mt-0.5 shrink-0 text-text-mute" aria-hidden="true" />
                <span>
                  <span className="whitespace-pre-wrap">{s.claim}</span>{' '}
                  <SourceLink url={s.source_url} label="источник" />
                </span>
              </li>
            ))}

            {/* Пустой поиск — СТРОКА, а не тишина: «не проверяли» и «проверили, следов
                нет» читаются одинаково только пока строки нет. Второе — зацепка:
                либо делают внутри, либо не делают вовсе. */}
            {signals && signals.length === 0 && (
              <li className="flex items-start gap-1.5 text-text-dim">
                <Search size={12} className="mt-0.5 shrink-0 text-text-mute" aria-hidden="true" />
                <span>Следов работы с ГИС МТ в открытых источниках не найдено</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {result.recent_news && result.recent_news.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Свежие события</p>
          <ul className="space-y-1">
            {result.recent_news.map((n, i) => (
              <li key={i} className="text-text-main">
                {n.date && <span className="mr-1 text-xs tabular-nums text-text-mute">{n.date}</span>}
                <span className="whitespace-pre-wrap">{n.title}</span>{' '}
                <SourceLink url={n.url} label="ссылка" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.talk_hooks && result.talk_hooks.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Зацепки для разговора</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-text-main">
            {result.talk_hooks.map((h, i) => <li key={i} className="whitespace-pre-wrap">{h}</li>)}
          </ol>
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Источники</p>
          <ul className="space-y-0.5">
            {result.sources.map((u, i) => (
              <li key={i} className="truncate text-xs">
                <SourceLink url={u} label={u} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ссылка на источник. Схема не прошла фильтр — показываем URL текстом. */
function SourceLink({ url, label }: { url: string; label: string }) {
  const href = safeHref(url);
  if (!href) return <span className="text-xs text-text-mute">{url}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-0.5 text-xs text-accent hover:underline"
    >
      {label}
      <ExternalLink size={10} className="shrink-0" />
    </a>
  );
}
