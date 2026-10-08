import { NextFunction, Request, Response } from "express";
import { isExternalProvider } from "../../auth-providers/registry";
import { BadRequestError } from "../../utils/errors";
import * as SettingsService from "./settings.service";
import { LOCAL_ACCOUNT_POLICY_FIELDS } from "./settings.validator";

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function getPublicSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await SettingsService.getPublicSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    // Con un proveedor externo las contraseñas y las cuentas las administra el proveedor:
    // aceptar estos ajustes los dejaría guardados sin que rijan nada.
    if (isExternalProvider()) {
      const fields = LOCAL_ACCOUNT_POLICY_FIELDS.filter((field) => req.body[field] !== undefined);
      if (fields.length > 0) {
        throw new BadRequestError(
          "Esos ajustes solo aplican con cuentas locales: las contraseñas las administra el proveedor de autenticación.",
          "local_auth_setting_not_applicable",
          { fields },
        );
      }
    }
    const settings = await SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}
