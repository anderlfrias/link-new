"use client";

import { useState } from "react";
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CreatePollPayload } from "@/features/messages/types/message.types";

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreatePollPayload) => void | Promise<void>;
}

export function CreatePollModal({ isOpen, onClose, onSubmit }: CreatePollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOptionChange = (index: number, value: string) => {
    setError(null);
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddOption = () => {
    if (options.length >= 12) return;
    setError(null);
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setError(null);
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      setError("Debes escribir una pregunta para la encuesta.");
      return;
    }

    const cleanOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError("Debes incluir al menos 2 opciones con texto.");
      return;
    }

    const uniqueSet = new Set(cleanOptions.map((opt) => opt.toLowerCase()));
    if (uniqueSet.size !== cleanOptions.length) {
      setError("Las opciones no pueden ser iguales entre sí.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        question: cleanQuestion,
        options: cleanOptions,
        allowMultiple,
      });
      // Reset form
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la encuesta.");
    } finally {
      setSubmitting(false);
    }
  };

  const cleanOptions = options.map((opt) => opt.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && cleanOptions.length >= 2 && !submitting;

  return (
    <Modal onClose={onClose} aria-label="Crear encuesta">
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
          <h2 className="text-base font-semibold text-brand-ink dark:text-white">Crear encuesta</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            <IconX size={18} stroke={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="poll-question" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
              Pregunta
            </label>
            <Input
              id="poll-question"
              placeholder="¿Hacer una pregunta?"
              value={question}
              onChange={(e) => {
                setError(null);
                setQuestion(e.target.value);
              }}
              maxLength={500}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
              Opciones
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder={`Opción ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    maxLength={200}
                    aria-label={`Opción ${idx + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      title="Eliminar opción"
                      aria-label={`Eliminar opción ${idx + 1}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                    >
                      <IconTrash size={16} stroke={1.75} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 12 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:text-brand-blue-dark dark:hover:text-brand-blue"
              >
                <IconPlus size={16} stroke={2} />
                Agregar opción
              </button>
            )}
          </div>

          {/* Permitir varias respuestas */}
          <div className="pt-2 border-t border-black/5 dark:border-white/10">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <span className="text-sm font-medium text-brand-ink dark:text-white">
                  Permitir varias respuestas
                </span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Los participantes pueden votar en más de una opción
                </p>
              </div>
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-brand-blue focus:ring-brand-blue dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Creando..." : "Crear encuesta"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
