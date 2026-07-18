'use client';

import { ProfileForm } from '@/components/settings/ProfileForm';

/**
 * Welcome-гейт (S-ONBOARD-1): middleware приводит сюда залогиненного члена орги
 * с onboarded_at IS NULL. «Пропустить» нет намеренно — имя обязательно
 * (серверный гард complete_onboarding), после сабмита форма уводит на дашборд.
 */
export default function WelcomePage() {
  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      <div className="space-y-1.5 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-white text-xl font-bold">
          ОП
        </div>
        <h1 className="text-lg font-semibold text-text-main">Расскажите о себе</h1>
        <p className="text-sm text-text-mute">
          Имя увидят коллеги в команде, лентах и задачах. Телефон и должность —
          по желанию.
        </p>
      </div>

      <ProfileForm mode="onboarding" />

      <p className="text-center text-[11px] text-text-mute">Torii CRM · v4.0</p>
    </div>
  );
}
