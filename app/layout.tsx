import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dosthai AI',
  description: 'A personal AI workspace for chat, coding, research, writing and creation.',
  applicationName: 'Dosthai AI',
  keywords: ['AI assistant', 'chat', 'coding', 'research', 'Dosthai'],
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#090b10'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}<script dangerouslySetInnerHTML={{ __html: "if ('serviceWorker' in navigator) window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });" }} /></body></html>;
}
