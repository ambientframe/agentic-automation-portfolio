import type { Metadata } from 'next';
import { EngagementSurface } from '@/components/commercial/engagement-surface';
import { COMMERCIAL_DECLARATION } from '@/lib/config/commercial-declaration';
import { resolveSourceProvenance } from '@/lib/config/source-provenance';

export const metadata: Metadata = {
  title: 'Revenue Leak Audit — engagement',
  description:
    'Draft: a bounded diagnostic of where an owner-run service firm drops paid-for demand. Fee and contact are unset until declared.',
};

export default function EngagementPage() {
  return (
    <EngagementSurface
      declaration={COMMERCIAL_DECLARATION}
      provenance={resolveSourceProvenance(process.env)}
    />
  );
}
