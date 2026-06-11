import { useState } from "react";
import { Timer, SessionLog, DailyPlanner, Header } from "@/components/dashboard";

export default function Home() {
  const [activeTaskName, setActiveTaskName] = useState("");
  const [startToken, setStartToken] = useState(0);

  const handleTaskStart = (name: string) => {
    setActiveTaskName(name);
    setStartToken((t) => t + 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5 flex flex-col gap-8">
          <Timer activeTaskName={activeTaskName} onTaskNameChange={setActiveTaskName} startToken={startToken} />
          <SessionLog />
        </div>
        <div className="md:col-span-7">
          <DailyPlanner onTaskSelect={setActiveTaskName} onTaskStart={handleTaskStart} />
        </div>
      </main>
    </div>
  );
}
