"use client";

import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "@/i18n";
import { copyTextToClipboard } from "@/utils/clipboard";

interface TemporaryPasswordModalProps {
  /** De quién es la contraseña, para que el admin sepa a quién dársela. */
  accountLabel: string;
  password: string;
  onClose: () => void;
}

/** Muestra una contraseña temporal UNA sola vez (docs/design/LOCAL_AUTH_PLAN.md
 * §7). Vive solo en el estado de quien abrió el modal y se descarta al
 * cerrarlo: nunca va a localStorage, borradores ni logs. */
export function TemporaryPasswordModal({ accountLabel, password, onClose }: TemporaryPasswordModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    setCopied(await copyTextToClipboard(password));
  }

  return (
    <Modal onClose={onClose} aria-label={t("admin.users.temporaryPasswordTitle")}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
          {t("admin.users.temporaryPasswordTitle")}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {t("admin.users.temporaryPasswordFor", { account: accountLabel })}
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="temporary-password"
            className="min-w-0 flex-1 select-all break-all rounded-lg bg-black/5 px-3 py-2 font-mono text-sm text-brand-ink dark:bg-white/10 dark:text-white"
          >
            {password}
          </code>
          <Button type="button" variant="ghost" onClick={handleCopy} aria-label={t("common.copy")}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t("admin.users.temporaryPasswordWarning")}</span>
        </div>
        <Button type="button" onClick={onClose} className="self-end">
          {t("common.close")}
        </Button>
      </div>
    </Modal>
  );
}
