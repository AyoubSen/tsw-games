export type DrawingGameMode = "classic" | "telephone";

export interface GameSettings {
	mode: DrawingGameMode;
	roundTimeLimit: number;
	roundsPerPlayer: number;
}
