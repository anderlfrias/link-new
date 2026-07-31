import { NextFunction, Request, Response } from "express";
import * as SettingsService from "./settings.service";

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
    const settings = await SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}
