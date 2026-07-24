import { apiRequest } from "@/lib/api-client";
import type { DirectoryUser } from "@/features/users/types/user.types";

export function listUsers(token: string, search?: string): Promise<DirectoryUser[]> {
  return apiRequest<DirectoryUser[]>("/v1/users", { token, query: { search } });
}
