import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lesson Studio | Multilingual learning materials',
  description: 'Turn approved technical lessons into editable English, Marathi, and Hindi learning materials.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
