'use client';

import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PhoneEntry } from '@/types/database';
import { phoneEntrySchema } from '@/lib/validators/phone';
import { useRealtimeSync } from './use-realtime';

// 041: phones приходит из БД как jsonb (codegen типизирует Json) — парсим на
// границе хука доменным phoneEntrySchema. Битую запись глотаем в [] (catch),
// чтобы один кривой номер не ронял всю строку/список.
const parsePhones = (v: unknown): PhoneEntry[] => z.array(phoneEntrySchema).catch([]).parse(v);

export interface Company {
  id: string;
  name: string;
  inn: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  /** Мультителефон (041). До применения миграции может отсутствовать в ответе `*`. */
  phones?: PhoneEntry[];
  email: string | null;
  address: string | null;
  notes: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // ═══ S-INN-1 (102): юрреквизиты из ЕГРЮЛ ═══
  // Опциональные по той же причине, что `phones` выше: до применения 102 колонок нет
  // в ответе `select('*')`, и обязательные поля дали бы undefined под видом string|null.
  // `legal_name`/`legal_address` — отдельно от `name`/`address`: реестр не затирает
  // рабочее имя и фактический адрес (инвариант фичи, шапка миграции 102).
  kpp?: string | null;
  ogrn?: string | null;
  legal_name?: string | null;
  legal_address?: string | null;
  inn_status?: string | null;
  inn_verified_at?: string | null;
  /**
   * S-OKVED-1 (103): основной код ОКВЭД-2 из ЕГРЮЛ. Опционален по той же причине,
   * что колонки 102 выше — до применения 103 его нет в ответе `select('*')`.
   * Человеческая отрасль живёт в `industry`; здесь всегда код.
   */
  okved?: string | null;
  /**
   * S-LEAD-CARRY-1 (123, на гейте): ПОДТВЕРЖДЁННЫЕ товарные группы «Честного Знака».
   * Опционален по той же причине, что колонки 102/103 выше — до применения 123
   * колонки нет в ответе `select('*')`.
   *
   * Не путать с `matchChzGroups(okved)`: та ВЫВОДИТ гипотезу из кода реестра, эта
   * колонка хранит то, что подтвердил человек (приезжает с лида при конверсии либо
   * правится в CompanyModal). Кто из двух побеждает при рендере — решает
   * `resolveChzProfile` (`src/lib/domain/chz-profile.ts`).
   *
   * NULL = не выяснено; `[]` = выяснено, что групп нет.
   */
  chz_groups?: string[] | null;
  // Aggregated (computed client-side or via view)
  contacts_count?: number;
  projects_count?: number;
}

export interface CompanyInsert {
  name: string;
  inn?: string | null;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  phones?: PhoneEntry[];
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  // S-INN-1 (102)
  kpp?: string | null;
  ogrn?: string | null;
  legal_name?: string | null;
  legal_address?: string | null;
  inn_status?: string | null;
  inn_verified_at?: string | null;
  // S-OKVED-1 (103)
  okved?: string | null;
  // S-LEAD-CARRY-1 (123): подтверждённый маркировочный профиль.
  // Поле нужно для ТИПИЗАЦИИ, а не как фильтр: payload собирается в
  // `CompanyModal.onSubmit` как `{ ...values }` из Zod-схемы и уходит в
  // `.insert(... as never)` / `.update(... as never)` — каст снимает проверку, и
  // ключ доехал бы до БД и без записи здесь. Контракт поля держит
  // `companyFormSchema`, не этот интерфейс.
  chz_groups?: string[] | null;
}

export interface CompanyUpdate extends Partial<CompanyInsert> {
  id: string;
}

const QUERY_KEY = ['companies'] as const;

async function fetchCompanies(): Promise<Company[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, phones: parsePhones(r.phones) })) as Company[];
}

async function fetchCompany(id: string): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return { ...data, phones: parsePhones(data.phones) } as Company;
}

async function createCompany(company: CompanyInsert): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    // Каст payload: codegen требует org_id (инжектится сервером/RLS) + phones
    // Json vs PhoneEntry[]. Payload валидирован zod (company.ts) до вызова.
    .insert(company as never)
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, phones: parsePhones(data.phones) } as Company;
}

async function updateCompany({ id, ...updates }: CompanyUpdate): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .update(updates as never)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, phones: parsePhones(data.phones) } as Company;
}

async function deleteCompany(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) throw error;
}

export function useCompanies() {
  useRealtimeSync('companies', QUERY_KEY);
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchCompanies, staleTime: 60_000 });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchCompany(id),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCompany,
    onMutate: async (newItem) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Company[]>(QUERY_KEY);
      const optimistic: Company = {
        id: crypto.randomUUID(),
        ...newItem,
        inn: newItem.inn ?? null,
        industry: newItem.industry ?? null,
        website: newItem.website ?? null,
        phone: newItem.phone ?? null,
        email: newItem.email ?? null,
        address: newItem.address ?? null,
        notes: newItem.notes ?? null,
        owner_id: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      qc.setQueryData<Company[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCompany,
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Company[]>(QUERY_KEY);
      qc.setQueryData<Company[]>(QUERY_KEY, (old) =>
        (old ?? []).map((c) => (c.id === updated.id ? { ...c, ...updated, updated_at: new Date().toISOString() } : c))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...QUERY_KEY, vars.id] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCompany,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Company[]>(QUERY_KEY);
      qc.setQueryData<Company[]>(QUERY_KEY, (old) => (old ?? []).filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
