import * as UserRepository from "./user.repository";

export function listUsers(currentUserId: string, search?: string) {
  return UserRepository.search(currentUserId, search);
}
