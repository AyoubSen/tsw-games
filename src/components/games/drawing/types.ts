export type DrawingGameMode =
	| "classic"
	| "league-of-legends"
	| "valorant"
	| "telephone";

export interface GameSettings {
	mode: DrawingGameMode;
	roundTimeLimit: number;
	roundsPerPlayer: number;
}
