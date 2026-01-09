import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diff Checker',
  description: 'Spec–Design–Implementation Diff Checker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}



