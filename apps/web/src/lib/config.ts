import type { MlApp } from "@banah/connector-ml";
import { exigir } from "@banah/shared";

export function mlApp(): MlApp {
  return {
    clientId: exigir("ML_CLIENT_ID"),
    clientSecret: exigir("ML_CLIENT_SECRET"),
    redirectUri: exigir("ML_REDIRECT_URI"),
  };
}

export function chaveTokens(): string {
  return exigir("TOKEN_ENCRYPTION_KEY");
}
