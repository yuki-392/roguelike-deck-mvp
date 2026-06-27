import { ALL_CHAIN_EVENTS, ALL_NORMAL_EVENTS } from "./data/events";
import { ALL_POTIONS } from "./data/potions";
import { pickRelicReward } from "./reward";
import type { RngFn } from "./rng";
import type {
  ChainEventFlags,
  EventDefinition,
  EventEffect,
  GameState,
} from "./types";
import { MAX_LOG_ENTRIES, MAX_POTION_SLOTS } from "./constants";

function addEventLog(
  log: readonly string[],
  message: string,
): readonly string[] {
  return [...log, message].slice(-MAX_LOG_ENTRIES);
}

function getEffectAmount(
  maxHp: number,
  amount: number,
  isPercent: boolean,
): number {
  return isPercent ? Math.ceil((maxHp * amount) / 100) : amount;
}

export function selectEventDefinition(
  flags: ChainEventFlags,
  rng: RngFn,
): EventDefinition | null {
  for (const [chainId, value] of flags) {
    if (value <= 0) continue;
    const chainEvent = ALL_CHAIN_EVENTS.find(
      (event) =>
        event.requiredFlag?.chainId === chainId &&
        event.requiredFlag.value === value,
    );
    if (chainEvent !== undefined) return chainEvent;
  }

  if (ALL_NORMAL_EVENTS.length === 0) return null;
  return (
    ALL_NORMAL_EVENTS[Math.floor(rng() * ALL_NORMAL_EVENTS.length)] ?? null
  );
}

export function applyEventEffects(
  state: GameState,
  effects: readonly EventEffect[],
  rng: RngFn,
): GameState {
  return effects.reduce<GameState>((currentState, effect) => {
    switch (effect.kind) {
      case "gainRelic": {
        const relic = pickRelicReward(
          rng,
          new Set(currentState.relics.map((ownedRelic) => ownedRelic.id)),
          effect.rarities,
        );
        if (relic === null) {
          return {
            ...currentState,
            log: addEventLog(currentState.log, "入手できる遺物はなかった。"),
          };
        }
        return {
          ...currentState,
          relics: [...currentState.relics, relic],
          log: addEventLog(currentState.log, `${relic.name}を入手した。`),
        };
      }

      case "gainGold":
        return {
          ...currentState,
          run: {
            ...currentState.run,
            gold: currentState.run.gold + effect.amount,
          },
          log: addEventLog(
            currentState.log,
            `${effect.amount}ゴールドを得た。`,
          ),
        };

      case "loseGold": {
        const lostGold = Math.min(currentState.run.gold, effect.amount);
        return {
          ...currentState,
          run: {
            ...currentState.run,
            gold: Math.max(0, currentState.run.gold - effect.amount),
          },
          log: addEventLog(currentState.log, `${lostGold}ゴールドを失った。`),
        };
      }

      case "loseRelic": {
        const removableRelics = currentState.relics.filter(
          (relic) => relic.isStarter === false,
        );
        if (removableRelics.length === 0) {
          return {
            ...currentState,
            log: addEventLog(currentState.log, "失う遺物はなかった。"),
          };
        }
        const removedRelic =
          removableRelics[Math.floor(rng() * removableRelics.length)];
        if (removedRelic === undefined) return currentState;
        return {
          ...currentState,
          relics: currentState.relics.filter(
            (relic) => relic.id !== removedRelic.id,
          ),
          log: addEventLog(currentState.log, `${removedRelic.name}を失った。`),
        };
      }

      case "gainPotion": {
        if (currentState.run.potions.length >= MAX_POTION_SLOTS) {
          return {
            ...currentState,
            log: addEventLog(
              currentState.log,
              "ポーション枠がいっぱいだった。",
            ),
          };
        }
        const potion = ALL_POTIONS[Math.floor(rng() * ALL_POTIONS.length)];
        if (potion === undefined) return currentState;
        return {
          ...currentState,
          run: {
            ...currentState.run,
            potions: [...currentState.run.potions, potion],
          },
          log: addEventLog(currentState.log, `${potion.name}を入手した。`),
        };
      }

      case "takeDamage": {
        const damage = getEffectAmount(
          currentState.player.maxHp,
          effect.amount,
          effect.isPercent,
        );
        return {
          ...currentState,
          player: {
            ...currentState.player,
            currentHp: Math.max(0, currentState.player.currentHp - damage),
          },
          log: addEventLog(currentState.log, `${damage}ダメージを受けた。`),
        };
      }

      case "heal": {
        const healAmount = getEffectAmount(
          currentState.player.maxHp,
          effect.amount,
          effect.isPercent,
        );
        return {
          ...currentState,
          player: {
            ...currentState.player,
            currentHp: Math.min(
              currentState.player.maxHp,
              currentState.player.currentHp + healAmount,
            ),
          },
          log: addEventLog(currentState.log, `${healAmount}回復した。`),
        };
      }

      case "randomOutcome": {
        const totalWeight = effect.outcomes.reduce(
          (total, outcome) => total + Math.max(0, outcome.weight),
          0,
        );
        if (totalWeight <= 0) return currentState;
        const roll = rng() * totalWeight;
        let cursor = 0;
        for (const outcome of effect.outcomes) {
          cursor += Math.max(0, outcome.weight);
          if (roll < cursor) {
            return applyEventEffects(currentState, outcome.effects, rng);
          }
        }
        const fallback = effect.outcomes[effect.outcomes.length - 1];
        return fallback === undefined
          ? currentState
          : applyEventEffects(currentState, fallback.effects, rng);
      }

      default: {
        const _exhaustive: never = effect;
        return _exhaustive;
      }
    }
  }, state);
}

export function applyChainFlagUpdate(
  state: GameState,
  nextFlag?: { readonly chainId: string; readonly value: number },
): GameState {
  // chainId は nextFlag > activeEvent の優先順位で決定。どちらもなければ非連鎖イベントなので変更しない
  const chainId = nextFlag?.chainId ?? state.activeEvent?.chainId;
  if (chainId === undefined) return state;
  const nextFlags = new Map(state.run.chainEventFlags);
  // nextFlag があれば指定値へ更新、なければ（連鎖終了）対象 chainId のみをリセット
  nextFlags.set(chainId, nextFlag?.value ?? 0);
  return {
    ...state,
    run: { ...state.run, chainEventFlags: nextFlags },
  };
}
