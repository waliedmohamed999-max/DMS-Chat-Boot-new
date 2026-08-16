"use client";

import { useState, useTransition } from "react";
import { rateAiReplyLog } from "../actions";

export function RateButtons({ logId, currentRating }: { logId: string; currentRating: "HELPFUL" | "INACCURATE" | null }) {
  const [rating, setRating] = useState(currentRating);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rateAiReplyLog(logId, "HELPFUL"); setRating("HELPFUL"); })}
        className={`text-xs ${rating === "HELPFUL" ? "text-success-500" : "text-slate-500 hover:text-success-500"}`}
      >
        👍 مفيد
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rateAiReplyLog(logId, "INACCURATE"); setRating("INACCURATE"); })}
        className={`text-xs ${rating === "INACCURATE" ? "text-danger-500" : "text-slate-500 hover:text-danger-500"}`}
      >
        👎 غير دقيق
      </button>
    </div>
  );
}
