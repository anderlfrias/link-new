"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { IconHelpCircle, IconPlus, IconX } from "@tabler/icons-react";
import { FILE_TYPE_CATEGORIES } from "@/features/admin/constants/file-type-categories.constant";
import { FILE_TYPE_EXTENSION_ALIASES } from "@/features/admin/constants/file-type-extension-aliases.constant";
import { useTranslation } from "@/i18n";
import { isValidMimeTypePattern } from "@/utils/mime-type-pattern";
import { cn } from "@/utils/cn";

/** Una opción elegida es una categoría curada (expande a varios mime patterns, ver
 * FILE_TYPE_CATEGORIES) o un valor resuelto a mano — uno o más mime patterns reales, ya sea
 * porque el admin escribió el mime type completo o una extensión conocida que este componente
 * tradujo sola (ver FILE_TYPE_EXTENSION_ALIASES; `label` guarda lo que el admin tipeó, para
 * mostrarlo, pero lo que se manda al backend son siempre `patterns`).
 * `AdminSettingsPanel` traduce esto hacia/desde el `fileTypeList: string[]` plano — el backend
 * nunca ve ni valida nada que no sea un mime pattern real. */
export type FileTypeSelectionItem =
  | { type: "category"; id: string }
  | { type: "custom"; label: string; patterns: string[] };

interface FileTypeMultiSelectProps {
  label: string;
  value: FileTypeSelectionItem[];
  onChange: (next: FileTypeSelectionItem[]) => void;
}

function itemKey(item: FileTypeSelectionItem): string {
  return item.type === "category" ? `category:${item.id}` : `custom:${item.patterns.join(",")}`;
}

function itemLabel(item: FileTypeSelectionItem): string {
  if (item.type === "custom") return item.label;
  return FILE_TYPE_CATEGORIES.find((category) => category.id === item.id)?.label ?? item.id;
}

/** Todos los mime patterns que ya están cubiertos por la selección actual — categorías
 * expandidas a sus patterns más los de cada chip personalizado — para no ofrecer agregar de
 * nuevo algo que ya está adentro (ej. tipear ".pdf" con la categoría "PDF" ya elegida). */
function coveredPatterns(value: FileTypeSelectionItem[]): Set<string> {
  const set = new Set<string>();
  for (const item of value) {
    if (item.type === "category") {
      FILE_TYPE_CATEGORIES.find((category) => category.id === item.id)?.patterns.forEach((pattern) =>
        set.add(pattern),
      );
    } else {
      item.patterns.forEach((pattern) => set.add(pattern));
    }
  }
  return set;
}

function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((entry) => setB.has(entry));
}

export function FileTypeMultiSelect({ label, value, onChange }: FileTypeMultiSelectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableCategories = useMemo(
    () =>
      FILE_TYPE_CATEGORIES.filter(
        (category) => !value.some((item) => item.type === "category" && item.id === category.id),
      ),
    [value],
  );
  const covered = useMemo(() => coveredPatterns(value), [value]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCategories = normalizedQuery
    ? availableCategories.filter((category) => category.label.toLowerCase().includes(normalizedQuery))
    : availableCategories;

  const trimmedQuery = query.trim();
  const exactCategoryMatch = filteredCategories.some((category) => category.label.toLowerCase() === normalizedQuery);

  // Sin "/" no puede ser un mime type — se interpreta como una extensión
  // (con o sin punto: ".pdf" o "pdf") y se busca en el alias conocido. Con
  // "/" se valida como mime type literal, igual que antes.
  const hasSlash = trimmedQuery.includes("/");
  const extensionKey = trimmedQuery.replace(/^\./, "").toLowerCase();
  const resolvedFromExtension = !hasSlash ? FILE_TYPE_EXTENSION_ALIASES[extensionKey] : undefined;
  const candidatePatterns = resolvedFromExtension ?? (hasSlash && isValidMimeTypePattern(trimmedQuery) ? [trimmedQuery.toLowerCase()] : undefined);
  const newPatterns = candidatePatterns?.filter((pattern) => !covered.has(pattern)) ?? [];
  // Si lo resuelto coincide EXACTO con una categoría entera (ej. ".pdf" == la categoría "PDF"),
  // agregar esa categoría en vez de un chip personalizado — mismo resultado, mejor label.
  const matchingCategory = candidatePatterns
    ? availableCategories.find((category) => sameMembers(category.patterns, candidatePatterns))
    : undefined;

  const showCustomOption = trimmedQuery.length > 0 && !exactCategoryMatch && (matchingCategory != null || newPatterns.length > 0);
  const customRowIndex = filteredCategories.length;
  const rowCount = filteredCategories.length + (showCustomOption ? 1 : 0);

  useEffect(() => {
    setHighlighted(0);
  }, [query, value.length]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!helpOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [helpOpen]);

  function addCategory(id: string) {
    onChange([...value, { type: "category", id }]);
    setQuery("");
    inputRef.current?.focus();
  }

  function addCustom() {
    if (matchingCategory) {
      addCategory(matchingCategory.id);
      return;
    }
    if (newPatterns.length === 0) return;
    onChange([...value, { type: "custom", label: trimmedQuery, patterns: newPatterns }]);
    setQuery("");
    inputRef.current?.focus();
  }

  function removeItem(item: FileTypeSelectionItem) {
    onChange(value.filter((existing) => itemKey(existing) !== itemKey(item)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((prev) => Math.min(prev + 1, Math.max(rowCount - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted < filteredCategories.length) {
        const category = filteredCategories[highlighted];
        if (category) addCategory(category.id);
      } else if (highlighted === customRowIndex && showCustomOption) {
        addCustom();
      }
    } else if (event.key === "Backspace" && query === "" && value.length > 0) {
      removeItem(value[value.length - 1]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-neutral-600 dark:text-neutral-300">{label}</span>
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setHelpOpen((prev) => !prev)}
            aria-label={t("admin.fileTypeSelect.helpAria")}
            className="flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 hover:text-brand-blue dark:hover:text-brand-blue-light"
          >
            <IconHelpCircle size={16} stroke={1.75} />
          </button>
          {helpOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-black/5 bg-white p-3 text-xs text-neutral-600 shadow-lg dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300">
              <p className="mb-1.5 font-medium text-brand-ink dark:text-white">{t("admin.fileTypeSelect.helpTitle")}</p>
              <p className="mb-1.5">
                {t("admin.fileTypeSelect.helpKnownExt")}
              </p>
              <ul className="mb-1.5 list-inside list-disc space-y-0.5">
                <li>
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">.pdf</code>,{" "}
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">.exe</code>,{" "}
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">.mp3</code>...
                </li>
              </ul>
              <p className="mb-1.5">
                {t("admin.fileTypeSelect.helpMimeFormat")}{" "}
                <code className="rounded bg-black/5 px-1 dark:bg-white/10">tipo/subtipo</code>:
              </p>
              <ul className="mb-1.5 list-inside list-disc space-y-0.5">
                <li>
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">application/pdf</code>
                </li>
                <li>
                  <code className="rounded bg-black/5 px-1 dark:bg-white/10">audio/*</code> {t("admin.fileTypeSelect.helpAudioDesc")}
                </li>
              </ul>
              <p>
                {t("admin.fileTypeSelect.helpBinaryDesc")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <div
          className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 py-1.5 focus-within:border-brand-blue dark:border-white/10 dark:bg-white/5"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((item) => (
            <span
              key={itemKey(item)}
              title={item.type === "custom" ? item.patterns.join(", ") : undefined}
              className="flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-1 text-xs text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light"
            >
              {itemLabel(item)}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeItem(item);
                }}
                aria-label={t("admin.fileTypeSelect.removeChipAria", { name: itemLabel(item) })}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-brand-blue/20 dark:hover:bg-white/10"
              >
                <IconX size={11} stroke={2.5} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? t("admin.fileTypeSelect.inputPlaceholder") : ""}
            className="min-w-[160px] flex-1 bg-transparent text-sm text-brand-ink outline-none placeholder:text-neutral-400 dark:text-white"
          />
        </div>

        {open && (filteredCategories.length > 0 || showCustomOption) && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
            {filteredCategories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() => addCategory(category.id)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink dark:text-white",
                  index === highlighted ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
                )}
              >
                {category.label}
              </button>
            ))}
            {showCustomOption && (
              <button
                type="button"
                onClick={addCustom}
                onMouseEnter={() => setHighlighted(customRowIndex)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink dark:text-white",
                  customRowIndex === highlighted ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
                )}
              >
                <IconPlus size={14} stroke={2} className="shrink-0" />
                <span className="truncate">
                  {matchingCategory
                    ? t("admin.fileTypeSelect.addCategoryMatch", { query: trimmedQuery, category: matchingCategory.label })
                    : resolvedFromExtension
                      ? t("admin.fileTypeSelect.addExtensionMatch", { query: trimmedQuery, patterns: newPatterns.join(", ") })
                      : t("admin.fileTypeSelect.addCustomMatch", { query: trimmedQuery })}
                </span>
              </button>
            )}
            {!showCustomOption && trimmedQuery.length > 0 && filteredCategories.length === 0 && (
              <p className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
                {t("admin.fileTypeSelect.invalidPatternNotice", { query: trimmedQuery })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
