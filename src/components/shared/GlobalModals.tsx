'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/lib/stores/ui-store';
import { TaskModal } from '@/components/tasks/TaskModal';
import { ProjectModal } from '@/components/projects/ProjectModal';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { ContactModal } from '@/components/contacts/ContactModal';
import { CompanyModal } from '@/components/companies/CompanyModal';

/**
 * Единый host для модалок, открываемых из палитры команд (openModal из ui-store).
 * Создание новых сущностей с любой страницы. Каждая модалка рендерит null при
 * isOpen=false, поэтому монтирование всех сразу дёшево. Локальные инстансы на
 * страницах (свой useState) не конфликтуют — палитра закрывается перед openModal.
 */
export function GlobalModals() {
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const ctx = useUiStore((s) => s.modalContext);

  // Esc закрывает открытую из палитры модалку (сами модалки Escape не слушают)
  useEffect(() => {
    if (!activeModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeModal, closeModal]);

  return (
    <>
      <TaskModal
        isOpen={activeModal === 'task'} onClose={closeModal} editTask={null}
        defaultContactId={ctx?.contactId ?? null}
        defaultCompanyId={ctx?.companyId ?? null}
        defaultProjectId={ctx?.projectId ?? null}
      />
      <ProjectModal
        isOpen={activeModal === 'project'} onClose={closeModal} editProject={null}
        defaultCompanyId={ctx?.companyId ?? null}
      />
      <CallModal
        isOpen={activeModal === 'call'} onClose={closeModal} editCall={null}
        defaultContactId={ctx?.contactId ?? null}
        defaultCompanyId={ctx?.companyId ?? null}
        defaultProjectId={ctx?.projectId ?? null}
      />
      <MeetingModal
        isOpen={activeModal === 'meeting'} onClose={closeModal} editMeeting={null}
        defaultContactId={ctx?.contactId ?? null}
        defaultCompanyId={ctx?.companyId ?? null}
        defaultProjectId={ctx?.projectId ?? null}
      />
      <ContactModal isOpen={activeModal === 'contact'} onClose={closeModal} editContact={null} />
      <CompanyModal isOpen={activeModal === 'company'} onClose={closeModal} editCompany={null} />
    </>
  );
}
