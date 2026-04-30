import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SerialMonitor } from "./SerialMonitor";
import { SerialPlotter } from "./SerialPlotter";
import { useEffect, useState } from "react";

interface Props {
  onSerialIn: (text: string) => void;
}

export function SerialPanel({ onSerialIn }: Props) {
  const [tab, setTab] = useState<"monitor" | "plotter">("monitor");

  useEffect(() => {
    const onMonitor = () => setTab("monitor");
    const onPlotter = () => setTab("plotter");
    window.addEventListener("ide:open-serial", onMonitor);
    window.addEventListener("ide:open-plotter", onPlotter);
    return () => {
      window.removeEventListener("ide:open-serial", onMonitor);
      window.removeEventListener("ide:open-plotter", onPlotter);
    };
  }, []);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="h-full flex flex-col bg-card">
      <TabsList className="rounded-none h-7 px-2 self-start bg-transparent">
        <TabsTrigger value="monitor" className="text-xs">Serial Monitor</TabsTrigger>
        <TabsTrigger value="plotter" className="text-xs">Serial Plotter</TabsTrigger>
      </TabsList>
      <TabsContent value="monitor" className="flex-1 min-h-0 mt-0">
        <SerialMonitor onSerialIn={onSerialIn} />
      </TabsContent>
      <TabsContent value="plotter" className="flex-1 min-h-0 mt-0">
        <SerialPlotter />
      </TabsContent>
    </Tabs>
  );
}
