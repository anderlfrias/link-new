import { Logo } from "@/components/brand/Logo";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm px-4">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Logo variant="full" iconClassName="h-12 w-auto" textClassName="text-3xl" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Chat interno — iniciá sesión para continuar
        </p>
      </div>
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <LoginForm />
      </div>
    </div>
  );
}
