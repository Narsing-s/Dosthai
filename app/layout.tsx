import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dosthai AI',
  description: 'A personal general-purpose AI assistant platform.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
