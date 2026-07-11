import { describe, test, expect } from 'vitest';
import { canManageDeliveryProject } from '@/lib/utils/project-permissions';

// P2b (B0): контракт прав UI = RLS project_members / apply_delivery_template:
// org owner/admin ∨ владелец проекта (owner_id/created_by)

const OWNER_ID = 'user-owner';
const OTHER_ID = 'user-other';
const project = { owner_id: OWNER_ID, created_by: null };

describe('canManageDeliveryProject — матрица прав (= гарды RLS/RPC)', () => {
  test('org owner → true (даже не владелец проекта)', () => {
    expect(canManageDeliveryProject(project, 'owner', OTHER_ID)).toBe(true);
  });

  test('org admin → true (даже не владелец проекта)', () => {
    expect(canManageDeliveryProject(project, 'admin', OTHER_ID)).toBe(true);
  });

  test('member (manager) — владелец проекта по owner_id → true', () => {
    expect(canManageDeliveryProject(project, 'manager', OWNER_ID)).toBe(true);
  });

  test('member (manager) — создатель проекта (created_by) → true', () => {
    expect(
      canManageDeliveryProject({ owner_id: null, created_by: OWNER_ID }, 'manager', OWNER_ID),
    ).toBe(true);
  });

  test('member (manager) — НЕ владелец → false (иначе кнопки дают 42501)', () => {
    expect(canManageDeliveryProject(project, 'manager', OTHER_ID)).toBe(false);
  });

  test('viewer — не владелец → false', () => {
    expect(canManageDeliveryProject(project, 'viewer', OTHER_ID)).toBe(false);
  });

  test('без userId → false (сессия не загрузилась)', () => {
    expect(canManageDeliveryProject(project, 'owner', undefined)).toBe(false);
  });

  test('без роли (null org) — владелец проекта всё равно true', () => {
    expect(canManageDeliveryProject(project, null, OWNER_ID)).toBe(true);
  });

  test('owner_id и created_by оба null, роль member → false', () => {
    expect(
      canManageDeliveryProject({ owner_id: null, created_by: null }, 'manager', OTHER_ID),
    ).toBe(false);
  });
});
