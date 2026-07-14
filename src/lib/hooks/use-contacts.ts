'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PhoneEntry } from '@/types/database';
import { useRealtimeSync } from './use-realtime';

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Мультителефон (041). До применения миграции может отсутствовать в ответе `*`. */
  phones?: PhoneEntry[];
  position: string | null;
  notes: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  companies?: { company_id: string; role: string | null; company: { id: string; name: string } }[];
}

export interface ContactInsert {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  phones?: PhoneEntry[];
  position?: string | null;
  notes?: string | null;
}

export interface ContactUpdate extends Partial<ContactInsert> {
  id: string;
}

/** Привязка контакта к компании */
export interface ContactCompanyLink {
  contact_id: string;
  company_id: string;
  role?: string | null;
}

const QUERY_KEY = ['contacts'] as const;

async function fetchContacts(): Promise<Contact[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      *,
      companies:contact_company(
        company_id,
        role,
        company:companies(id, name)
      )
    `)
    .order('last_name', { ascending: true });

  if (error) throw error;
  // 041: phones (jsonb) — codegen Json vs домен Contact.phones PhoneEntry[];
  // мост через unknown (паттерн use-projects).
  return (data ?? []) as unknown as Contact[];
}

async function fetchContact(id: string): Promise<Contact> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      *,
      companies:contact_company(
        company_id,
        role,
        company:companies(id, name)
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as Contact;
}

async function createContact(contact: ContactInsert): Promise<Contact> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    // phones: PhoneEntry[] в ContactInsert vs Json в codegen — каст payload
    .insert(contact as never)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as Contact;
}

async function updateContact({ id, ...updates }: ContactUpdate): Promise<Contact> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .update(updates as never)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as Contact;
}

async function deleteContact(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

// ═══ Junction: contact_company ═══

async function linkContactCompany(link: ContactCompanyLink): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('contact_company')
    .upsert(link, { onConflict: 'contact_id,company_id' });

  if (error) throw error;
}

async function unlinkContactCompany(contactId: string, companyId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('contact_company')
    .delete()
    .eq('contact_id', contactId)
    .eq('company_id', companyId);

  if (error) throw error;
}

// ═══ Hooks ═══

export function useContacts() {
  useRealtimeSync('contacts', QUERY_KEY);
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchContacts, staleTime: 60_000 });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchContact(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onMutate: async (newItem) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Contact[]>(QUERY_KEY);
      const optimistic: Contact = {
        id: crypto.randomUUID(),
        first_name: newItem.first_name,
        last_name: newItem.last_name,
        email: newItem.email ?? null,
        phone: newItem.phone ?? null,
        phones: newItem.phones ?? [],
        position: newItem.position ?? null,
        notes: newItem.notes ?? null,
        owner_id: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      qc.setQueryData<Contact[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateContact,
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Contact[]>(QUERY_KEY);
      qc.setQueryData<Contact[]>(QUERY_KEY, (old) =>
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

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteContact,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Contact[]>(QUERY_KEY);
      qc.setQueryData<Contact[]>(QUERY_KEY, (old) => (old ?? []).filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useLinkContactCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: linkContactCompany,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUnlinkContactCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, companyId }: { contactId: string; companyId: string }) =>
      unlinkContactCompany(contactId, companyId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
