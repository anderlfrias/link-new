import { describe, expect, it } from "vitest";
import { PUSH_ENDPOINT_MAX_LENGTH, isAllowedPushEndpoint } from "./push-endpoint";

describe("isAllowedPushEndpoint", () => {
  it("acepta los endpoints de FCM, Mozilla, WNS y Apple", () => {
    const allowed = [
      "https://fcm.googleapis.com/fcm/send/abc123:APA91b",
      "https://android.googleapis.com/gcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
      "https://web.push.apple.com/QGpXfs3",
    ];

    for (const endpoint of allowed) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("acepta el puerto 443 explícito y un host en mayúsculas", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:443/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://FCM.GoogleAPIs.com/fcm/send/abc")).toBe(true);
  });

  it("rechaza http, puertos distintos de 443 y credenciales en la URL", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://usuario:clave@fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://usuario@fcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("rechaza IPs y hosts que no son servicios push", () => {
    expect(isAllowedPushEndpoint("https://10.0.0.5:8443/internal")).toBe(false);
    expect(isAllowedPushEndpoint("https://10.0.0.5/internal")).toBe(false);
    expect(isAllowedPushEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://[::1]/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://example.com/push")).toBe(false);
    expect(isAllowedPushEndpoint("https://googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("rechaza hosts que contienen el sufijo sin ser subdominio", () => {
    expect(isAllowedPushEndpoint("https://evilfcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.atacante.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://atacante.example/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://notify.windows.com.atacante.example/x")).toBe(false);
  });

  it("rechaza URLs mal formadas o de más de 2048 caracteres", () => {
    expect(isAllowedPushEndpoint("")).toBe(false);
    expect(isAllowedPushEndpoint("no es una url")).toBe(false);
    expect(isAllowedPushEndpoint("fcm.googleapis.com/fcm/send/abc")).toBe(false);

    const tooLong = `https://fcm.googleapis.com/fcm/send/${"a".repeat(PUSH_ENDPOINT_MAX_LENGTH)}`;
    expect(isAllowedPushEndpoint(tooLong)).toBe(false);
  });
});
