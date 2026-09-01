import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://arena.swami.dev'),
  title: '· swArena ·',
  description: 'SwArena server status and account creation.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          defer
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
