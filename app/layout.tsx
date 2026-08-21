import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, Newsreader, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { KESTREL } from '@/data/profiles/kestrel/profile';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const newsreader = Newsreader({ variable: '--font-newsreader', subsets: ['latin'], display: 'swap' });
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Portfolio Flight Simulator',
  description:
    'An interactive systems-engineering laboratory showing how business incidents move through state, decisions, policy, bounded AI judgment, human authority, actions, verification, and recovery.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SimulationBanner />
        <header className="border-b rule">
          <div className="mx-auto max-w-6xl px-6 py-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Link href="/" className="display text-lg tracking-tight hover:opacity-70 transition-opacity">
              Portfolio Flight Simulator
            </Link>
            <span className="label">v0.1 · Interactive prototype</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t rule mt-24">
          <div className="mx-auto max-w-6xl px-6 py-10 space-y-3">
            <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
              {KESTREL.fictionalDisclosure}
            </p>
            <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
              Every run in this application is a deterministic simulation. No message, record write,
              or notification leaves this process, and no model is called. Operating standards are
              labelled by where they come from and how well they are supported.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/**
 * Always visible, on every page, above everything.
 *
 * The single most important commitment in the brief is that nothing simulated may
 * masquerade as live. That commitment is worth a permanent fixture, not a footnote.
 */
function SimulationBanner() {
  return (
    <div
      className="border-b"
      style={{ background: 'var(--warn-bg)', borderColor: 'var(--rule-strong)' }}
    >
      <div className="mx-auto max-w-6xl px-6 py-2 flex items-center gap-3">
        <span
          className="badge"
          style={{
            background: 'var(--warn)',
            color: 'var(--paper)',
            borderColor: 'var(--warn)',
          }}
        >
          Simulated
        </span>
        <p className="instrument" style={{ color: 'var(--warn)' }}>
          Nothing here is connected to a live system. All businesses, people, and incidents are
          fictional.
        </p>
      </div>
    </div>
  );
}
