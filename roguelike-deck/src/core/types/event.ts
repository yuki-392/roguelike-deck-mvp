import type { RelicRarity } from "./relic";

export type EventEffect =
  | { readonly kind: "gainRelic"; readonly rarities?: readonly RelicRarity[] }
  | { readonly kind: "gainGold"; readonly amount: number }
  | { readonly kind: "loseGold"; readonly amount: number }
  | { readonly kind: "loseRelic" }
  | { readonly kind: "gainPotion" }
  | {
      readonly kind: "takeDamage";
      readonly amount: number;
      readonly isPercent: boolean;
    }
  | {
      readonly kind: "heal";
      readonly amount: number;
      readonly isPercent: boolean;
    }
  | {
      readonly kind: "randomOutcome";
      readonly outcomes: readonly {
        readonly weight: number;
        readonly effects: readonly EventEffect[];
      }[];
    };

export interface EventChoice {
  readonly label: string;
  readonly effects: readonly EventEffect[];
  readonly nextChainFlag?: { readonly chainId: string; readonly value: number };
}

export interface EventDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly choices: readonly EventChoice[];
  readonly forcedEffects?: readonly EventEffect[];
  readonly chainId?: string;
  readonly requiredFlag?: { readonly chainId: string; readonly value: number };
}

export type ChainEventFlags = ReadonlyMap<string, number>;
