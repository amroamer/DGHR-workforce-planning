import { Hammer } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { PageBody } from "./AppShell";
import { EmptyState } from "./EmptyState";

// Placeholder for a mockup-backed screen that is scheduled but not yet built in this phase.
// Renders the real title + full chrome (header/persona/skyline) so the shell is verifiable.
export function TodoScreen({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle?: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div className="rounded-card border border-dashed border-border bg-card">
          <EmptyState
            icon={<Hammer size={24} />}
            tone="#2563EB"
            toneBg="#DBEAFE"
            title={`${title} — coming in ${phase}`}
            description="This mockup-backed screen is scheduled in the phase plan. The app shell, header, persona switch, and notifications are live now."
          />
        </div>
      </PageBody>
    </>
  );
}
