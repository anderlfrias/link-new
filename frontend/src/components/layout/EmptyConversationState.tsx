import { Logo } from "@/components/brand/Logo";

export function EmptyConversationState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center dark:bg-white/[0.02]">
      <Logo variant="icon" iconClassName="h-20 w-auto opacity-90" />
      <div>
        <p className="font-display text-xl font-semibold text-brand-ink dark:text-white">Link</p>
        <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
          Seleccioná una conversación para empezar a chatear.
        </p>
      </div>
    </div>
  );
}
