import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Manrope, IBM_Plex_Sans, Onest, Unbounded } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { QueryProvider } from '@/components/layout/QueryProvider';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-manrope',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

// Aura theme: Onest for UI (русский гротеск), Unbounded for KPI-цифр и заголовков
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
});

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Torii CRM',
  description: 'PM + CRM + Аналитика',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={`t-aura ${GeistSans.variable} ${GeistMono.variable} ${manrope.variable} ${plexSans.variable} ${onest.variable} ${unbounded.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* FOUC-гард (P1 §2.2): применяем сохранённую тему до гидрации, иначе
            вспышка дефолтного t-aura (класс на <html>). Inline parser-blocking
            <script> первым ребёнком <body> — выполняется до отрисовки контента
            (паттерн next-themes). НЕ next/script beforeInteractive: тот рендерится
            ребёнком <html> → React 19 hydration error «<script> cannot be a child
            of <html>» (гейт-фикс волны 2). Значение уже с префиксом t-…
            (zustand-persist), второй раз НЕ добавляем. ThemeProvider ниже
            реконсилит реактивные переключения.
            AUDIT C: применяем ТОЛЬКО валидную тему; scandi/paper/sand и любое
            неизвестное значение → остаёмся на дефолте t-aura (миграция persisted). */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `try{var V=['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal'];var s=JSON.parse(localStorage.getItem('dashboard-theme'));var t=s&&s.state&&s.state.theme;if(t&&V.indexOf(t)!==-1&&t!=='t-aura'){var d=document.documentElement;d.classList.remove('t-aura');d.classList.add(t);}}catch(e){}`,
          }}
        />
        <QueryProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </QueryProvider>
        {/* AUDIT A1.1: глобальные toast-уведомления об ошибках мутаций.
            richColors — семантические цвета (error красный и т.д.). */}
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}
