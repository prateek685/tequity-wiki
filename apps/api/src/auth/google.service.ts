import { Inject, Injectable } from "@nestjs/common";
import * as oidc from "openid-client";
import { z } from "zod";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

/** What we keep in the signed cookie between "start" and "callback". */
export const oauthState = z.object({
  state: z.string().min(16),
  nonce: z.string().min(16),
  verifier: z.string().min(43),
  next: z.string(),
});
export type OauthState = z.infer<typeof oauthState>;

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Google sign-in with OpenID Connect: authorization code flow with PKCE, state and nonce, id_token
 * verified by openid-client. `hd` only pre-selects the company account in Google's picker; the
 * real domain check happens on the verified email afterwards.
 */
@Injectable()
export class GoogleService {
  private configuration: Promise<oidc.Configuration> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    return this.env.GOOGLE_CLIENT_ID !== "" && this.env.GOOGLE_CLIENT_SECRET !== "";
  }

  private get redirectUri(): string {
    return `${this.env.PORTAL_ORIGIN}${GOOGLE_CALLBACK_PATH}`;
  }

  /** Discovery is fetched once, on first use, and retried on the next sign-in if it failed. */
  private config(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(GOOGLE_ISSUER, this.env.GOOGLE_CLIENT_ID, this.env.GOOGLE_CLIENT_SECRET)
      .catch((error: unknown) => {
        this.configuration = null;
        throw error;
      });
    return this.configuration;
  }

  async start(next: string): Promise<{ url: URL; state: OauthState }> {
    const state: OauthState = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      verifier: oidc.randomPKCECodeVerifier(),
      next,
    };
    const url = oidc.buildAuthorizationUrl(await this.config(), {
      redirect_uri: this.redirectUri,
      scope: "openid email profile",
      response_type: "code",
      code_challenge: await oidc.calculatePKCECodeChallenge(state.verifier),
      code_challenge_method: "S256",
      state: state.state,
      nonce: state.nonce,
      hd: this.env.ALLOWED_EMAIL_DOMAIN,
      prompt: "select_account",
    });
    return { url, state };
  }

  /** Exchanges the code and returns the verified identity. Throws on any check failure. */
  async finish(query: URLSearchParams, saved: OauthState): Promise<GoogleIdentity> {
    const currentUrl = new URL(`${this.redirectUri}?${query.toString()}`);
    const tokens = await oidc.authorizationCodeGrant(await this.config(), currentUrl, {
      pkceCodeVerifier: saved.verifier,
      expectedState: saved.state,
      expectedNonce: saved.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || typeof claims.email !== "string") throw new Error("Google id_token without email");
    return {
      sub: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" && claims.name.trim() !== "" ? claims.name : claims.email,
    };
  }
}
