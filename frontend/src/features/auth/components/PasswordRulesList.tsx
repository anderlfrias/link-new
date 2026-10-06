"use client";

import { IconCheck, IconCircleDashed } from "@tabler/icons-react";
import type { PasswordPolicy } from "@/features/auth/types/auth.types";
import {
  activePasswordRules,
  effectiveMinLength,
  failedPasswordRules,
  type PasswordRule,
} from "@/features/auth/utils/password-rules";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

interface PasswordRulesListProps {
  policy: PasswordPolicy;
  password: string;
}

/** Las reglas de la política vigente, marcadas en vivo a medida que se escribe. */
export function PasswordRulesList({ policy, password }: PasswordRulesListProps) {
  const { t } = useTranslation();
  const failed = new Set(failedPasswordRules(password, policy));

  function label(rule: PasswordRule): string {
    switch (rule) {
      case "min_length":
        return t("password.ruleMinLength", { count: effectiveMinLength(policy) });
      case "max_length":
        return t("password.ruleMaxLength", { count: policy.maxLength });
      case "uppercase":
        return t("password.ruleUppercase");
      case "lowercase":
        return t("password.ruleLowercase");
      case "number":
        return t("password.ruleNumber");
      case "symbol":
        return t("password.ruleSymbol");
    }
  }

  const rules = activePasswordRules(policy);
  if (failed.has("max_length")) rules.push("max_length");

  return (
    <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-xs dark:bg-white/5">
      <p className="mb-1 font-medium text-neutral-600 dark:text-neutral-300">{t("password.rulesTitle")}</p>
      <ul className="flex flex-col gap-0.5">
        {rules.map((rule) => {
          const met = password.length > 0 && !failed.has(rule);
          return (
            <li
              key={rule}
              data-rule={rule}
              data-met={met}
              className={cn(
                "flex items-center gap-1.5",
                met ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400",
              )}
            >
              {met ? <IconCheck size={13} stroke={2.5} /> : <IconCircleDashed size={13} stroke={1.75} />}
              <span>{label(rule)}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <IconCircleDashed size={13} stroke={1.75} />
          <span>
            {policy.historyCount > 1
              ? t("password.ruleHistory", { count: policy.historyCount })
              : t("password.ruleNotCurrent")}
          </span>
        </li>
      </ul>
    </div>
  );
}
