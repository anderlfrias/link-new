"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
  IconUser,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api.types";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ user, password });
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión. Intentá de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <Input
        type="text"
        placeholder="Usuario"
        autoComplete="username"
        icon={<IconUser size={18} stroke={1.75} />}
        value={user}
        onChange={(event) => setUser(event.target.value)}
        required
      />
      <Input
        type={showPassword ? "text" : "password"}
        placeholder="Contraseña"
        autoComplete="current-password"
        icon={<IconLock size={18} stroke={1.75} />}
        rightElement={
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="text-neutral-400 hover:text-brand-ink dark:hover:text-white"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <IconEyeOff size={18} stroke={1.75} />
            ) : (
              <IconEye size={18} stroke={1.75} />
            )}
          </button>
        }
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading && <IconLoader2 size={18} className="animate-spin" />}
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
