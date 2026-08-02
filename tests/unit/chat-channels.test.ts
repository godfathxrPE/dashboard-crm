import { describe, test, expect } from 'vitest';
import {
  channelTitle,
  partitionChannels,
  GENERAL_CHANNEL_TITLE,
  GROUP_FALLBACK_TITLE,
  PROJECT_FALLBACK_TITLE,
} from '@/lib/utils/chat-channels';
import { groupConversationSchema } from '@/lib/validators/conversation';
import type { ConversationKind } from '@/types/database';

describe('channelTitle — S-CHAT-HUB-1c', () => {
  test('general — константа, колонка title игнорируется', () => {
    expect(channelTitle('general', 'мусор из БД', 'Проект А')).toBe(GENERAL_CHANNEL_TITLE);
  });

  test('project — имя проекта, колонка title игнорируется', () => {
    expect(channelTitle('project', 'мусор из БД', 'Проект А')).toBe('Проект А');
  });

  test('project без имени (удалён / не виден по RLS) — нейтральная заглушка', () => {
    expect(channelTitle('project', null, null)).toBe(PROJECT_FALLBACK_TITLE);
  });

  test('group — своя колонка title (регрессия 1b: сюда приезжало «Проект»)', () => {
    expect(channelTitle('group', 'Запуск обновления', null)).toBe('Запуск обновления');
  });

  test('group с пустым title — заглушка, а не пустая строка', () => {
    expect(channelTitle('group', '', null)).toBe(GROUP_FALLBACK_TITLE);
    expect(channelTitle('group', '   ', null)).toBe(GROUP_FALLBACK_TITLE);
    expect(channelTitle('group', null, null)).toBe(GROUP_FALLBACK_TITLE);
  });

  test('dm ведёт себя как группа (путей создания нет, но ветка не должна врать)', () => {
    expect(channelTitle('dm', 'Личное', 'Проект А')).toBe('Личное');
  });
});

describe('partitionChannels — раскладка панели каналов', () => {
  const item = (kind: ConversationKind, id: string, lastMessageAt: string | null) => ({
    conversation: { id, kind },
    lastMessageAt,
  });

  test('общий канал вынимается отдельно и в live не попадает', () => {
    const { general, live, emptyProjects } = partitionChannels([
      item('general', 'g', null),
      item('project', 'p1', '2026-08-01T10:00:00Z'),
    ]);
    expect(general?.conversation.id).toBe('g');
    expect(live.map((i) => i.conversation.id)).toEqual(['p1']);
    expect(emptyProjects).toEqual([]);
  });

  test('пустой проектный канал прячется за кнопку', () => {
    const { live, emptyProjects } = partitionChannels([
      item('project', 'p1', '2026-08-01T10:00:00Z'),
      item('project', 'p2', null),
    ]);
    expect(live.map((i) => i.conversation.id)).toEqual(['p1']);
    expect(emptyProjects.map((i) => i.conversation.id)).toEqual(['p2']);
  });

  test('ПУСТАЯ ГРУППА остаётся в основном списке (решение 4 спринта)', () => {
    const { live, emptyProjects } = partitionChannels([
      item('group', 'gr1', null),
      item('project', 'p2', null),
    ]);
    expect(live.map((i) => i.conversation.id)).toEqual(['gr1']);
    expect(emptyProjects.map((i) => i.conversation.id)).toEqual(['p2']);
  });

  test('входной порядок сохраняется — сортировку задаёт useConversations', () => {
    const { live } = partitionChannels([
      item('group', 'gr1', null),
      item('project', 'p1', '2026-08-02T10:00:00Z'),
      item('group', 'gr2', '2026-08-01T10:00:00Z'),
    ]);
    expect(live.map((i) => i.conversation.id)).toEqual(['gr1', 'p1', 'gr2']);
  });

  test('общего канала нет (не должно быть, но не падаем)', () => {
    const { general, live } = partitionChannels([item('group', 'gr1', null)]);
    expect(general).toBeNull();
    expect(live).toHaveLength(1);
  });
});

describe('groupConversationSchema — зеркало CHECK 096 (1..120)', () => {
  test('название из пробелов не проходит (иначе 22023 прилетел бы из БД)', () => {
    const r = groupConversationSchema.safeParse({ title: '   ', memberIds: [] });
    expect(r.success).toBe(false);
  });

  test('trim применяется до проверки длины', () => {
    const r = groupConversationSchema.safeParse({ title: '  Запуск  ', memberIds: [] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe('Запуск');
  });

  test('121 символ — отказ, 120 — проходит', () => {
    expect(
      groupConversationSchema.safeParse({ title: 'x'.repeat(121), memberIds: [] }).success,
    ).toBe(false);
    expect(
      groupConversationSchema.safeParse({ title: 'x'.repeat(120), memberIds: [] }).success,
    ).toBe(true);
  });

  test('пустой состав валиден — группа из одного автора', () => {
    expect(groupConversationSchema.safeParse({ title: 'Соло', memberIds: [] }).success).toBe(true);
  });
});
