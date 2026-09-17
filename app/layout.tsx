import type { Metadata, Viewport } from 'next';
import './globals.css';
import DosthaiRuntime from './components/dosthai-runtime';

export const metadata: Metadata = {
  title: 'Dosthai AI',
  description: 'A personal AI workspace for chat, coding, research, writing and creation.',
  applicationName: 'Dosthai AI',
  keywords: ['AI assistant', 'chat', 'coding', 'research', 'Dosthai'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  icons: { icon: '/icon.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#090b10'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}<DosthaiRuntime /></body></html>;
}
