// Repository exports for easy importing
export { BaseRepository } from './base.repository';
export { PlayerRepository } from './player.repository';
export { GameRepository } from './game.repository';

// Export types
export type { PlayerWithStats } from './player.repository';
export type { GameWithPlayers, GameStats } from './game.repository';

// Export repository instances (lazy initialization to avoid circular deps)
import { PlayerRepository } from './player.repository';
import { GameRepository } from './game.repository';

export const repositories = {
  player: new PlayerRepository(),
  game: new GameRepository(),
};