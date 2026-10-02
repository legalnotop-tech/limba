"use strict";

// The rule engine is independent of the DOM; the same API can be used in Node.
const Checkers = (() => {
  const SIZE = 8;
  const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const inside = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  const sameSquare = (a, b) => Boolean(a && b && a.row === b.row && a.col === b.col);
  const opponent = (player) => player === "white" ? "black" : "white";

  function createGame() {
    const board = Array.from({ length: SIZE }, (_, row) =>
      Array.from({ length: SIZE }, (_, col) => {
        if ((row + col) % 2 === 0 || (row > 2 && row < 5)) return null;
        return { player: row < 3 ? "black" : "white", king: false };
      })
    );
    return { board, currentPlayer: "white", forcedPiece: null, captured: [], winner: null, lastMove: null };
  }

  function pieceMoves(state, row, col, capturesOnly) {
    const piece = state.board[row][col];
    if (!piece || piece.player !== state.currentPlayer) return [];
    const moves = [];
    const wasCaptured = (r, c) => state.captured.some((square) => square.row === r && square.col === c);
    const add = (r, c, capture = null) => moves.push({ from: { row, col }, to: { row: r, col: c }, capture });

    for (const [dr, dc] of DIAGONALS) {
      let r = row + dr;
      let c = col + dc;
      if (!inside(r, c)) continue;

      if (!piece.king) {
        const neighbor = state.board[r][c];
        const landingRow = r + dr;
        const landingCol = c + dc;
        if (neighbor && neighbor.player !== piece.player && !wasCaptured(r, c)
            && inside(landingRow, landingCol) && !state.board[landingRow][landingCol]) {
          add(landingRow, landingCol, { row: r, col: c });
        } else if (!capturesOnly && !neighbor && dr === (piece.player === "white" ? -1 : 1)) {
          add(r, c);
        }
        continue;
      }

      // Flying kings may land on any empty square beyond one opposing piece.
      let victim = null;
      while (inside(r, c)) {
        const occupant = state.board[r][c];
        if (occupant) {
          if (victim || occupant.player === piece.player || wasCaptured(r, c)) break;
          victim = { row: r, col: c };
        } else if (victim || !capturesOnly) {
          add(r, c, victim);
        }
        r += dr;
        c += dc;
      }
    }
    return moves;
  }

  function getLegalMoves(state) {
    if (state.winner) return [];
    if (state.forcedPiece) {
      return pieceMoves(state, state.forcedPiece.row, state.forcedPiece.col, true);
    }
    const captures = [];
    const quiet = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        for (const move of pieceMoves(state, row, col, false)) {
          (move.capture ? captures : quiet).push(move);
        }
      }
    }
    // A capture anywhere on the board forbids every non-capturing move.
    return captures.length ? captures : quiet;
  }

  function playMove(state, from, to) {
    const move = getLegalMoves(state).find((candidate) =>
      sameSquare(candidate.from, from) && sameSquare(candidate.to, to)
    );
    if (!move) return null;

    const next = {
      ...state,
      board: state.board.map((row) => row.map((piece) => piece ? { ...piece } : null)),
      captured: state.captured.map((square) => ({ ...square })),
      forcedPiece: null,
      lastMove: move,
    };
    const piece = next.board[from.row][from.col];
    next.board[from.row][from.col] = null;
    next.board[to.row][to.col] = piece;
    if (to.row === (piece.player === "white" ? 0 : SIZE - 1)) piece.king = true;

    if (move.capture) {
      // Victims block their squares until the whole capture sequence finishes.
      next.captured.push(move.capture);
      if (pieceMoves(next, to.row, to.col, true).length) {
        next.forcedPiece = { ...to };
        return next;
      }
    }

    for (const square of next.captured) next.board[square.row][square.col] = null;
    next.captured = [];
    next.currentPlayer = opponent(state.currentPlayer);
    if (!getLegalMoves(next).length) next.winner = state.currentPlayer;
    return next;
  }

  return Object.freeze({ SIZE, createGame, getLegalMoves, playMove, sameSquare });
})();

// Classic script (not an ES module) also works by opening index.html via file://.
if (typeof module !== "undefined" && module.exports) module.exports = Checkers;

if (typeof document !== "undefined") {
  (() => {
    const boardElement = document.getElementById("board");
    const statusElement = document.getElementById("status");
    const whiteCount = document.getElementById("white-count");
    const blackCount = document.getElementById("black-count");
    const newGameButton = document.getElementById("new-game");
    const cells = [];
    let game = Checkers.createGame();
    let selected = null;
    let feedback = "";

    const coordinate = (row, col) => `${"abcdefgh"[col]}${8 - row}`;
    const playerName = (player) => player === "white" ? "белых" : "чёрных";

    for (let row = 0; row < Checkers.SIZE; row += 1) {
      for (let col = 0; col < Checkers.SIZE; col += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `square ${(row + col) % 2 ? "dark" : "light"}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.disabled = (row + col) % 2 === 0;
        cell.addEventListener("click", () => handleSquare(row, col));
        boardElement.appendChild(cell);
        cells.push(cell);
      }
    }

    function render() {
      const legalMoves = Checkers.getLegalMoves(game);
      const selectedMoves = legalMoves.filter((move) => Checkers.sameSquare(move.from, selected));
      const counts = { white: 0, black: 0 };

      for (const cell of cells) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const square = { row, col };
        const piece = game.board[row][col];
        const isCaptured = game.captured.some((victim) => Checkers.sameSquare(victim, square));
        const isSelected = Checkers.sameSquare(selected, square);
        const isTarget = selectedMoves.some((move) => Checkers.sameSquare(move.to, square));
        cell.classList.toggle("selected", isSelected);
        cell.classList.toggle("target", isTarget);
        cell.classList.toggle("last-move", Checkers.sameSquare(game.lastMove?.from, square) || Checkers.sameSquare(game.lastMove?.to, square));
        cell.setAttribute("aria-pressed", String(isSelected));
        const description = piece ? `${piece.player === "white" ? "белая" : "чёрная"} ${piece.king ? "дамка" : "шашка"}` : "пустая клетка";
        cell.setAttribute("aria-label", `${coordinate(row, col)}: ${description}${isCaptured ? ", взята" : ""}${isTarget ? ", допустимый ход" : ""}`);
        cell.replaceChildren();

        if (piece) {
          if (!isCaptured) counts[piece.player] += 1;
          const disc = document.createElement("span");
          disc.className = `piece ${piece.player}${piece.king ? " king" : ""}${isCaptured ? " captured" : ""}`;
          disc.setAttribute("aria-hidden", "true");
          disc.textContent = piece.king ? "★" : "";
          cell.appendChild(disc);
        }
        if (col === 0) {
          const rank = document.createElement("span");
          rank.className = "rank-label";
          rank.setAttribute("aria-hidden", "true");
          rank.textContent = String(8 - row);
          cell.appendChild(rank);
        }
      }

      whiteCount.textContent = String(counts.white);
      blackCount.textContent = String(counts.black);
      let status = `Ход ${playerName(game.currentPlayer)}.`;
      if (game.winner) {
        status = `Победа ${playerName(game.winner)}! У соперника нет возможных ходов. Начните новую игру.`;
      } else if (game.forcedPiece) {
        status += ` Продолжайте взятие шашкой ${coordinate(game.forcedPiece.row, game.forcedPiece.col)}.`;
      } else if (legalMoves.some((move) => move.capture)) {
        status += " Взятие обязательно.";
      }
      statusElement.textContent = feedback ? `${status} ${feedback}` : status;
    }

    function handleSquare(row, col) {
      if (game.winner) return;
      const square = { row, col };
      const legalMoves = Checkers.getLegalMoves(game);
      const next = selected ? Checkers.playMove(game, selected, square) : null;
      feedback = "";

      if (next) {
        game = next;
        selected = game.forcedPiece;
      } else if (Checkers.sameSquare(selected, square) && !game.forcedPiece) {
        selected = null;
      } else if (legalMoves.some((move) => Checkers.sameSquare(move.from, square))) {
        selected = square;
      } else if (game.forcedPiece) {
        feedback = "Нажмите на подсвеченную клетку, чтобы закончить серию.";
      } else {
        feedback = "Выберите свою шашку с доступным ходом и подсвеченную клетку.";
      }
      render();
    }

    newGameButton.addEventListener("click", () => {
      game = Checkers.createGame();
      selected = null;
      feedback = "";
      render();
    });

    render();
  })();
}
