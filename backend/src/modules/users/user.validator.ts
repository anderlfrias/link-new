import { UserStatus } from "@prisma/client";
import * as yup from "yup";
import { ASSIGNABLE_LOCAL_ROLES } from "../../constants/roles.constant";

/// Username del modo local (LOCAL_AUTH_PLAN.md, D11): de 3 a 32 caracteres
/// `a-z 0-9 . _`, el mismo conjunto que reconocen las menciones
/// (`utils/mention.ts`). Sin "@": así el login distingue sin ambigüedad un
/// correo de un username.
const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/;
/// Tope generoso solo para no aceptar bodies gigantes: el largo real lo
/// valida la política de contraseñas.
const PASSWORD_INPUT_MAX = 1024;

const name = yup.string().trim().min(1).max(120);
const email = yup.string().trim().lowercase().email("Correo inválido").max(254);
/// Un string vacío cuenta como "sin username".
const username = yup
  .string()
  .transform((value, original) => (typeof original === "string" && original.trim() === "" ? null : value))
  .trim()
  .lowercase()
  .matches(USERNAME_PATTERN, "El usuario debe tener de 3 a 32 caracteres: letras, números, punto o guion bajo")
  .nullable();
const roles = yup.array().of(yup.string().required().oneOf([...ASSIGNABLE_LOCAL_ROLES], "Rol desconocido"));

export const createLocalUserSchema = yup.object({
  name: name.required(),
  email: email.required(),
  username: username.optional(),
  roles: roles.optional(),
  password: yup.string().max(PASSWORD_INPUT_MAX).optional(),
});

export const updateLocalUserSchema = yup
  .object({
    name: name.optional(),
    email: email.optional(),
    username: username.optional(),
    roles: roles.optional(),
    status: yup.string().oneOf(Object.values(UserStatus)).optional(),
  })
  .test(
    "at-least-one-field",
    "Indicá al menos un campo para actualizar",
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.username !== undefined ||
      value.roles !== undefined ||
      value.status !== undefined,
  );

/// Con un proveedor externo los datos de la cuenta los administra el proveedor:
/// desde acá solo se activa o desactiva su acceso al chat (D19).
export const updateExternalUserSchema = yup.object({
  status: yup.string().oneOf(Object.values(UserStatus)).required(),
});

export const resetPasswordSchema = yup.object({
  password: yup.string().max(PASSWORD_INPUT_MAX).optional(),
});
