"use client";

import { useMemo } from "react";
import { IconCheckbox, IconCheck, IconCircle, IconCircleDot, IconSquare } from "@tabler/icons-react";
import { cn } from "@/utils/cn";
import type { Poll } from "@/features/messages/types/message.types";

interface PollMessageCardProps {
  poll: Poll;
  isOwn: boolean;
  currentUserId: string;
  onVote?: (optionId: string) => void | Promise<void>;
  footer: React.ReactNode;
}

export function PollMessageCard({
  poll,
  isOwn,
  currentUserId,
  onVote,
  footer,
}: PollMessageCardProps) {
  const totalVotes = useMemo(() => {
    return poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);
  }, [poll.options]);

  return (
    <div className="flex flex-col gap-2.5 py-1">
      {/* Header */}
      <div>
        <h4
          className={cn(
            "text-[15px] font-semibold leading-snug break-words",
            isOwn ? "text-white" : "text-brand-ink dark:text-white",
          )}
        >
          {poll.question}
        </h4>
        <div
          className={cn(
            "mt-0.5 inline-flex items-center text-[11px] font-medium tracking-wide uppercase",
            isOwn ? "text-white/70" : "text-neutral-500 dark:text-neutral-400",
          )}
        >
          {poll.allowMultiple ? "Selección múltiple" : "Selección única"}
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-1.5" role="group" aria-label={poll.question}>
        {poll.options.map((option) => {
          const isVoted = option.votes.some((v) => v.userId === currentUserId);
          const percentage = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onVote?.(option.id)}
              className={cn(
                "group relative flex w-full items-center justify-between overflow-hidden rounded-xl border p-2 text-left transition-all select-none active:scale-[0.99]",
                isOwn
                  ? isVoted
                    ? "border-white/50 bg-white/20 text-white"
                    : "border-white/20 bg-white/10 text-white hover:bg-white/15"
                  : isVoted
                    ? "border-brand-blue bg-brand-blue/10 text-brand-ink dark:border-brand-blue dark:bg-brand-blue/20 dark:text-white"
                    : "border-black/5 bg-black/[0.02] text-brand-ink hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10",
              )}
              aria-pressed={isVoted}
            >
              {/* Progress bar background fill */}
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
                aria-hidden="true"
              >
                <div
                  style={{ width: `${percentage}%` }}
                  className={cn(
                    "h-full transition-all duration-300 ease-out",
                    isOwn
                      ? "bg-white/20"
                      : isVoted
                        ? "bg-brand-blue/25 dark:bg-brand-blue/35"
                        : "bg-black/10 dark:bg-white/10",
                  )}
                />
              </div>

              {/* Option content */}
              <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-2">
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center transition-colors",
                    isOwn
                      ? "text-white"
                      : isVoted
                        ? "text-brand-blue"
                        : "text-neutral-400 group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300",
                  )}
                >
                  {poll.allowMultiple ? (
                    isVoted ? (
                      <IconCheckbox size={18} stroke={2} />
                    ) : (
                      <IconSquare size={18} stroke={1.75} />
                    )
                  ) : isVoted ? (
                    <IconCircleDot size={18} stroke={2.25} />
                  ) : (
                    <IconCircle size={18} stroke={1.75} />
                  )}
                </span>
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    isVoted && "font-semibold",
                  )}
                >
                  {option.text}
                </span>
              </div>

              {/* Percentage & Vote count */}
              <div className="relative z-10 flex shrink-0 items-baseline gap-1 text-right">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    isOwn
                      ? "text-white"
                      : isVoted
                        ? "text-brand-blue dark:text-brand-blue-light"
                        : "text-neutral-600 dark:text-neutral-300",
                  )}
                >
                  {percentage}%
                </span>
                {option.voteCount > 0 && (
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
                    )}
                  >
                    ({option.voteCount})
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <span
          className={cn(
            "text-[11px] font-medium",
            isOwn ? "text-white/80" : "text-neutral-500 dark:text-neutral-400",
          )}
        >
          {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
        </span>
        <div>{footer}</div>
      </div>
    </div>
  );
}
