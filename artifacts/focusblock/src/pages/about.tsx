import { Header } from "@/components/dashboard";
import { ListChecks, Play, Heart, Gauge } from "lucide-react";

const steps = [
  {
    icon: ListChecks,
    title: "Plan your day",
    body: "Type what you want to work on and choose how many 30-minute blocks it needs. Each block is one focused chunk.",
  },
  {
    icon: Play,
    title: "Start a block",
    body: "Pick a task and press start. The timer counts down 30 minutes of deep work, then queues a short break.",
  },
  {
    icon: Heart,
    title: "Rate & log it",
    body: "When the timer ends, mark how it went. Finished blocks settle into your timeline under the day you completed them.",
  },
  {
    icon: Gauge,
    title: "Stay on budget",
    body: "Watch the chunks left until 5 PM and the day-budget meter to see if your plan fits the time you have.",
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col font-sans">
      <Header />
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-16 md:py-24">
        <header className="mb-16">
          <p className="text-xs tracking-[0.2em] text-muted-foreground mb-4">
            about
          </p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground leading-tight">
            Deep work, one quiet block at a time.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            FocusBlock turns your day into calm 30-minute chunks. Plan a little,
            focus fully, and let the timeline remember the rest.
          </p>
        </header>

        <ol className="space-y-12">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-5">
              <div className="flex flex-col items-center pt-0.5">
                <span className="text-xs font-mono text-muted-foreground/70 mb-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <step.icon
                  className="w-[18px] h-[18px] text-primary"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex-1 pt-0.5">
                <h3 className="text-base font-medium tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-20 text-sm leading-relaxed text-muted-foreground/80 border-t border-border pt-8">
          That's all there is to it. No streaks, no noise — just enough structure
          to protect your focus.
        </p>
      </main>
    </div>
  );
}
