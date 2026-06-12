import { useState } from "react";
import { Timer, Timeline, Header } from "@/components/dashboard";

export default function Home() {
  const [activeTaskName, setActiveTaskName] = useState("");
  const [startToken, setStartToken] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const handleTaskStart = (name: string) => {
    setActiveTaskName(name);
    setStartToken((t) => t + 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 md:px-12 md:py-8 flex flex-col md:flex-row gap-10 items-start">
        <div
          className={`w-full transition-[flex-basis,max-width] duration-500 ease-out ${
            expanded ? "md:basis-[64%] md:max-w-[64%]" : "md:basis-[42%] md:max-w-[42%]"
          }`}
        >
          <div className="md:sticky md:top-24">
            <Timer
              activeTaskName={activeTaskName}
              onTaskNameChange={setActiveTaskName}
              startToken={startToken}
              expanded={expanded}
              onExpandedChange={setExpanded}
            />
          </div>
        </div>
        <div className="w-full flex-1 min-w-0">
          <Timeline onTaskSelect={setActiveTaskName} onTaskStart={handleTaskStart} />
        </div>
      </main>
    </div>
  );
}
