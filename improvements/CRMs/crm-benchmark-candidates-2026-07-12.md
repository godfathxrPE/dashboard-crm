# Западные CRM для сравнения с dashboard-crm

**Дата:** 2026-07-12  
**Контекст:** дополнение к `hubspot-analysis-2026-07-12.md` и `attio-analysis-2026-07-12.md`.  
**Основа:** `CRM-EVOLUTION-PLAN.md` (Attio / folk / Pipedrive / Close / Linear).

Для вашего кейса логично смотреть не «все CRM подряд», а **по слоям** — у вас в `CRM-EVOLUTION-PLAN.md` уже заложены 5 из них.

---

## Уже в вашем бенчмарке (следующие на очереди)

| CRM | Что взять | Релевантность для вас |
|-----|-----------|------------------------|
| **Pipedrive** | Activity-based selling, rotting deals, focus panel, pipeline UX | **Высокая** — вы уже частично это внедрили (`deal-health`, `next_step`, TodayView) |
| **Close** | Action Inbox, Smart Views, встроенный dialer + email sequences | **Высокая** — эталон «очереди действий»; ближе к продажам, чем Attio |
| **folk** | Плоская IA из 3–4 разделов, zero learning curve, relationship CRM | **Средняя** — для упрощения навигации малой команде |
| **Linear** | Cmd+K как точка входа во всё, keyboard nav (j/k), peek-панель, скорость UI | **Средняя** — не CRM, но эталон productivity UX (у вас Cmd+K уже есть) |

**Рекомендация:** следующий анализ — **Pipedrive** или **Close**. Pipedrive — если хотите углубить механику сделки; Close — если фокус на inbox/очереди и sales workflow.

---

## Tier 1 — sales CRM (максимально релевантны)

| CRM | Сильная сторона | Зачем сравнивать |
|-----|-----------------|------------------|
| **Salesforce** | Enterprise platform, CPQ, Service Cloud, AppExchange | Понять, что enterprise-клиенты ожидают; не копировать целиком |
| ~~**Zoho CRM**~~ ✅ | Дёшево, модули, automation, project-like deals | Альтернатива HubSpot для SMB; паттерны automation без tier-ада |
| **Copper** | CRM внутри Google Workspace, минимальный UI | Эталон «незаметной» CRM для малой команды |
| **Nutshell** | Простой pipeline + timeline + email | Близко к вашему размеру команды |
| **Streak** | CRM как слой поверх Gmail | Паттерн «CRM там, где работают» (email-first) |

---

## Tier 2 — modern / AI-native (как Attio)

| CRM | Сильная сторона | Зачем сравнивать |
|-----|-----------------|------------------|
| **Clay** | Relationship intelligence, enrichment, «кого reconnect» | У вас reconnect уже есть — сравнить глубину сигналов |
| ~~**Affinity**~~ ✅ | Relationship scoring из email/calendar, deal flow | Для B2B с длинным циклом |
| **Day.ai** | Auto-capture из коммуникаций, AI notes | Тренд «CRM без ручного ввода» |
| ~~**Twenty**~~ ✅ | Open-source, flexible objects (как Attio) | Если интересна **архитектура**, а не маркетинг |
| **Folk** | (повтор) relationship-first, простота | Уже в плане |

---

## Tier 3 — project + delivery (ваш домен внедрений)

| CRM / tool | Сильная сторона | Зачем сравнивать |
|------------|-----------------|------------------|
| ~~**Monday Sales CRM**~~ ✅ | Deal → project handoff, boards | Паттерн «выиграли → внедряем» |
| **Notion CRM templates** | Гибкая схема без кода | Как пользователи решают delivery без ERP |
| **Accelo** | PSA: sales + projects + tickets | **Очень релевантно** для 1С/внедрений (sales → delivery) |
| ~~**Teamwork CRM**~~ ✅ | Lead → project pipeline | Похожий vertical use case |
| **Productive.io** | Agency PSA + CRM | Шаблоны проектов, бюджеты, этапы |

Для **маркировка + внедрение 1С/ЧЗ** Accelo и Monday сильнее HubSpot/Attio по delivery-контуру.

---

## Tier 4 — специализированные (точечные инсайты)

| CRM | Инсайт |
|-----|--------|
| **Freshsales (Freshworks)** | Lead scoring, built-in phone, affordable sequences |
| **Insightly** | CRM + projects в одном продукте (как ваша схлопнутая модель) |
| **Capsule CRM** | Минимализм, pipeline, tasks — антипод HubSpot |
| **Less Annoying CRM** | Радикальная простота для 1–10 человек |
| **Fireflies + CRM integrations** | Meeting → CRM update (как Smart Deal Progression) |

---

## Что взять в `improvements/` следующим

Приоритет по отдаче для dashboard-crm:

1. **Pipedrive** — закрыть gap по pipeline/deal mechanics (вы уже наполовину там)
2. **Close** — углубить TodayView / Smart Views / sales sequences
3. ~~**Accelo**~~ ✅ · ~~**Insightly**~~ ✅ — project delivery после выигрыша сделки
4. **Clay** — relationship intelligence и reconnect
5. **Salesforce** — только как «что ждёт enterprise», без копирования

HubSpot и Attio покрывают **platform + AI-native**. **Приоритетная очередь #1–#5 закрыта** (Pipedrive, Close, Accelo, Clay, Salesforce). **Productivity UX (Linear)** закрыт спринтами W2a–W2d. **Monday Sales CRM** ✅ закрыт (Tier 3 delivery handoff). **Teamwork CRM** ✅ закрыт (Tier 3 lead→project link). **Insightly** ✅ закрыт (Tier 4 PSA alt). **Twenty** ✅ закрыт (Tier 2 architecture / flexible objects). **Zoho CRM** ✅ закрыт (Tier 1 Blueprint + automation stack). **Affinity** ✅ закрыт (Tier 2 relationship scoring). Следующие кандидаты вне очереди: **folk** (IA), **Productive.io** (agency PSA).

---

## Матрица «кого зачем»

```
                    Sales UX    AI/Agents    Delivery/PSA    Enterprise
HubSpot               ●           ●●            ○              ●●
Attio                 ●           ●●●           ○              ○
Pipedrive            ●●●          ○            ○              ○
Close                ●●●          ●            ○              ○
Accelo/Insightly      ●           ○            ●●●            ○
Salesforce            ●●          ●●           ●●             ●●●
folk/Linear           ●●          ○            ○              ○
```

---

## Уже проанализировано

| CRM | Файл |
|-----|------|
| HubSpot | `improvements/hubspot-analysis-2026-07-12.md` |
| Attio | `improvements/attio-analysis-2026-07-12.md` |
| Pipedrive | `improvements/pipedrive-analysis-2026-07-12.md` |
| Close | `improvements/close-analysis-2026-07-12.md` |
| Accelo | `improvements/accelo-analysis-2026-07-12.md` |
| Clay | `improvements/clay-analysis-2026-07-12.md` |
| Salesforce | `improvements/salesforce-analysis-2026-07-12.md` |
| Linear | `improvements/linear-analysis-2026-07-12.md` |
| Monday Sales CRM | `improvements/CRMs/monday-analysis-2026-07-12.md` |
| Insightly | `improvements/CRMs/insightly-analysis-2026-07-12.md` |
| Twenty | `improvements/CRMs/twenty-analysis-2026-07-12.md` |
| Teamwork CRM | `improvements/CRMs/teamwork-analysis-2026-07-12.md` |
| Zoho CRM | `improvements/CRMs/zoho-analysis-2026-07-12.md` |
| Affinity | `improvements/CRMs/affinity-analysis-2026-07-12.md` |