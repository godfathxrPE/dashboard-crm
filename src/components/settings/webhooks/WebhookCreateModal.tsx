'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useCreateWebhookEndpoint } from '@/lib/hooks/use-webhook-endpoints';
import {
  webhookEndpointSchema,
  type WebhookEndpointFormValues,
} from '@/lib/validators/webhook';
import { WebhookSecretModal } from './WebhookSecretModal';

const labelCls = 'block text-meta font-medium text-text-dim mb-1';
const inputCls =
  'w-full rounded border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none';
const errCls = 'mt-1 text-meta text-red';

interface WebhookCreateModalProps {
  onClose: () => void;
}

/**
 * Создание endpoint'а: форма → экран секрета. Секрет приходит из RPC один раз и
 * живёт только в локальном стейте — ни в кеш react-query, ни в список он не попадает.
 */
export function WebhookCreateModal({ onClose }: WebhookCreateModalProps) {
  const createEndpoint = useCreateWebhookEndpoint();
  const [secret, setSecret] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<WebhookEndpointFormValues>({
    resolver: zodResolver(webhookEndpointSchema),
    defaultValues: { name: '', url: '', description: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const created = await createEndpoint.mutateAsync({
        name: values.name,
        url: values.url,
        description: values.description,
      });
      setSecret(created.secret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать endpoint');
    }
  });

  if (secret) {
    return <WebhookSecretModal title="Endpoint создан" secret={secret} onClose={onClose} />;
  }

  return (
    <Modal
      title="Новый endpoint"
      description="Куда Torii CRM будет слать события"
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="webhook-create-form"
            disabled={createEndpoint.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createEndpoint.isPending ? 'Создаём…' : 'Создать'}
          </button>
        </>
      }
    >
      <form id="webhook-create-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="wh-name">Название</label>
          <input
            id="wh-name"
            className={inputCls}
            placeholder="n8n: новые победы"
            {...register('name')}
          />
          {errors.name && <p className={errCls}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelCls} htmlFor="wh-url">URL получателя</label>
          <input
            id="wh-url"
            className={inputCls}
            placeholder="https://example.com/hooks/torii"
            {...register('url')}
          />
          {errors.url && <p className={errCls}>{errors.url.message}</p>}
          <p className="mt-1 text-meta text-text-mute">
            Только https, порт 443, имя хоста (не IP-адрес). Адрес проверяется ещё раз
            перед каждой отправкой — DNS может переехать после сохранения.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="wh-description">Описание</label>
          <input
            id="wh-description"
            className={inputCls}
            placeholder="Необязательно"
            {...register('description')}
          />
          {errors.description && <p className={errCls}>{errors.description.message}</p>}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface2 p-3">
          <KeyRound size={14} className="mt-0.5 shrink-0 text-text-mute" />
          <p className="text-xs text-text-mute">
            При создании выдаётся секрет для подписи запросов. Он показывается один раз —
            сразу после нажатия «Создать».
          </p>
        </div>
      </form>
    </Modal>
  );
}
