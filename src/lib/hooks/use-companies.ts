'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';

export interface Company {
  id: string;
  name: string;
  inn: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  email?: string | null;
  address?: string | null;
  notes?: string | null;
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
  return (data ?? []) as Company[];
}

async function fetchCompany(id: string): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Company;
}

async function createCompany(company: CompanyInsert): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .insert(company)
    .select('*')
    .single();

  if (error) throw error;
  return data as Company;
}

async function updateCompany({ id, ...updates }: CompanyUpdate): Promise<Company> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Company;
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
