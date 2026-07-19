import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { usePersona } from "@/stores/persona";

// "Part of the full release" placeholder (SPEC §9.8). No dead links, ever.
export function PlaceholderPage({ title }: { title: string }) {
  const navigate = useNavigate();
  const { persona } = usePersona();
  const home = persona.type === "dghr" ? "/dghr/government" : "/entity/departments";
  const homeLabel = persona.type === "dghr" ? "Government Position" : "Departments";
  return (
    <div className="mx-auto max-w-3xl pt-8">
      <div className="rounded-card border border-border bg-card shadow-card">
        <EmptyState
          icon={<Sparkles size={26} />}
          tone="#0D9488"
          toneBg="#E6F7F4"
          title="Coming with the full release"
          description={`${title} is part of the DGHR Workforce Planning Portal roadmap.`}
          action={
            <Button variant="secondary" onClick={() => navigate(home)}>
              ← Back to {homeLabel}
            </Button>
          }
        />
      </div>
    </div>
  );
}
