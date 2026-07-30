"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCamera,
  IconLoader2,
  IconSearch,
  IconUsers,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContactRow } from "@/features/users/components/ContactRow";
import { useUsers } from "@/features/users/hooks/use-users";
import { useStartConversation } from "@/features/conversations/hooks/use-start-conversation";
import { useCreateGroup } from "@/features/conversations/hooks/use-create-group";
import { buildStoredFileUrl } from "@/utils/file-url";

interface NewChatModalProps {
  onClose: () => void;
}

type Step = "contacts" | "selectMembers" | "groupDetails";

/** Un solo modal para dos flujos: elegir 1 contacto (chat privado, como antes)
 * o "Nuevo grupo" (elegir 2+ participantes, después nombre/foto). */
export function NewChatModal({ onClose }: NewChatModalProps) {
  const [step, setStep] = useState<Step>("contacts");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupImage, setGroupImage] = useState<File | null>(null);
  const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);

  const { users, status } = useUsers(true);
  const { startWithUser, pending: startingChat, error: startError } = useStartConversation();
  const { createGroup, pending: creatingGroup, error: groupError } = useCreateGroup();

  useEffect(() => {
    // Revoca el object URL anterior al elegir una foto nueva y al desmontar
    // (nunca al montar, porque el valor inicial es null).
    return () => {
      if (groupImagePreview) URL.revokeObjectURL(groupImagePreview);
    };
  }, [groupImagePreview]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    );
  }, [users, search]);

  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));

  async function handleSelectContact(userId: string) {
    const conversation = await startWithUser(userId);
    if (conversation) onClose();
  }

  function toggleMember(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function handleGroupImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setGroupImage(file);
    setGroupImagePreview(URL.createObjectURL(file));
  }

  async function handleCreateGroup() {
    const trimmedName = groupName.trim();
    if (!trimmedName || selectedIds.length < 2) return;
    const conversation = await createGroup(selectedIds, trimmedName, groupImage);
    if (conversation) onClose();
  }

  function goBack() {
    setSearch("");
    setStep(step === "groupDetails" ? "selectMembers" : "contacts");
  }

  const error = startError || groupError;

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {step !== "contacts" && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Volver"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <IconArrowLeft size={20} stroke={1.75} />
            </button>
          )}
          <h2 className="truncate font-display text-lg font-semibold text-brand-ink dark:text-white">
            {step === "contacts" && "Chat nuevo"}
            {step === "selectMembers" &&
              `Elegir participantes${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
            {step === "groupDetails" && "Datos del grupo"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.75} />
        </button>
      </div>

      {step !== "groupDetails" && (
        <div className="px-3 pb-2">
          <Input
            icon={<IconSearch size={16} stroke={1.75} />}
            placeholder={step === "contacts" ? "Buscar contacto" : "Buscar"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>
      )}

      {error && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "contacts" && (
        <>
          <button
            type="button"
            onClick={() => {
              setSelectedIds([]);
              setSearch("");
              setStep("selectMembers");
            }}
            className="flex w-full items-center gap-3 border-b border-black/5 px-4 py-3 text-left transition-colors hover:bg-black/3 dark:border-white/10 dark:hover:bg-white/5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
              <IconUsersGroup size={22} stroke={1.75} />
            </span>
            <p className="font-medium text-brand-ink dark:text-white">Nuevo grupo</p>
          </button>

          {(status === "loading" || status === "idle") && (
            <div className="flex flex-1 items-center justify-center py-8">
              <IconLoader2 className="animate-spin text-brand-blue" size={24} />
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-1 items-center justify-center px-6 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se pudieron cargar los contactos.
            </div>
          )}
          {status === "ready" && filtered.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <IconUsers size={32} className="text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {search ? "Sin resultados" : "No hay otros usuarios todavía"}
              </p>
            </div>
          )}
          {status === "ready" && filtered.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.map((user) => (
                <ContactRow key={user.id} user={user} disabled={startingChat} onClick={() => handleSelectContact(user.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {step === "selectMembers" && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <IconUsers size={32} className="text-neutral-300 dark:text-neutral-600" />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {search ? "Sin resultados" : "No hay otros usuarios todavía"}
                </p>
              </div>
            )}
            {filtered.map((user) => (
              <ContactRow
                key={user.id}
                user={user}
                selected={selectedIds.includes(user.id)}
                onClick={() => toggleMember(user.id)}
              />
            ))}
          </div>
          <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">
            <Button type="button" className="w-full" disabled={selectedIds.length < 2} onClick={() => setStep("groupDetails")}>
              Siguiente
            </Button>
            {selectedIds.length === 1 && (
              <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                Elegí al menos una persona más
              </p>
            )}
          </div>
        </>
      )}

      {step === "groupDetails" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative">
              <Avatar name={groupName || "Grupo"} imageUrl={groupImagePreview} size="xl" />
              <label
                htmlFor="group-image-input"
                aria-label="Elegir foto del grupo"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-blue text-white shadow"
              >
                <IconCamera size={16} stroke={1.75} />
              </label>
              <input
                id="group-image-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleGroupImageChange}
              />
            </div>
          </div>

          <Input
            placeholder="Nombre del grupo"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            maxLength={120}
            autoFocus
          />

          <div className="mt-4">
            <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
              Participantes ({selectedUsers.length})
            </p>
            <div className="flex flex-wrap gap-3">
              {selectedUsers.map((user) => (
                <div key={user.id} className="flex w-16 flex-col items-center gap-1">
                  <Avatar
                    name={user.name}
                    imageUrl={user.avatarFile ? buildStoredFileUrl(user.avatarFile.path) : null}
                    size="md"
                  />
                  <p className="w-full truncate text-center text-xs text-neutral-500 dark:text-neutral-400">
                    {user.name.split(" ")[0]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <Button
            type="button"
            className="mt-6 w-full"
            disabled={!groupName.trim() || creatingGroup}
            onClick={handleCreateGroup}
          >
            {creatingGroup ? <IconLoader2 className="animate-spin" size={16} /> : "Crear grupo"}
          </Button>
        </div>
      )}
    </div>
  );
}
