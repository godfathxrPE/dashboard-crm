/**
 * Миграция данных: старый Dashboard → новый CRM (Supabase)
 *
 * Запуск:
 *   cd ~/Downloads/dashboard-crm
 *   node migrate.mjs ~/Downloads/dashboard-backup-2026-03-30-2.json
 *
 * Требует .env.local с NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { createInterface } from 'readline';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Не найдены SUPABASE env vars в .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Читаем backup ──
const backupPath = process.argv[2];
if (!backupPath) {
  console.error('❌ Укажи путь: node migrate.mjs ./dashboard-backup.json');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(backupPath, 'utf-8'));
function parse(key, fallback = '[]') {
  const val = raw[key];
  if (!val) return JSON.parse(fallback);
  const parsed = JSON.parse(val);
  return parsed ?? JSON.parse(fallback);
}

// ── Маппинги ──

// Старые числовые stage → новые DealStage enum
const STAGE_MAP = {
  0:  'new_lead',
  1:  'qualification',
  2:  'waiting_materials',
  3:  'preparing_kp',
  4:  'kp_sent',
  5:  'kp_review',
  6:  'preparing_docs',
  7:  'cz_approval',
  8:  'trilateral_meeting',
  9:  'experiment_setup',
  10: 'contract_review',
  11: 'contract_signing',
  'won':  'won',
  'lost': 'lost',
};

// Старые lane сохраняются как есть (схема использует тот же TaskLane)
// now → now, next → next, wait → wait, done → done

// ── Хелпер: разбить полное имя на first_name + last_name ──
function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first_name: 'Без имени', last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  // Фамилия — первое слово, Имя Отчество — остальное (русский порядок)
  // Но может быть и Имя Отчество Фамилия. Берём первое как first_name, остальное как last_name
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

// ═══════════════════════════════════════════
// АВТОРИЗАЦИЯ
// ═══════════════════════════════════════════

console.log('\n🔑 Нужен токен авторизации.');
console.log('Открой новый CRM → F12 → Console → вставь:');
console.log('');
console.log('  copy(JSON.stringify({at: (await supabase.auth.getSession()).data.session.access_token, rt: (await supabase.auth.getSession()).data.session.refresh_token}))');
console.log('');
console.log('Вставь скопированный JSON сюда:');

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('> ', async (input) => {
  rl.close();

  let tokens;
  try {
    tokens = JSON.parse(input.trim());
  } catch {
    console.error('❌ Невалидный JSON');
    process.exit(1);
  }

  const { error: authErr } = await supabase.auth.setSession({
    access_token: tokens.at,
    refresh_token: tokens.rt,
  });
  if (authErr) {
    console.error('❌ Ошибка авторизации:', authErr.message);
    process.exit(1);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.error('❌ Нет пользователя'); process.exit(1); }
  console.log(`✅ ${user.email} (${user.id})\n`);

  const userId = user.id;

  // ═══════════════════════════════════════════
  // 1. COMPANIES
  // ═══════════════════════════════════════════
  console.log('📦 1/6 Компании...');
  const companyMap = {}; // name → uuid
  const companyRows = [];

  function ensureCompany(name, extra = {}) {
    name = (name || '').trim();
    if (!name || companyMap[name]) return;
    const id = randomUUID();
    companyMap[name] = id;
    companyRows.push({
      id,
      name,
      inn: extra.inn || null,
      industry: extra.industry || null,
      website: null,
      phone: null,
      address: null,
      notes: extra.notes || null,
      owner_id: userId,
      created_by: userId,
    });
  }

  // Из проектов
  const oldProjects = parse('wdb_projects');
  for (const p of oldProjects) {
    ensureCompany(p.client || p.name, { inn: p.sourceInn });
  }

  // Из кампании
  const campaign = parse('calls-campaign-v1', '{}');
  for (const [inn, comp] of Object.entries(campaign)) {
    if (!comp || !comp.name) continue;
    ensureCompany(comp.name, { inn, industry: comp.okved });
  }

  // Из звонков
  const oldCalls = parse('wdb_calls');
  for (const c of oldCalls) {
    ensureCompany(c.company);
  }

  if (companyRows.length) {
    const { error } = await supabase.from('companies').upsert(companyRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${companyRows.length} компаний`);
  }

  // ═══════════════════════════════════════════
  // 2. CONTACTS
  // ═══════════════════════════════════════════
  console.log('📦 2/6 Контакты...');
  const contactMap = {}; // fullName → uuid
  const contactRows = [];
  const junctionRows = [];

  function ensureContact(fullName, companyName, extra = {}) {
    fullName = (fullName || '').trim();
    if (!fullName) return;

    if (!contactMap[fullName]) {
      const id = randomUUID();
      contactMap[fullName] = id;
      const { first_name, last_name } = splitName(fullName);
      contactRows.push({
        id,
        first_name,
        last_name,
        email: extra.email || null,
        phone: extra.phone || null,
        position: extra.position || null,
        notes: null,
        owner_id: userId,
        created_by: userId,
      });
    }

    // Junction
    companyName = (companyName || '').trim();
    if (companyName && companyMap[companyName]) {
      const cid = contactMap[fullName];
      const exists = junctionRows.find(j => j.contact_id === cid && j.company_id === companyMap[companyName]);
      if (!exists) {
        junctionRows.push({
          contact_id: cid,
          company_id: companyMap[companyName],
          role: extra.position || null,
        });
      }
    }
  }

  // Из проектов (embedded contacts)
  for (const p of oldProjects) {
    const compName = (p.client || p.name || '').trim();
    const embedded = p.contacts || [];
    for (const ec of embedded) {
      ensureContact(ec.name, compName, { phone: ec.phone, email: ec.email, position: ec.position });
    }
    // Fallback: contact строка
    if (!embedded.length && p.contact) {
      const name = p.contact.split(',')[0].split('+7')[0].trim();
      ensureContact(name, compName);
    }
  }

  // Из кампании
  for (const [inn, comp] of Object.entries(campaign)) {
    if (!comp?.contacts) continue;
    const compName = (comp.name || '').trim();
    for (const cc of comp.contacts) {
      ensureContact(cc.name, compName, { phone: cc.phone, email: cc.email, position: cc.position });
    }
  }

  if (contactRows.length) {
    const { error } = await supabase.from('contacts').upsert(contactRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${contactRows.length} контактов`);
  }

  if (junctionRows.length) {
    const { error } = await supabase.from('contact_company').upsert(junctionRows, { onConflict: 'contact_id,company_id' });
    if (error) console.error('  ⚠️ Junction:', error.message);
    else console.log(`  ✅ ${junctionRows.length} связей`);
  }

  // ═══════════════════════════════════════════
  // 3. PROJECTS
  // ═══════════════════════════════════════════
  console.log('📦 3/6 Проекты...');
  const projectMap = {}; // oldId → newId
  const projectRows = [];

  for (const p of oldProjects) {
    const id = randomUUID();
    projectMap[p.id] = id;

    const companyName = (p.client || p.name || '').trim();
    const contactName = p.contacts?.[0]?.name || p.contact?.split(',')[0]?.split('+7')[0]?.trim() || null;

    // Budget: старый хранит строку рублей → новый bigint копейки
    let budget = null;
    if (p.budget) {
      const num = parseInt(p.budget);
      if (!isNaN(num)) budget = num * 100;
    }

    // Stage
    const stage = STAGE_MAP[p.stage] || 'new_lead';

    // loss_detail: объединяем с историей
    let lossDetail = p.lossDetail || '';
    if (p.lastContact) lossDetail += (lossDetail ? '\n\n--- История ---\n' : '') + p.lastContact;

    projectRows.push({
      id,
      name: p.name || 'Без названия',
      company_id: companyName ? (companyMap[companyName] || null) : null,
      contact_id: contactName ? (contactMap[contactName] || null) : null,
      stage,
      budget,
      deadline: p.deadline || null,
      next_step: p.nextStep || null,
      owner_id: userId,
      loss_reason: p.lossReason || null,
      loss_detail: lossDetail || null,
      created_by: userId,
    });
  }

  if (projectRows.length) {
    const { error } = await supabase.from('projects').upsert(projectRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${projectRows.length} проектов`);
  }

  // ═══════════════════════════════════════════
  // 4. TASKS
  // ═══════════════════════════════════════════
  console.log('📦 4/6 Задачи...');
  const oldTasks = parse('wdb_tasks');
  const taskRows = [];

  for (const t of oldTasks) {
    taskRows.push({
      id: randomUUID(),
      text: t.text || 'Без названия',
      lane: t.lane || 'next',              // TaskLane: now|next|wait|done
      priority: 'normal',                   // TaskPriority: normal|important|critical
      project_id: t.project ? (projectMap[t.project] || null) : null,
      deadline: t.deadline || null,
      remind_min: null,
      sort_order: 0,
      assigned_to: userId,
      created_by: userId,
    });
  }

  if (taskRows.length) {
    const { error } = await supabase.from('tasks').upsert(taskRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${taskRows.length} задач`);
  }

  // ═══════════════════════════════════════════
  // 5. CALLS
  // ═══════════════════════════════════════════
  console.log('📦 5/6 Звонки...');
  const callRows = [];

  for (const c of oldCalls) {
    const companyName = (c.company || '').trim();
    const contactName = (c.contact || '').trim();

    callRows.push({
      id: randomUUID(),
      company_id: companyName ? (companyMap[companyName] || null) : null,
      contact_id: contactName ? (contactMap[contactName] || null) : null,
      project_id: null,
      date: c.date || new Date().toISOString(),
      status: c.status || 'pending',        // CallStatus: done|pending|cancelled
      next_step: c.nextStep || null,
      agreements: c.agreements || null,
      duration_s: null,
      created_by: userId,
    });
  }

  if (callRows.length) {
    const { error } = await supabase.from('calls').upsert(callRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${callRows.length} звонков`);
  }

  // ═══════════════════════════════════════════
  // 6. MEETINGS
  // ═══════════════════════════════════════════
  console.log('📦 6/6 Встречи...');
  const oldMeetings = parse('wdb_meetings');
  const meetingRows = [];

  for (const m of oldMeetings) {
    meetingRows.push({
      id: randomUUID(),
      title: m.title || 'Без названия',
      date: m.date || new Date().toISOString().slice(0, 10),
      time: m.time || null,
      location: null,
      project_id: null,
      notes: m.who ? ('Участники: ' + m.who) : null,
      created_by: userId,
    });
  }

  if (meetingRows.length) {
    const { error } = await supabase.from('meetings').upsert(meetingRows, { onConflict: 'id' });
    if (error) console.error('  ❌', error.message);
    else console.log(`  ✅ ${meetingRows.length} встреч`);
  }

  // ═══════════════════════════════════════════
  // ИТОГО
  // ═══════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════');
  console.log('✅ МИГРАЦИЯ ЗАВЕРШЕНА');
  console.log(`   Компании:   ${companyRows.length}`);
  console.log(`   Контакты:   ${contactRows.length}`);
  console.log(`   Связи:      ${junctionRows.length}`);
  console.log(`   Проекты:    ${projectRows.length}`);
  console.log(`   Задачи:     ${taskRows.length}`);
  console.log(`   Звонки:     ${callRows.length}`);
  console.log(`   Встречи:    ${meetingRows.length}`);
  console.log('═══════════════════════════════════════════');
  console.log('\nОткрой CRM и проверь!');

  process.exit(0);
});
