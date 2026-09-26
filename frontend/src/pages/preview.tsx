import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Common/Iconify/icons';
import { GradientBackground } from '@/components/Common/GradientBackground';
import { ScreenSwitcher, type PreviewScreen } from '@/components/Common/ScreenSwitcher';

const SCREENS: PreviewScreen[] = [
  { id: 'agenda', labelKey: 'agenda', icon: 'solar:calendar-mark-linear' },
  { id: 'notes', labelKey: 'notes', icon: 'solar:bill-list-linear' },
  { id: 'graph', labelKey: 'graph', icon: 'hugeicons:share-05' },
];

const AGENDA_LANES = [
  { name: 'Todo', cards: ['Release checklist', 'Team notes'] },
  { name: 'Doing', cards: ['Feature tracking'] },
  { name: 'Done', cards: ['Startup story'] },
];

const NOTE_CARDS = [
  { title: 'Agenda/Main', excerpt: 'The merged stream of notes and plans.' },
  { title: 'Meeting agenda', excerpt: 'Decisions, owners, and follow-ups.' },
  { title: 'Task tracking', excerpt: 'Small steps with visible progress.' },
  { title: 'Team notes', excerpt: 'Shared context, kept current.' },
];

/**
 * Public animated product preview (no login, no data).
 * Static mock screens over the auth gradient background, switched by the
 * floating right-edge tab switcher. Linked from the README demo section.
 */
export default function Component() {
  const { t } = useTranslation();
  const [active, setActive] = useState('agenda');

  return (
    <GradientBackground>
      <style>{`
        @keyframes preview-enter {
          from { opacity: 0; transform: translateY(14px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .preview-screen-enter { animation: preview-enter 0.35s ease-out both; }
        @keyframes preview-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .preview-node-pulse { animation: preview-pulse 2.4s ease-in-out infinite; }
      `}</style>
      <div className="flex min-h-full w-screen flex-col items-center gap-6 p-4 sm:p-8">
        <div className="flex items-center gap-3 pt-4 text-xl font-medium">
          <img src="/planinc-lockup-h.svg" alt="PlanInc" width={140} className="rounded-none" />
          <Badge variant="secondary">Preview</Badge>
        </div>

        <div key={active} className="preview-screen-enter w-full max-w-4xl">
          {active === 'agenda' && (
            <div className="grid gap-3 sm:grid-cols-3">
              {AGENDA_LANES.map((lane) => (
                <Card key={lane.name} className="glass-effect">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{lane.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {lane.cards.map((card) => (
                      <div key={card} className="rounded-md border border-border bg-card p-2 text-sm">
                        {card}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {active === 'notes' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {NOTE_CARDS.map((note) => (
                <Card key={note.title} className="glass-effect">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{note.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {note.excerpt}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {active === 'graph' && (
            <Card className="glass-effect">
              <CardContent className="flex justify-center p-6">
                <svg width="320" height="200" viewBox="0 0 320 200" role="img" aria-label="graph preview">
                  <line x1="60" y1="100" x2="160" y2="60" stroke="var(--border)" strokeWidth="2" />
                  <line x1="60" y1="100" x2="160" y2="140" stroke="var(--border)" strokeWidth="2" />
                  <line x1="160" y1="60" x2="260" y2="100" stroke="var(--border)" strokeWidth="2" />
                  <line x1="160" y1="140" x2="260" y2="100" stroke="var(--border)" strokeWidth="2" />
                  <circle cx="60" cy="100" r="18" fill="var(--primary)" className="preview-node-pulse" />
                  <circle cx="160" cy="60" r="14" fill="var(--secondary)" className="preview-node-pulse" />
                  <circle cx="160" cy="140" r="14" fill="var(--secondary)" className="preview-node-pulse" />
                  <circle cx="260" cy="100" r="18" fill="var(--primary)" className="preview-node-pulse" />
                </svg>
              </CardContent>
            </Card>
          )}
        </div>

        <Link to="/signin">
          <Button size="lg">
            <Icon icon="solar:login-bold" className="mr-2 text-xl" />
            {t('sign-in')}
          </Button>
        </Link>
      </div>
      <ScreenSwitcher screens={SCREENS} active={active} onChange={setActive} />
    </GradientBackground>
  );
}
