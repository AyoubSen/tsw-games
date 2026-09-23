export type DrawingGameMode =
	| "classic"
	| "league-of-legends"
	| "valorant"
	| "draw-vote"
	| "telephone";

export interface GameSettings {
	mode: DrawingGameMode;
	roundTimeLimit: number;
	roundsPerPlayer: number;
}
