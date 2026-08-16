"use client";

import { useState, useTransition } from "react";
import { sendTestMessage } from "../actions";
import type { ChatHistoryMessage } from "@/lib/ai/generateReply";

type Bubble = { from: "user" | "bot"; text: string; diagnostic?: boolean };

export function TestChatPanel({ agentName }: { agentName: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [history, setHistory] = useState<ChatHistoryMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    const message = input.trim();
    if (!message || isPending) return;
    setInput("");
    setBubbles((b) => [...b, { from: "user", text: message }]);

    startTransition(async () => {
      const result = await sendTestMessage(history, message);
      setHistory((h) => [...h, { role: "user", content: message }]);

      if (result.kind === "reply") {
        setBubbles((b) => [...b, { from: "bot", text: result.text }, { from: "bot", text: `ثقة الرد: ${result.confidence}%`, diagnostic: true }]);
        setHistory((h) => [...h, { role: "assistant", content: result.text }]);
      } else if (result.kind === "handoff") {
        setBubbles((b) => [...b, { from: "bot", text: `↳ تحويل لموظف بشري: ${result.reason}`, diagnostic: true }]);
      } else {
        setBubbles((b) => [...b, { from: "bot", text: `⚠️ خطأ: ${result.message}`, diagnostic: true }]);
      }
    });
  }

  return (
    <div className="card flex h-[560px] max-w-2xl flex-col p-4">
      <div className="mb-3 border-b border-white/5 pb-2 text-sm text-slate-400">
        محادثة تجريبية مع "{agentName}" — لا تُحتسَب على المحادثات الحقيقية، لكنها تستهلك من حصة التوكنز الشهرية فعلياً.
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {bubbles.length === 0 && <p className="text-center text-sm text-slate-500">اكتب رسالة أدناه كأنك عميل لتجربة الموظف الذكي...</p>}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-xl2 px-3 py-2 text-sm ${
                b.diagnostic
                  ? "bg-transparent text-xs text-slate-500 italic"
                  : b.from === "user"
                    ? "bg-accent-500 text-white"
                    : "bg-white/10 text-slate-100"
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
        {isPending && <p className="text-xs text-slate-500">"{agentName}" يكتب الآن...</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="input-field flex-1 text-sm"
          placeholder="اكتب رسالتك..."
        />
        <button onClick={handleSend} disabled={isPending} className="btn-primary text-sm">إرسال</button>
      </div>
    </div>
  );
}
