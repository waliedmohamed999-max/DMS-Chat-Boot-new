"use client";

import { useState, useTransition } from "react";
import { recordTestRun } from "@/app/dashboard/chatbot/actions";
import type { FlowGraph } from "@/lib/chatbot/types";
import { advanceSimulation, EMPTY_SIMULATION_SESSION, type SimulationBubble, type SimulationSession } from "@/lib/chatbot/simulate";
import { WhatsAppPreview } from "@/components/dashboard/WhatsAppPreview";

/** لوحة اختبار للقراءة فقط — تُستخدم من دور "موظف" الذي يملك صلاحية الاختبار دون دخول المحرر. */
export function ChatbotTestOnlyPanel({
  flowId,
  graph,
  storeName,
  connectedPhoneNumber,
}: {
  flowId: string;
  graph: FlowGraph;
  storeName: string;
  connectedPhoneNumber?: string | null;
}) {
  const [, startTransition] = useTransition();
  const [testInput, setTestInput] = useState("");
  const [testLog, setTestLog] = useState<SimulationBubble[]>([]);
  const [testSession, setTestSession] = useState<SimulationSession>(EMPTY_SIMULATION_SESSION);

  function runTest() {
    if (!testInput.trim()) return;
    const { bubbles, session, traversal } = advanceSimulation(graph, testSession, testInput);
    setTestLog((prev) => [...prev, ...bubbles]);
    setTestSession(session);
    setTestInput("");
    startTransition(() => recordTestRun(flowId, traversal));
  }

  function resetTest() {
    setTestLog([]);
    setTestSession(EMPTY_SIMULATION_SESSION);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col items-center">
        <p className="mb-2 text-center text-xs font-medium text-slate-400">معاينة المسار الأساسي</p>
        <WhatsAppPreview
          graph={graph}
          storeName={storeName}
          connectedPhoneNumber={connectedPhoneNumber}
          liveLog={testLog}
          input={{ value: testInput, onChange: setTestInput, onSend: runTest }}
        />
      </div>

      <div className="card flex h-fit flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">🧪 اختبار التدفق</h2>
          {testLog.length > 0 && (
            <button onClick={resetTest} className="text-[11px] text-accent-400 hover:underline">
              🔄 إعادة تشغيل المحادثة
            </button>
          )}
        </div>
        {testSession.currentNodeId && (
          <p className="mb-2 rounded-lg border border-accent-500/20 bg-accent-500/5 px-2.5 py-1.5 text-[11px] text-accent-300">
            💬 البوت بانتظار ردك على السؤال الأخير — اكتب رداً واقعياً لمتابعة نفس المحادثة.
          </p>
        )}
        <div className="mb-3 max-h-80 flex-1 space-y-2 overflow-y-auto">
          {testLog.length === 0 && <p className="text-xs text-slate-500">اكتب رسالة تجريبية أدناه لمعاينة رد البوت.</p>}
          {testLog.map((entry, i) => (
            <div key={i} className={`flex ${entry.from === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${entry.from === "user" ? "bg-accent-500 text-white" : "bg-navy-700 text-slate-200"}`}>
                {entry.text}
                {entry.link && <div className="mt-1 border-t border-white/10 pt-1 text-accent-300">🔗 {entry.link.text}</div>}
                {entry.media && (
                  <div className="mt-1 border-t border-white/10 pt-1 text-accent-300">
                    {entry.media.type === "image" ? "🖼️" : entry.media.type === "video" ? "🎥" : "📎"} {entry.media.filename || entry.media.type}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runTest()}
            className="input-field flex-1 text-xs"
            placeholder="مثال: أين طلبي؟"
          />
          <button onClick={runTest} className="btn-primary text-xs">
            إرسال
          </button>
        </div>
      </div>
    </div>
  );
}
