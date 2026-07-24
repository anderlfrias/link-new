import { apiRequest } from "@/lib/api-client";
import type { LoginCredentials, LoginResponse } from "@/features/auth/types/auth.types";

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
}
