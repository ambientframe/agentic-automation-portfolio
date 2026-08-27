import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, Newsreader, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { KESTREL } from '@/data/profiles/kestrel/profile';
import { ALL_SYSTEMS } from '@/data/systems';
import { MATURITY_LEVELS } from '@/lib/model/system';

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
        <Masthead />
        <main className="flex-1">{children}</main>
        <Colophon />
      </body>
    </html>
  );
}

/**
 * Always visible, on every page, above everything.
 *
 * The single most important commitment in this project is that nothing simulated may
 * masquerade as live. That commitment is worth a permanent fixture, not a footnote.
 */
function SimulationBanner() {
  return (
    <div className="border-b" style={{ background: 'var(--warn-bg)', borderColor: 'var(--rule-strong)' }}>
      <div className="mx-auto max-w-6xl px-6 py-2 flex items-center gap-3">
        <span
          className="badge"
          style={{ background: 'var(--warn)', color: 'var(--paper)', borderColor: 'var(--warn)' }}
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

/** N6 · Newspaper masthead. A technical bulletin, not a product nav. */
function Masthead() {
  /**
   * Tallied over the levels actually present, never over a hardcoded subset.
   *
   * This previously counted only SIMULATED, CONCEPT, and live — three buckets that between
   * them do not cover `MATURITY_LEVELS`. INTERACTIVE_PROTOTYPE fell through every one of
   * them, so the masthead on every page read "6 systems · 5 simulated · 0 concept · 0 live"
   * and the most advanced system in the portfolio was missing from the portfolio's own
   * headline. Deriving the tally makes that class of omission impossible rather than fixed.
   */
  const byLevel = MATURITY_LEVELS.map((level) => ({
    level,
    count: ALL_SYSTEMS.filter((s) => s.maturity === level).length,
  })).filter((entry) => entry.count > 0);

  return (
    <header className="masthead">
      <div className="mx-auto max-w-6xl px-6 pt-8 pb-4 text-center">
        <Link href="/" className="display text-2xl sm:text-3xl inline-block hover:opacity-70">
          Portfolio Flight Simulator
        </Link>
        <p className="label mt-3">
          {ALL_SYSTEMS.length} systems ·{' '}
          {byLevel
            .map(({ level, count }) => `${count} ${level.replace(/_/g, ' ').toLowerCase()}`)
            .join(' · ')}{' '}
          · Edition v0.1
        </p>
      </div>
    </header>
  );
}

/** Ft5 · Statement. Closes the page with the one thing that matters, then the meta line. */
function Colophon() {
  return (
    <footer className="border-t rule mt-24">
      <div className="mx-auto max-w-6xl px-6 py-12 space-y-6">
        <p className="display text-lg" style={{ maxWidth: '38ch' }}>
          Every scenario here replays deterministically. Nothing reaches a real customer,
          provider, or third party.
        </p>
        <div className="border-t rule pt-5 space-y-2">
          <p className="instrument" style={{ color: 'var(--ink-muted)' }}>
            {KESTREL.fictionalDisclosure}
          </p>
          <p className="instrument" style={{ color: 'var(--ink-faint)' }}>
            Operating standards are labelled by where they come from and how well they are
            supported. By default no model is called and no message leaves this process; each
            requires its own explicit opt-in, never a credential alone. Lead Rescue&rsquo;s operator
            console does write durable records to local disk — that is what makes its run history
            a record rather than a rehearsal.
          </p>
        </div>
      </div>
    </footer>
  );
}
