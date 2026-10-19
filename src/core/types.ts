// Shared types. Provided by the harness; read-only to agents (see SPEC.md).
export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Square = string;            // "a1" … "h8"
export type Uci = string;               // "e2e4", "e7e8q" (promotion piece lowercase)
export type Result = "1-0" | "0-1" | "1/2-1/2" | "*";
export type EndReason = "checkmate" | "stalemate" | "insufficient-material"
                      | "threefold-repetition" | "fifty-move-rule"
                      | "timeout" | "timeout-vs-insufficient-material";
export type SoundKind = "move" | "capture" | "castle" | "check" | "promote" | "game-end" | "low-time";
