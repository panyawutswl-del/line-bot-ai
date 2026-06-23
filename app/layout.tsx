import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LINE Bot AI — ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
