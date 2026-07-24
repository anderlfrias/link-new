import type { UserStatus } from "@/features/conversations/types/conversation.types";

/** Ver backend/src/modules/users — directorio de usuarios para "chat nuevo". */
export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  avatarFileId: string | null;
  status: UserStatus;
}
