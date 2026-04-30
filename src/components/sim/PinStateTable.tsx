import { useSimStore } from "@/sim/store";

export function PinStateTable() {
  const pinStates = useSimStore((s) => s.pinStates);
  const entries = Object.entries(pinStates).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="bg-card border-t border-border h-full flex flex-col">
      <div className="px-3 py-1.5 text-xs font-semibold border-b border-border text-foreground/80">
        Pin States
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground italic p-3">No pin activity yet.</div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="text-muted-foreground">
              <tr><th className="text-left px-3 py-1">Pin</th><th className="text-left">Mode</th><th className="text-left">Value</th></tr>
            </thead>
            <tbody>
              {entries.map(([pin, st]) => {
                const n = Number(pin);
                const label = n >= 14 ? `A${n - 14}` : `D${n}`;
                return (
                  <tr key={pin} className="border-t border-border/50">
                    <td className="px-3 py-1 text-primary">{label}</td>
                    <td>{st.mode}</td>
                    <td>
                      <span className={st.digital ? "text-success" : "text-muted-foreground"}>
                        {st.digital ? "HIGH" : "LOW"}
                      </span>
                      {st.analog > 0 && st.analog < 255 && <span className="text-warning ml-2">PWM {st.analog}</span>}
                      {n >= 14 && <span className="text-warning ml-2">A {st.analog}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
