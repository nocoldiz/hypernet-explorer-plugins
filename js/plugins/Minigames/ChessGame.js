//=============================================================================
// ChessGame.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Chess v2.0.0 - low-poly 3D chess played with real monsters
 * @author Omni-Lex
 * @version 2.0.0
 * @description Full-rules chess on a 3D board where every piece is a creature
 * from the 3D battler system. Normal and Chaos modes.
 *
 * @param gameMode
 * @text Default Game Mode
 * @desc What the plain "Start Chess" command opens. "Ask" lets the player pick.
 * @type select
 * @option Ask the player
 * @value ask
 * @option Normal
 * @value normal
 * @option Chaos
 * @value chaos
 * @default ask
 *
 * @param aiStrength
 * @text AI Strength
 * @desc Search depth for the normal-mode opponent. Higher thinks longer.
 * @type number
 * @min 1
 * @max 5
 * @default 3
 *
 * @param seMove
 * @text Move Sound
 * @desc SE played when a piece is set down.
 * @type file
 * @dir audio/se/
 * @default Knock
 *
 * @param seCapture
 * @text Capture Sound
 * @desc SE played when a piece is taken.
 * @type file
 * @dir audio/se/
 * @default Slash1
 *
 * @param seCheck
 * @text Check Sound
 * @desc SE played when a king is put in check.
 * @type file
 * @dir audio/se/
 * @default Bell3
 *
 * @param seChaos
 * @text Chaos Sound
 * @desc SE played when the cheating opponent breaks the rules.
 * @type file
 * @dir audio/se/
 * @default Magic2
 *
 * @command startNormalChess
 * @text Start Normal Chess
 * @desc Chess by the book: castling, en passant, promotion, check and mate.
 *
 * @command startChaosChess
 * @text Start Chaos Chess
 * @desc The opponent cheats. Capture pieces to earn cheats of your own.
 *
 * @command startChess
 * @text Start Chess (Default Mode)
 * @desc Uses the mode set in the plugin parameters.
 *
 * @help ChessGame.js
 *
 * A game of chess played on a low-poly 3D board, in the same house style as
 * the bowling alley and the basketball court: a three.js stage rendered through
 * PSXShader and composited over the battleback of wherever the party is
 * standing, with the shared art deco PSXHud drawn over it.
 *
 * THE PIECES ARE MONSTERS. Every man on the board is a real procedural creature
 * from the 3D battler system, dealt from the world seed, so a given world always
 * fields the same two armies: a bright one for White and a black-hearted one for
 * Black. They idle, they lunge when they take a piece and they fall down and
 * fade when they are taken.
 *
 * NORMAL MODE
 * Chess by the book. Castling on both wings, en passant, under-promotion,
 * check, checkmate, stalemate, the fifty-move rule, threefold repetition and
 * insufficient material. The opponent searches with alpha-beta over a
 * piece-square evaluation and plays a decent club game.
 *
 * CHAOS MODE
 * You still have to follow the rules. Black does not: it steals your men,
 * transforms them, walks them somewhere useless, raises new ones out of the
 * ground and drops outright monsters onto empty squares. Taking pieces charges
 * your Cheat Meter; full, SHIFT buys you three illegal moves of your own.
 *
 * CONTROLS
 *   Arrows / mouse  Move the cursor
 *   OK / click      Pick a piece up, put it down
 *   Cancel          Put it back, or leave the game
 *   SHIFT           Spend a full Cheat Meter (Chaos mode)
 *   L1 / R1         Turn the board
 *
 * Plugin Commands: Start Normal Chess, Start Chaos Chess, Start Chess.
 */

(() => {
    'use strict';

    const PLUGIN = 'ChessGame';
    const parameters = PluginManager.parameters(PLUGIN);
    const DEFAULT_MODE = parameters['gameMode'] || 'ask';
    const AI_DEPTH = Math.max(1, Math.min(5, Number(parameters['aiStrength'] || 3)));

    //=========================================================================
    // Sound. One table, one player: every effect below is a stock SE, and the
    // four the player is most likely to want to change are plugin parameters.
    //=========================================================================
    const SE = {
        cursor:   { name: 'Cursor1',    volume: 60, pitch: 110 },
        pick:     { name: 'Decision1',  volume: 70, pitch: 105 },
        drop:     { name: parameters['seMove'] || 'Knock', volume: 75, pitch: 100 },
        illegal:  { name: 'Buzzer1',    volume: 45, pitch: 120 },
        capture:  { name: parameters['seCapture'] || 'Slash1', volume: 80, pitch: 100 },
        castle:   { name: 'Push',       volume: 75, pitch: 100 },
        promote:  { name: 'Powerup',    volume: 80, pitch: 100 },
        check:    { name: parameters['seCheck'] || 'Bell3', volume: 85, pitch: 105 },
        mate:     { name: 'Collapse1',  volume: 85, pitch: 100 },
        draw:     { name: 'Chime2',     volume: 75, pitch: 100 },
        win:      { name: 'Applause1',  volume: 90, pitch: 100 },
        lose:     { name: 'Darkness4',  volume: 80, pitch: 95  },
        chaos:    { name: parameters['seChaos'] || 'Magic2', volume: 80, pitch: 100 },
        steal:    { name: 'Absorb1',    volume: 80, pitch: 95  },
        morph:    { name: 'Flash1',     volume: 70, pitch: 105 },
        multi:    { name: 'Wind1',      volume: 70, pitch: 110 },
        charged:  { name: 'Chime1',     volume: 80, pitch: 110 },
        cheat:    { name: 'Skill2',     volume: 85, pitch: 95  },
        land:     { name: 'Push',       volume: 45, pitch: 130 }
    };

    function se(key, opts) {
        const base = SE[key];
        if (!base || !base.name) return;
        const o = opts || {};
        AudioManager.playSe({
            name: base.name,
            volume: o.volume != null ? o.volume : base.volume,
            pitch: o.pitch != null ? o.pitch : base.pitch,
            pan: o.pan || 0
        });
    }

    //=========================================================================
    // Board vocabulary. Index 0 is a8 and index 63 is h1, so row 0 is Black's
    // home rank and row 7 is White's: a white pawn walks toward a lower row,
    // which is also toward the camera's far side.
    //=========================================================================
    const EMPTY = 0;
    const W_PAWN = 1, W_ROOK = 2, W_KNIGHT = 3, W_BISHOP = 4, W_QUEEN = 5, W_KING = 6;
    const B_PAWN = 7, B_ROOK = 8, B_KNIGHT = 9, B_BISHOP = 10, B_QUEEN = 11, B_KING = 12;
    // A chaos piece is Black's, moves like a king and is not royal: losing it
    // is not losing the game, which is the whole point of it.
    const CHAOS = 13;

    const WHITE = 0, BLACK = 1;

    // Type codes shared by both colours: 1 pawn, 2 rook, 3 knight, 4 bishop,
    // 5 queen, 6 king, 7 chaos.
    const T_PAWN = 1, T_ROOK = 2, T_KNIGHT = 3, T_BISHOP = 4, T_QUEEN = 5, T_KING = 6, T_CHAOS = 7;

    function colorOf(p) {
        if (p === EMPTY) return -1;
        if (p === CHAOS) return BLACK;
        return p <= W_KING ? WHITE : BLACK;
    }

    function typeOf(p) {
        if (p === EMPTY) return 0;
        if (p === CHAOS) return T_CHAOS;
        return p <= W_KING ? p : p - 6;
    }

    function makePiece(color, type) {
        return color === WHITE ? type : type + 6;
    }

    const VALUE = { 1: 100, 2: 500, 3: 320, 4: 330, 5: 900, 6: 20000, 7: 250 };
    function pieceValue(p) { return VALUE[typeOf(p)] || 0; }

    // Castling rights, one bit each.
    const CR_WK = 1, CR_WQ = 2, CR_BK = 4, CR_BQ = 8;

    // Move flags.
    const F_NONE = 0, F_DOUBLE = 1, F_EP = 2, F_CASTLE_K = 3, F_CASTLE_Q = 4;

    const rowOf = idx => idx >> 3;
    const colOf = idx => idx & 7;
    const sq = (r, c) => (r << 3) | c;
    const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

    function squareName(idx) {
        return String.fromCharCode(97 + colOf(idx)) + (8 - rowOf(idx));
    }

    const START_BOARD = [
        B_ROOK, B_KNIGHT, B_BISHOP, B_QUEEN, B_KING, B_BISHOP, B_KNIGHT, B_ROOK,
        B_PAWN, B_PAWN, B_PAWN, B_PAWN, B_PAWN, B_PAWN, B_PAWN, B_PAWN,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        W_PAWN, W_PAWN, W_PAWN, W_PAWN, W_PAWN, W_PAWN, W_PAWN, W_PAWN,
        W_ROOK, W_KNIGHT, W_BISHOP, W_QUEEN, W_KING, W_BISHOP, W_KNIGHT, W_ROOK
    ];

    //=========================================================================
    // Position - the flat board the rules and the search both run on. Keeping
    // one representation is the whole reason the opponent can never play a move
    // the player would have been refused.
    //=========================================================================
    class Position {
        constructor() {
            this.b = new Int8Array(64);
            this.turn = WHITE;
            this.cast = CR_WK | CR_WQ | CR_BK | CR_BQ;
            this.ep = -1;          // the square a pawn may capture INTO
            this.half = 0;         // halfmove clock, for the fifty-move rule
            this.full = 1;
        }

        static start() {
            const p = new Position();
            for (let i = 0; i < 64; i++) p.b[i] = START_BOARD[i];
            return p;
        }

        clone() {
            const p = new Position();
            p.b.set(this.b);
            p.turn = this.turn;
            p.cast = this.cast;
            p.ep = this.ep;
            p.half = this.half;
            p.full = this.full;
            return p;
        }

        // Compact description of everything that makes two positions the same
        // for the repetition rule.
        key() {
            let s = '';
            for (let i = 0; i < 64; i++) s += String.fromCharCode(65 + this.b[i]);
            return s + '|' + this.turn + '|' + this.cast + '|' + this.ep;
        }

        kingSquare(color) {
            const king = color === WHITE ? W_KING : B_KING;
            for (let i = 0; i < 64; i++) if (this.b[i] === king) return i;
            return -1;
        }
    }

    //=========================================================================
    // Attack detection. Asked square by square rather than by generating the
    // whole reply, because the legality filter calls it once per candidate move.
    //=========================================================================
    const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    function isAttacked(b, idx, byColor) {
        if (idx < 0) return false;
        const r = rowOf(idx), c = colOf(idx);

        // Pawns. A white pawn stands one row BELOW what it attacks.
        const pr = byColor === WHITE ? r + 1 : r - 1;
        const pawn = byColor === WHITE ? W_PAWN : B_PAWN;
        if (pr >= 0 && pr < 8) {
            if (c > 0 && b[sq(pr, c - 1)] === pawn) return true;
            if (c < 7 && b[sq(pr, c + 1)] === pawn) return true;
        }

        const knight = byColor === WHITE ? W_KNIGHT : B_KNIGHT;
        for (const [dr, dc] of KNIGHT_STEPS) {
            const rr = r + dr, cc = c + dc;
            if (onBoard(rr, cc) && b[sq(rr, cc)] === knight) return true;
        }

        // Kings, and Black's chaos pieces, which reach exactly as far.
        const king = byColor === WHITE ? W_KING : B_KING;
        for (const [dr, dc] of KING_STEPS) {
            const rr = r + dr, cc = c + dc;
            if (!onBoard(rr, cc)) continue;
            const p = b[sq(rr, cc)];
            if (p === king) return true;
            if (p === CHAOS && byColor === BLACK) return true;
        }

        const rook = byColor === WHITE ? W_ROOK : B_ROOK;
        const bishop = byColor === WHITE ? W_BISHOP : B_BISHOP;
        const queen = byColor === WHITE ? W_QUEEN : B_QUEEN;

        for (const [dr, dc] of ROOK_DIRS) {
            let rr = r + dr, cc = c + dc;
            while (onBoard(rr, cc)) {
                const p = b[sq(rr, cc)];
                if (p !== EMPTY) {
                    if (p === rook || p === queen) return true;
                    break;
                }
                rr += dr; cc += dc;
            }
        }
        for (const [dr, dc] of BISHOP_DIRS) {
            let rr = r + dr, cc = c + dc;
            while (onBoard(rr, cc)) {
                const p = b[sq(rr, cc)];
                if (p !== EMPTY) {
                    if (p === bishop || p === queen) return true;
                    break;
                }
                rr += dr; cc += dc;
            }
        }
        return false;
    }

    function inCheck(pos, color) {
        const k = pos.kingSquare(color);
        // A side with no king (which Chaos mode can arrange) is never in check;
        // it has simply lost the thing worth checking.
        if (k < 0) return false;
        return isAttacked(pos.b, k, color === WHITE ? BLACK : WHITE);
    }

    //=========================================================================
    // Move generation
    //=========================================================================
    function mv(from, to, piece, cap, promo, flag) {
        return { from, to, piece, cap: cap || 0, promo: promo || 0, flag: flag || F_NONE };
    }

    function genPseudo(pos, color, capturesOnly) {
        const b = pos.b;
        const out = [];
        const push = m => out.push(m);
        const enemy = color === WHITE ? BLACK : WHITE;

        for (let from = 0; from < 64; from++) {
            const p = b[from];
            if (p === EMPTY || colorOf(p) !== color) continue;
            const r = rowOf(from), c = colOf(from);
            const t = typeOf(p);

            if (t === T_PAWN) {
                const dir = color === WHITE ? -1 : 1;
                const startRow = color === WHITE ? 6 : 1;
                const lastRow = color === WHITE ? 0 : 7;
                const one = r + dir;
                if (onBoard(one, c) && b[sq(one, c)] === EMPTY) {
                    if (!capturesOnly) {
                        if (one === lastRow) {
                            for (const pt of [T_QUEEN, T_ROOK, T_BISHOP, T_KNIGHT]) {
                                push(mv(from, sq(one, c), p, 0, makePiece(color, pt), F_NONE));
                            }
                        } else {
                            push(mv(from, sq(one, c), p, 0, 0, F_NONE));
                            const two = r + dir * 2;
                            if (r === startRow && b[sq(two, c)] === EMPTY) {
                                push(mv(from, sq(two, c), p, 0, 0, F_DOUBLE));
                            }
                        }
                    }
                }
                for (const dc of [-1, 1]) {
                    const cc = c + dc;
                    if (!onBoard(one, cc)) continue;
                    const to = sq(one, cc);
                    const target = b[to];
                    if (target !== EMPTY && colorOf(target) === enemy) {
                        if (one === lastRow) {
                            for (const pt of [T_QUEEN, T_ROOK, T_BISHOP, T_KNIGHT]) {
                                push(mv(from, to, p, target, makePiece(color, pt), F_NONE));
                            }
                        } else {
                            push(mv(from, to, p, target, 0, F_NONE));
                        }
                    } else if (to === pos.ep && target === EMPTY) {
                        // The pawn being taken stands beside ours, on our own
                        // rank. It is checked rather than assumed: Chaos mode
                        // lets Black move twice, which leaves Black's own en
                        // passant square standing on Black's turn, and taking
                        // that on trust invents a captured pawn out of nothing.
                        const victim = sq(r, cc);
                        const wanted = color === WHITE ? B_PAWN : W_PAWN;
                        if (b[victim] === wanted) push(mv(from, to, p, wanted, 0, F_EP));
                    }
                }
                continue;
            }

            if (t === T_KNIGHT) {
                for (const [dr, dc] of KNIGHT_STEPS) {
                    const rr = r + dr, cc = c + dc;
                    if (!onBoard(rr, cc)) continue;
                    const to = sq(rr, cc);
                    const target = b[to];
                    if (target !== EMPTY && colorOf(target) === color) continue;
                    if (capturesOnly && target === EMPTY) continue;
                    push(mv(from, to, p, target, 0, F_NONE));
                }
                continue;
            }

            if (t === T_KING || t === T_CHAOS) {
                for (const [dr, dc] of KING_STEPS) {
                    const rr = r + dr, cc = c + dc;
                    if (!onBoard(rr, cc)) continue;
                    const to = sq(rr, cc);
                    const target = b[to];
                    if (target !== EMPTY && colorOf(target) === color) continue;
                    if (capturesOnly && target === EMPTY) continue;
                    push(mv(from, to, p, target, 0, F_NONE));
                }
                if (t === T_KING && !capturesOnly) genCastles(pos, color, from, p, push);
                continue;
            }

            const dirs = t === T_ROOK ? ROOK_DIRS
                : t === T_BISHOP ? BISHOP_DIRS
                    : ROOK_DIRS.concat(BISHOP_DIRS);
            for (const [dr, dc] of dirs) {
                let rr = r + dr, cc = c + dc;
                while (onBoard(rr, cc)) {
                    const to = sq(rr, cc);
                    const target = b[to];
                    if (target !== EMPTY && colorOf(target) === color) break;
                    if (!capturesOnly || target !== EMPTY) push(mv(from, to, p, target, 0, F_NONE));
                    if (target !== EMPTY) break;
                    rr += dr; cc += dc;
                }
            }
        }
        return out;
    }

    function genCastles(pos, color, from, piece, push) {
        const b = pos.b;
        const home = color === WHITE ? 60 : 4;
        if (from !== home) return;
        const enemy = color === WHITE ? BLACK : WHITE;
        const kingBit = color === WHITE ? CR_WK : CR_BK;
        const queenBit = color === WHITE ? CR_WQ : CR_BQ;
        const rook = color === WHITE ? W_ROOK : B_ROOK;
        if (isAttacked(b, home, enemy)) return;

        if ((pos.cast & kingBit) && b[home + 3] === rook &&
            b[home + 1] === EMPTY && b[home + 2] === EMPTY &&
            !isAttacked(b, home + 1, enemy) && !isAttacked(b, home + 2, enemy)) {
            push(mv(from, home + 2, piece, 0, 0, F_CASTLE_K));
        }
        if ((pos.cast & queenBit) && b[home - 4] === rook &&
            b[home - 1] === EMPTY && b[home - 2] === EMPTY && b[home - 3] === EMPTY &&
            !isAttacked(b, home - 1, enemy) && !isAttacked(b, home - 2, enemy)) {
            push(mv(from, home - 2, piece, 0, 0, F_CASTLE_Q));
        }
    }

    // Rights are lost by the king or the rook leaving its post, and by the rook
    // being taken where it stands.
    function updateCastling(pos, move) {
        const t = typeOf(move.piece);
        if (t === T_KING) {
            pos.cast &= colorOf(move.piece) === WHITE ? ~(CR_WK | CR_WQ) : ~(CR_BK | CR_BQ);
        }
        const corners = { 56: CR_WQ, 63: CR_WK, 0: CR_BQ, 7: CR_BK };
        if (corners[move.from]) pos.cast &= ~corners[move.from];
        if (corners[move.to]) pos.cast &= ~corners[move.to];
    }

    // Applies a move in place and returns what is needed to take it back. The
    // search lives on this pair; the engine uses it too, so the rules can never
    // differ between what is searched and what is played.
    function doMove(pos, move) {
        const undo = {
            cast: pos.cast, ep: pos.ep, half: pos.half, full: pos.full,
            cap: move.cap, capSq: -1
        };
        const b = pos.b;
        b[move.from] = EMPTY;

        if (move.flag === F_EP) {
            undo.capSq = sq(rowOf(move.from), colOf(move.to));
            b[undo.capSq] = EMPTY;
        } else if (move.cap) {
            undo.capSq = move.to;
        }

        b[move.to] = move.promo || move.piece;

        if (move.flag === F_CASTLE_K) {
            b[move.to + 1] = EMPTY;
            b[move.to - 1] = colorOf(move.piece) === WHITE ? W_ROOK : B_ROOK;
        } else if (move.flag === F_CASTLE_Q) {
            b[move.to - 2] = EMPTY;
            b[move.to + 1] = colorOf(move.piece) === WHITE ? W_ROOK : B_ROOK;
        }

        updateCastling(pos, move);
        pos.ep = move.flag === F_DOUBLE
            ? sq((rowOf(move.from) + rowOf(move.to)) / 2, colOf(move.from))
            : -1;
        pos.half = (typeOf(move.piece) === T_PAWN || move.cap) ? 0 : pos.half + 1;
        if (pos.turn === BLACK) pos.full++;
        pos.turn = pos.turn === WHITE ? BLACK : WHITE;
        return undo;
    }

    function undoMove(pos, move, undo) {
        const b = pos.b;
        b[move.from] = move.piece;
        b[move.to] = EMPTY;
        if (undo.capSq >= 0) b[undo.capSq] = undo.cap;

        if (move.flag === F_CASTLE_K) {
            b[move.to - 1] = EMPTY;
            b[move.to + 1] = colorOf(move.piece) === WHITE ? W_ROOK : B_ROOK;
        } else if (move.flag === F_CASTLE_Q) {
            b[move.to + 1] = EMPTY;
            b[move.to - 2] = colorOf(move.piece) === WHITE ? W_ROOK : B_ROOK;
        }

        pos.cast = undo.cast;
        pos.ep = undo.ep;
        pos.half = undo.half;
        pos.full = undo.full;
        pos.turn = pos.turn === WHITE ? BLACK : WHITE;
    }

    function genLegal(pos, color) {
        const out = [];
        for (const m of genPseudo(pos, color, false)) {
            const u = doMove(pos, m);
            if (!inCheck(pos, color)) out.push(m);
            undoMove(pos, m, u);
        }
        return out;
    }

    //=========================================================================
    // Evaluation. Material plus a piece-square table, read from White's side and
    // mirrored for Black. The tables are indexed the way the board is, so index
    // 0 is a8 and no flipping arithmetic is needed for Black beyond the mirror.
    //=========================================================================
    const PST = {
        [T_PAWN]: [
            0, 0, 0, 0, 0, 0, 0, 0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
            5, 5, 10, 25, 25, 10, 5, 5,
            0, 0, 0, 20, 20, 0, 0, 0,
            5, -5, -10, 0, 0, -10, -5, 5,
            5, 10, 10, -20, -20, 10, 10, 5,
            0, 0, 0, 0, 0, 0, 0, 0
        ],
        [T_KNIGHT]: [
            -50, -40, -30, -30, -30, -30, -40, -50,
            -40, -20, 0, 0, 0, 0, -20, -40,
            -30, 0, 10, 15, 15, 10, 0, -30,
            -30, 5, 15, 20, 20, 15, 5, -30,
            -30, 0, 15, 20, 20, 15, 0, -30,
            -30, 5, 10, 15, 15, 10, 5, -30,
            -40, -20, 0, 5, 5, 0, -20, -40,
            -50, -40, -30, -30, -30, -30, -40, -50
        ],
        [T_BISHOP]: [
            -20, -10, -10, -10, -10, -10, -10, -20,
            -10, 0, 0, 0, 0, 0, 0, -10,
            -10, 0, 5, 10, 10, 5, 0, -10,
            -10, 5, 5, 10, 10, 5, 5, -10,
            -10, 0, 10, 10, 10, 10, 0, -10,
            -10, 10, 10, 10, 10, 10, 10, -10,
            -10, 5, 0, 0, 0, 0, 5, -10,
            -20, -10, -10, -10, -10, -10, -10, -20
        ],
        [T_ROOK]: [
            0, 0, 0, 0, 0, 0, 0, 0,
            5, 10, 10, 10, 10, 10, 10, 5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            -5, 0, 0, 0, 0, 0, 0, -5,
            0, 0, 0, 5, 5, 0, 0, 0
        ],
        [T_QUEEN]: [
            -20, -10, -10, -5, -5, -10, -10, -20,
            -10, 0, 0, 0, 0, 0, 0, -10,
            -10, 0, 5, 5, 5, 5, 0, -10,
            -5, 0, 5, 5, 5, 5, 0, -5,
            0, 0, 5, 5, 5, 5, 0, -5,
            -10, 5, 5, 5, 5, 5, 0, -10,
            -10, 0, 5, 0, 0, 0, 0, -10,
            -20, -10, -10, -5, -5, -10, -10, -20
        ],
        [T_KING]: [
            -30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -30, -40, -40, -50, -50, -40, -40, -30,
            -20, -30, -30, -40, -40, -30, -30, -20,
            -10, -20, -20, -20, -20, -20, -20, -10,
            20, 20, 0, 0, 0, 0, 20, 20,
            20, 30, 10, 0, 0, 10, 30, 20
        ],
        [T_CHAOS]: new Array(64).fill(0)
    };

    // The mirror of an index for the other colour: same file, opposite rank.
    const mirror = idx => sq(7 - rowOf(idx), colOf(idx));

    function evaluate(pos) {
        let score = 0;
        const b = pos.b;
        for (let i = 0; i < 64; i++) {
            const p = b[i];
            if (p === EMPTY) continue;
            const t = typeOf(p);
            const table = PST[t] || PST[T_CHAOS];
            const white = colorOf(p) === WHITE;
            const positional = table[white ? i : mirror(i)];
            const worth = VALUE[t] + positional;
            score += white ? worth : -worth;
        }
        return pos.turn === WHITE ? score : -score;
    }

    //=========================================================================
    // Search. Iterative deepening negamax with alpha-beta and a quiescence tail,
    // stopped by a wall clock so a slow machine plays a shallower game rather
    // than dropping frames.
    //=========================================================================
    const MATE = 900000;

    function orderMoves(moves) {
        // Most valuable victim, least valuable attacker: the cheapest way to
        // make alpha-beta earn its keep.
        for (const m of moves) {
            m.order = m.cap ? pieceValue(m.cap) * 10 - pieceValue(m.piece) : 0;
            if (m.promo) m.order += pieceValue(m.promo);
        }
        moves.sort((a, b) => b.order - a.order);
        return moves;
    }

    function quiesce(pos, alpha, beta, depth) {
        const stand = evaluate(pos);
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;
        if (depth <= 0) return alpha;

        const color = pos.turn;
        for (const m of orderMoves(genPseudo(pos, color, true))) {
            const u = doMove(pos, m);
            if (inCheck(pos, color)) { undoMove(pos, m, u); continue; }
            const score = -quiesce(pos, -beta, -alpha, depth - 1);
            undoMove(pos, m, u);
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        return alpha;
    }

    function negamax(pos, depth, alpha, beta, deadline) {
        if (depth <= 0) return quiesce(pos, alpha, beta, 4);
        if (Date.now() > deadline) return evaluate(pos);

        const color = pos.turn;
        const moves = orderMoves(genPseudo(pos, color, false));
        let any = false;
        for (const m of moves) {
            const u = doMove(pos, m);
            if (inCheck(pos, color)) { undoMove(pos, m, u); continue; }
            any = true;
            const score = -negamax(pos, depth - 1, -beta, -alpha, deadline);
            undoMove(pos, m, u);
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        if (!any) return inCheck(pos, color) ? -MATE + (10 - depth) : 0;
        return alpha;
    }

    function searchBestMove(position, opts) {
        const o = opts || {};
        const pos = position.clone();
        const color = pos.turn;
        const legal = genLegal(pos, color);
        if (legal.length === 0) return null;

        const deadline = Date.now() + (o.timeMs || 140);
        let best = legal[0];
        // A little noise on equal moves so the same opening is not played twice.
        const jitter = o.jitter == null ? 12 : o.jitter;

        for (let depth = 1; depth <= (o.depth || AI_DEPTH); depth++) {
            let bestScore = -Infinity;
            let bestHere = null;
            for (const m of orderMoves(legal.slice())) {
                const u = doMove(pos, m);
                const score = -negamax(pos, depth - 1, -Infinity, Infinity, deadline)
                    + (Math.random() * jitter);
                undoMove(pos, m, u);
                if (score > bestScore) { bestScore = score; bestHere = m; }
            }
            if (bestHere) best = bestHere;
            if (Date.now() > deadline) break;
        }
        return best;
    }

    //=========================================================================
    // The armies. Every man is a real creature from the 3D battler system,
    // dealt from the world seed so a given world always fields the same two
    // sides, and never a key the registry does not hold.
    //=========================================================================
    const ARMY_POOLS = {
        // i18n-ignore-start: Battler3D archetype keys, not display text
        light: {
            [T_PAWN]: ['gnome', 'fairy', 'babybunny', 'flowerpixie', 'toothfairy', 'woodsquirrel', 'curiousrabbit', 'mischievoussprite'],
            [T_KNIGHT]: ['centaur', 'unicorn', 'horse', 'forestcentaur', 'radiantunicorn', 'tempestpegasus'],
            [T_BISHOP]: ['enchantress', 'witch', 'totemadept', 'waternymph', 'forestwitch', 'silkenenchantress'],
            [T_ROOK]: ['stoneguardian', 'golem', 'totemguardian', 'crystalgiant', 'luminousdefender', 'nobleguardian'],
            [T_QUEEN]: ['angel', 'seraphicemissary', 'ophanim', 'phoenix', 'sacredphoenix', 'crystalmonarch'],
            [T_KING]: ['armoredknight', 'elven', 'humanoid', 'totemicprotector', 'gildedguardian']
        },
        dark: {
            [T_PAWN]: ['skeleton', 'goblin', 'emberimp', 'pocketimp', 'dodgerimp', 'rottingskeleton', 'kazooimp', 'minorshade'],
            [T_KNIGHT]: ['hellhound', 'obsidianhellhound', 'shadowstalker', 'bloodmawdirewolf', 'ghosttiger', 'flametouchedhellhound'],
            [T_BISHOP]: ['lich', 'mindflayer', 'obsidianvisionary', 'tidesorcerer', 'shadowwraith', 'cinderweaver'],
            [T_ROOK]: ['cryptsentinel', 'obsidiandreadnought', 'colossus', 'moltenjuggernaut', 'brasssentinelmk4', 'earthsentinel'],
            [T_QUEEN]: ['gorgon', 'harpybanshee', 'vampire', 'stormbanshee', 'petrifyinggorgon', 'crystalsiren'],
            [T_KING]: ['demon', 'reaper', 'wingeddemon', 'discorddemon', 'ancientskeleton', 'lich']
        }
        // i18n-ignore-end
    };

    // What the cheating opponent drops on an empty square. Each entry names its
    // own i18n label, because these are the only creatures the log ever names.
    const CHAOS_CREATURES = [
        { key: 'mimic', monster: 'chestmimic' },
        { key: 'cone', monster: 'trafficcone' },
        { key: 'door', monster: 'walkingdoor' },
        { key: 'snail', monster: 'sushisnail' },
        { key: 'burger', monster: 'gunburger' },
        { key: 'turnip', monster: 'squeakyturnip' },
        { key: 'hairball', monster: 'hairball' },
        { key: 'dumpster', monster: 'dumpsterhead' },
        { key: 'paperwork', monster: 'paperwork' },
        { key: 'meme', monster: 'sentientmeme' },
        { key: 'kazoo', monster: 'kazooimp' },
        { key: 'taxi', monster: 'taxidoggo' },
        { key: 'badger', monster: 'advertisementbadger' },
        { key: 'trash', monster: 'trashcreature' },
        { key: 'pillow', monster: 'pillowguardian' },
        { key: 'crane', monster: 'origamicrane' },
        { key: 'beetle', monster: 'discobeetle' },
        { key: 'marionette', monster: 'marionette' },
        { key: 'scarecrow', monster: 'scarecrow' },
        { key: 'candle', monster: 'cursedcandle' },
        { key: 'tourist', monster: 'interdimensionaltourist' },
        { key: 'villager', monster: 'overworkedvillager' }
    ];

    function worldSeed() {
        try {
            if (window.HistoryManager && window.HistoryManager.getSeed) {
                return window.HistoryManager.getSeed() >>> 0;
            }
        } catch (e) { /* fall through */ }
        return 19002001;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function registeredKeys() {
        try {
            if (window.Battler3D && typeof window.Battler3D.list === 'function') {
                return window.Battler3D.list();
            }
        } catch (e) { /* none registered */ }
        return [];
    }

    // Deals one creature per piece type per side, keeping only keys the battler
    // registry actually holds so a renamed archetype degrades to a stand-in
    // rather than an empty square.
    function rollArmies() {
        const known = new Set(registeredKeys());
        const rng = mulberry32(worldSeed() ^ 0x43485353);
        const fallback = registeredKeys();

        const pick = pool => {
            const ok = pool.filter(k => known.has(k));
            if (ok.length) return ok[Math.floor(rng() * ok.length)];
            if (fallback.length) return fallback[Math.floor(rng() * fallback.length)];
            return null;
        };

        const side = pools => {
            const out = {};
            for (const t of [T_PAWN, T_ROOK, T_KNIGHT, T_BISHOP, T_QUEEN, T_KING]) {
                out[t] = pick(pools[t] || []);
            }
            return out;
        };

        return { [WHITE]: side(ARMY_POOLS.light), [BLACK]: side(ARMY_POOLS.dark) };
    }

    function rollChaosCreature() {
        const known = new Set(registeredKeys());
        const ok = CHAOS_CREATURES.filter(c => known.has(c.monster));
        const pool = ok.length ? ok : CHAOS_CREATURES;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    //=========================================================================
    // ChessGame - the game as played, on top of the rules above. It owns the
    // position, the move log, the chaos layer and the cheat meter, and it
    // reports everything it does as an event list the 3D board consumes: no
    // other part of the plugin reads the board to work out what changed.
    //=========================================================================
    class ChessGame {
        constructor(mode) {
            this.pos = Position.start();
            this.gameMode = mode === 'chaos' ? 'chaos' : 'normal';
            this.moveLog = [];          // prose: what was played and what Black said about it
            this.sheet = [];            // the score sheet: notation only, one entry per ply
            this.chaos = new Map();        // square -> { key, monster }
            this.repetitions = new Map();
            this.captured = { [WHITE]: [], [BLACK]: [] };
            this.lastMove = null;
            this.gameEnded = false;
            this.result = null;            // 'win' | 'loss' | 'draw'
            this.endReason = null;
            this.events = [];
            this.cheatMeter = 0;
            this.maxCheatMeter = 100;
            this.cheatMode = false;
            this.cheatMoves = 0;
            this.recordRepetition();
        }

        //--- reporting -------------------------------------------------------

        emit(ev) { this.events.push(ev); }

        drainEvents() {
            const out = this.events;
            this.events = [];
            return out;
        }

        addToLog(message) {
            this.moveLog.push(message);
            if (this.moveLog.length > 40) this.moveLog.shift();
        }

        // The score sheet is read in pairs, so a side that plays out of turn (a
        // Chaos multi-move, or Black moving twice) is padded with the ellipsis
        // a real sheet uses rather than sliding every later move one column over.
        addToSheet(color, notation) {
            const even = this.sheet.length % 2 === 0;
            if (color === WHITE && !even) this.sheet.push('');
            if (color === BLACK && even) this.sheet.push('...');
            this.sheet.push(notation);
            while (this.sheet.length > 120) this.sheet.splice(0, 2);
        }

        //--- board access ----------------------------------------------------

        pieceAt(idx) { return this.pos.b[idx]; }
        turn() { return this.pos.turn; }
        chaosAt(idx) { return this.chaos.get(idx) || null; }

        // Every write to a square goes through here so the 3D board is told what
        // happened rather than left to work it out from a diff.
        setSquare(idx, piece, creature) {
            const was = this.pos.b[idx];
            this.pos.b[idx] = piece;
            if (was === CHAOS && piece !== CHAOS) this.chaos.delete(idx);
            if (piece === CHAOS && creature) this.chaos.set(idx, creature);

            if (was === EMPTY && piece !== EMPTY) {
                this.emit({ t: 'spawn', at: idx, piece, creature: creature || null });
            } else if (was !== EMPTY && piece === EMPTY) {
                this.emit({ t: 'remove', at: idx });
            } else if (was !== piece) {
                this.emit({ t: 'morph', at: idx, piece, creature: creature || null });
            }
        }

        recordRepetition() {
            const k = this.pos.key();
            this.repetitions.set(k, (this.repetitions.get(k) || 0) + 1);
            return this.repetitions.get(k);
        }

        legalMoves(color) {
            return genLegal(this.pos, color == null ? this.pos.turn : color);
        }

        movesFrom(idx) {
            return this.legalMoves(colorOf(this.pos.b[idx])).filter(m => m.from === idx);
        }

        //--- playing a move --------------------------------------------------

        // Runs a generated move, reports it and hands the turn over. Everything
        // the board has to draw is emitted here, in the order it happens.
        play(move) {
            const mover = move.piece;
            const color = colorOf(mover);
            const captureSquare = move.flag === F_EP
                ? sq(rowOf(move.from), colOf(move.to))
                : (move.cap ? move.to : -1);

            if (captureSquare >= 0) {
                const victim = this.pos.b[captureSquare];
                this.captured[color].push(victim);
                if (this.chaos.has(captureSquare)) this.chaos.delete(captureSquare);
                this.emit({ t: 'kill', at: captureSquare, by: move.to });
                if (color === WHITE) this.chargeCheatMeter(victim);
            }

            const notation = this.notate(move);
            const chaosCreature = this.chaos.get(move.from) || null;
            if (chaosCreature) {
                this.chaos.delete(move.from);
                this.chaos.set(move.to, chaosCreature);
            }

            doMove(this.pos, move);
            this.lastMove = move;

            this.emit({ t: 'move', from: move.from, to: move.to, flag: move.flag, capture: captureSquare >= 0 });
            if (move.flag === F_CASTLE_K) {
                this.emit({ t: 'move', from: move.to + 1, to: move.to - 1, flag: F_NONE, capture: false });
            } else if (move.flag === F_CASTLE_Q) {
                this.emit({ t: 'move', from: move.to - 2, to: move.to + 1, flag: F_NONE, capture: false });
            }
            if (move.promo) this.emit({ t: 'morph', at: move.to, piece: move.promo, creature: null });

            this.recordRepetition();
            this.addToSheet(color, notation);
            this.addToLog(color === WHITE
                ? T('Chess.whitePlays', { move: notation })
                : T('Chess.blackPlays', { move: notation }));
            return notation;
        }

        // Standard algebraic notation, with the piece letters taken from the
        // active language: a rook is R in English and T in Italian.
        notate(move) {
            const t = typeOf(move.piece);
            const to = squareName(move.to);
            if (move.flag === F_CASTLE_K) return T('Chess.san.castleShort');
            if (move.flag === F_CASTLE_Q) return T('Chess.san.castleLong');

            let text;
            if (t === T_PAWN) {
                text = move.cap ? squareName(move.from)[0] + 'x' + to : to;
            } else if (t === T_CHAOS) {
                text = T('Chess.san.chaos') + (move.cap ? 'x' : '') + to;
            } else {
                const letter = T('Chess.san.' + t);
                // Disambiguate only when a second man of the same kind could
                // have gone there, which is what the notation is actually for.
                const rivals = this.legalMoves(colorOf(move.piece)).filter(m =>
                    m.to === move.to && m.piece === move.piece && m.from !== move.from);
                let hint = '';
                if (rivals.length) {
                    const sameFile = rivals.some(m => colOf(m.from) === colOf(move.from));
                    hint = sameFile ? String(8 - rowOf(move.from)) : squareName(move.from)[0];
                }
                text = letter + hint + (move.cap ? 'x' : '') + to;
            }
            if (move.promo) text += '=' + T('Chess.san.' + typeOf(move.promo));

            // Check and mate are read off the position the move produced, so the
            // suffix is worked out after the move is on the board.
            const u = doMove(this.pos, move);
            const enemy = this.pos.turn;
            const suffix = inCheck(this.pos, enemy)
                ? (genLegal(this.pos, enemy).length === 0 ? '#' : '+')
                : '';
            undoMove(this.pos, move, u);
            return text + suffix;
        }

        //--- endings ---------------------------------------------------------

        // Answers what, if anything, has ended the game for the side to move.
        checkGameEnd() {
            if (this.gameEnded) return null;
            const color = this.pos.turn;

            // Chaos mode can leave a side with nothing at all, which no rule of
            // chess covers because no rule of chess allows it.
            let white = 0, black = 0;
            for (let i = 0; i < 64; i++) {
                const p = this.pos.b[i];
                if (p === EMPTY) continue;
                if (colorOf(p) === WHITE) white++; else black++;
            }
            if (white === 0) return this.finish('loss', 'whiteWiped');
            if (black === 0) return this.finish('win', 'blackWiped');

            const moves = this.legalMoves(color);
            if (moves.length === 0) {
                if (inCheck(this.pos, color)) {
                    return this.finish(color === WHITE ? 'loss' : 'win', 'checkmate');
                }
                return this.finish('draw', 'stalemate');
            }
            if (this.pos.half >= 100) return this.finish('draw', 'fiftyMove');
            if ((this.repetitions.get(this.pos.key()) || 0) >= 3) {
                return this.finish('draw', 'repetition');
            }
            if (this.insufficientMaterial()) return this.finish('draw', 'material');
            return null;
        }

        insufficientMaterial() {
            const minor = [];
            for (let i = 0; i < 64; i++) {
                const p = this.pos.b[i];
                if (p === EMPTY) continue;
                const t = typeOf(p);
                if (t === T_KING) continue;
                if (t === T_KNIGHT || t === T_BISHOP) { minor.push(t); continue; }
                return false;   // a pawn, rook, queen or chaos piece can still mate
            }
            return minor.length <= 1;
        }

        finish(result, reason) {
            this.gameEnded = true;
            this.result = result;
            this.endReason = reason;
            this.addToLog(T('Chess.end.' + reason));
            return { result, reason };
        }

        //--- the cheat meter -------------------------------------------------

        chargeCheatMeter(victim) {
            if (this.gameMode !== 'chaos') return;
            const gain = Math.ceil(pieceValue(victim) / 50);
            const before = this.cheatMeter;
            this.cheatMeter = Math.min(this.maxCheatMeter, this.cheatMeter + gain);
            this.addToLog(T('Chess.cheatMeterGain', {
                gain, meter: this.cheatMeter, max: this.maxCheatMeter
            }));
            if (before < this.maxCheatMeter && this.cheatMeter >= this.maxCheatMeter) {
                this.emit({ t: 'charged' });
            }
        }

        canActivateCheatMode() {
            return this.gameMode === 'chaos' && this.cheatMeter >= this.maxCheatMeter && !this.cheatMode;
        }

        activateCheatMode() {
            if (!this.canActivateCheatMode()) return false;
            this.cheatMode = true;
            this.cheatMoves = 3;
            this.cheatMeter = 0;
            this.addToLog(T('Chess.cheatModeOn'));
            return true;
        }

        isPlayerCheating() { return this.cheatMode && this.cheatMoves > 0; }

        useCheatMove() {
            if (!this.isPlayerCheating()) return false;
            this.cheatMoves--;
            if (this.cheatMoves === 0) {
                this.cheatMode = false;
                this.addToLog(T('Chess.cheatModeOff'));
            }
            return true;
        }

        // A cheat move is anything that picks up one of your own men and puts it
        // on another square. It is not generated, so it is built here.
        cheatMove(from, to) {
            const piece = this.pos.b[from];
            if (colorOf(piece) !== WHITE) return null;
            if (from === to) return null;
            const target = this.pos.b[to];
            if (target !== EMPTY && colorOf(target) === WHITE) return null;
            return mv(from, to, piece, target, 0, F_NONE);
        }

        //=====================================================================
        // The cheating opponent. Every action here writes through setSquare, so
        // however far it departs from chess the board on screen keeps up.
        //=====================================================================
        squaresWhere(test) {
            const out = [];
            for (let i = 0; i < 64; i++) if (test(this.pos.b[i], i)) out.push(i);
            return out;
        }

        randomOf(list) { return list[Math.floor(Math.random() * list.length)]; }

        takeAiTurn() {
            if (this.gameMode === 'normal') return this.aiNormalMove();
            return this.aiChaosTurn();
        }

        aiNormalMove() {
            const move = searchBestMove(this.pos, { depth: AI_DEPTH, timeMs: 140 });
            if (!move) return 'none';
            this.play(move);
            return 'move';
        }

        aiChaosTurn() {
            const actions = [
                () => this.chaosNormalMove(),
                () => this.chaosNormalMove(),      // played straight about a third of the time
                () => this.chaosColorChange(),
                () => this.chaosRelocate(),
                () => this.chaosTransform(),
                () => this.chaosResurrect(),
                () => this.chaosSummon(),
                () => this.chaosDrainMeter(),
                () => this.chaosMultiMove()
            ];
            return this.randomOf(actions)();
        }

        chaosNormalMove() {
            const move = searchBestMove(this.pos, { depth: Math.max(1, AI_DEPTH - 1), timeMs: 90, jitter: 90 });
            if (!move) return this.chaosResurrect();
            const notation = this.play(move);
            // play() already logged it plainly; say it the chaotic way instead.
            this.moveLog.pop();
            this.addToLog(T('Chess.blackPlaysNormally', { move: notation }));
            return 'move';
        }

        chaosColorChange() {
            const whites = this.squaresWhere(p => colorOf(p) === WHITE && typeOf(p) !== T_KING);
            if (!whites.length) return this.chaosTransform();
            const at = this.randomOf(whites);
            const was = this.pos.b[at];
            this.setSquare(at, makePiece(BLACK, typeOf(was)));
            this.sayTaunt('colorChange', { piece: this.pieceName(was), square: squareName(at) });
            return 'morph';
        }

        chaosRelocate() {
            const whites = this.squaresWhere(p => colorOf(p) === WHITE);
            const empties = this.squaresWhere(p => p === EMPTY);
            if (!whites.length || !empties.length) return this.chaosResurrect();
            const from = this.randomOf(whites);
            const to = this.randomOf(empties);
            const piece = this.pos.b[from];
            this.setSquare(from, EMPTY);
            this.setSquare(to, piece);
            this.sayTaunt('relocate', { piece: this.pieceName(piece), square: squareName(to) });
            return 'morph';
        }

        chaosTransform() {
            const any = this.squaresWhere(p => p !== EMPTY && typeOf(p) !== T_KING);
            if (!any.length) return this.chaosSummon();
            const at = this.randomOf(any);
            const was = this.pos.b[at];
            const type = this.randomOf([T_PAWN, T_ROOK, T_KNIGHT, T_BISHOP, T_QUEEN]);
            const now = makePiece(BLACK, type);
            if (now === was) return this.chaosSummon();
            this.setSquare(at, now);
            this.sayTaunt('transform', { from: this.pieceName(was), to: this.pieceName(now) });
            return 'morph';
        }

        chaosResurrect() {
            const empties = this.squaresWhere(p => p === EMPTY);
            if (!empties.length) return this.chaosNormalMove();
            const at = this.randomOf(empties);
            const piece = makePiece(BLACK, this.randomOf([T_PAWN, T_ROOK, T_KNIGHT, T_BISHOP, T_QUEEN]));
            this.setSquare(at, piece);
            this.sayTaunt('spawnPiece', { piece: this.pieceName(piece), square: squareName(at) });
            return 'spawn';
        }

        chaosSummon() {
            const empties = this.squaresWhere(p => p === EMPTY);
            if (!empties.length) return this.chaosTransform();
            const at = this.randomOf(empties);
            const creature = rollChaosCreature();
            this.setSquare(at, CHAOS, creature);
            this.sayTaunt('spawnChaos', {
                piece: T('Chess.chaosPiece.' + creature.key),
                square: squareName(at)
            });
            return 'spawn';
        }

        chaosDrainMeter() {
            if (this.cheatMeter <= 20) return this.chaosNormalMove();
            const stolen = Math.min(30, this.cheatMeter);
            this.cheatMeter -= stolen;
            this.sayTaunt('drain', { amount: stolen });
            return 'drain';
        }

        chaosMultiMove() {
            const count = 2 + Math.floor(Math.random() * 2);
            this.sayTaunt('multiMove', { moves: count });
            let played = 0;
            for (let i = 0; i < count; i++) {
                const move = searchBestMove(this.pos, { depth: 1, timeMs: 40, jitter: 200 });
                if (!move) break;
                const notation = this.play(move);
                this.moveLog.pop();
                this.addToLog('  ' + T('Chess.multiMoveStep', { index: i + 1, total: count, move: notation }));
                played++;
                // Black keeps the move: the whole trick is that the turn never
                // passed back, so put it back on Black's side of the clock.
                if (i < count - 1) this.pos.turn = BLACK;
            }
            return played ? 'multi' : 'none';
        }

        sayTaunt(bank, params) {
            const lines = T.list('Chess.taunt.' + bank, params);
            if (lines.length) this.addToLog(this.randomOf(lines));
        }

        pieceName(piece) {
            return T('Chess.pieceName.' + typeOf(piece));
        }

        // Material balance from White's point of view, for the HUD.
        materialBalance() {
            let score = 0;
            for (let i = 0; i < 64; i++) {
                const p = this.pos.b[i];
                if (p === EMPTY || typeOf(p) === T_KING) continue;
                score += colorOf(p) === WHITE ? pieceValue(p) : -pieceValue(p);
            }
            return Math.round(score / 100);
        }
    }

    //=========================================================================
    // Backdrop. The board is set down wherever the party is standing, so the
    // battleback is resolved exactly the way a fight on this spot would.
    //=========================================================================
    function currentBiomeName() {
        try {
            if ($gameMap && typeof $gameMap.getBiome === 'function') {
                const tagged = $gameMap.getBiome();
                if (tagged) return tagged;
            }
            const proc = $gameSystem && $gameSystem._procGenData;
            if (proc && $gameMap && $gameMap.mapId() === 636) {
                if (proc.displayAsIsland) return 'Island';
                if (proc.displayAsBeach) return 'Beach';
                if (proc.currentBiome) return proc.currentBiome;
            }
            if ($gameMap && typeof $gameMap.isInterior === 'function' && $gameMap.isInterior()) {
                return 'Dungeon';
            }
        } catch (e) { /* fall through to the default biome */ }
        return 'Fields';
    }

    function backdropBitmap() {
        try {
            let file = null;
            if (typeof ImageManager.getBiomeBackgroundForPlayer === 'function') {
                const biome = currentBiomeName();
                file = ImageManager.getBiomeBackgroundForPlayer(biome);
                if (!file && biome !== 'Fields') file = ImageManager.getBiomeBackgroundForPlayer('Fields');
            }
            if (!file && $dataMap && $dataMap.battleback1Name) file = $dataMap.battleback1Name;
            if (file) return ImageManager.loadBattleback1(file);
        } catch (e) { /* the plain gradient will do */ }
        return null;
    }

    //=========================================================================
    // Board3D - the three.js stage. One square is one world unit, the board is
    // centred on the origin, and row 0 (Black's home) sits at -z, so the camera
    // stands behind White and the player sees the game from their own side.
    //=========================================================================
    const PSX_SOFTEN = { vertexSnap: 1.6, colorLevels: 1.25, dither: 0.55, downscale: 1 };
    const softPSX = fn => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    // How tall each kind of man stands, in squares.
    const PIECE_HEIGHT = {
        [T_PAWN]: 0.58, [T_ROOK]: 0.78, [T_KNIGHT]: 0.82,
        [T_BISHOP]: 0.80, [T_QUEEN]: 0.98, [T_KING]: 1.08, [T_CHAOS]: 0.72
    };

    const squareX = idx => colOf(idx) - 3.5;
    const squareZ = idx => rowOf(idx) - 3.5;

    class Board3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._disposables = [];
            this._ents = new Map();          // id -> entity
            this._grid = new Int32Array(64); // square -> entity id, 0 for empty
            this._nextId = 1;
            this._fx = [];
            this._queue = [];                // creatures still to be built
            this._pending = 0;
            this._yaw = 0;
            this._yawTarget = 0;
            this._armies = rollArmies();
            this._time = 0;

            this._initThree();
            softPSX(() => {
                this._buildTable();
                this._buildSquares();
                this._buildMarkers();
            });
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(46, this._w / this._h, 0.1, 200);

            // Transparent, so the battleback behind shows through and the board
            // reads as a thing standing in the world rather than a menu.
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            this.scene.add(new THREE.AmbientLight(0xa8b4d0, 0.62));
            const key = new THREE.DirectionalLight(0xfff0d0, 0.9);
            key.position.set(5, 9, 6);
            this.scene.add(key);
            const fill = new THREE.DirectionalLight(0x7088c8, 0.45);
            fill.position.set(-6, 4, -5);
            this.scene.add(fill);
            const lamp = new THREE.PointLight(0xffdca8, 0.9, 18, 2);
            lamp.position.set(0, 5.5, 0);
            this.scene.add(lamp);
        }

        _track(obj) { this._disposables.push(obj); return obj; }

        _geo(g) { return this._track(g); }

        _mat(options) { return this._track(new THREE.MeshLambertMaterial(options)); }

        _canvasTexture(w, h, draw) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            draw(canvas.getContext('2d'), w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            return this._track(tex);
        }

        // Grain, knots and all, painted once per shade rather than sampled from
        // a file: two 64px canvases is the whole texture budget of the board.
        _woodTexture(base, streak) {
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = streak;
                for (let i = 0; i < 26; i++) {
                    const y = Math.floor(Math.random() * h);
                    ctx.globalAlpha = 0.10 + Math.random() * 0.22;
                    ctx.fillRect(0, y, w, 1);
                }
                ctx.globalAlpha = 0.3;
                for (let i = 0; i < 40; i++) {
                    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
                }
                ctx.globalAlpha = 1;
            });
        }

        _buildTable() {
            // A wide dark plate under the board, so the men never read as
            // floating over whatever photograph is behind them.
            const geo = this._geo(new THREE.BoxGeometry(13.5, 0.4, 13.5));
            const mat = this._mat({ color: 0x1a1712 });
            const table = new THREE.Mesh(geo, mat);
            table.position.set(0, -0.42, 0);
            this.scene.add(table);

            const rimGeo = this._geo(new THREE.BoxGeometry(9.4, 0.26, 9.4));
            const rimMat = this._mat({ color: 0x4a3418, map: this._woodTexture('#4a3418', '#2a1c0c') });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.position.set(0, -0.14, 0);
            this.scene.add(rim);

            const bandGeo = this._geo(new THREE.BoxGeometry(9.0, 0.06, 9.0));
            const bandMat = this._mat({ color: 0x8d6f2c });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.set(0, -0.01, 0);
            this.scene.add(band);
        }

        _buildSquares() {
            const lightMat = this._mat({ color: 0xe0cba4, map: this._woodTexture('#e0cba4', '#c4ab84') });
            const darkMat = this._mat({ color: 0x6d4a30, map: this._woodTexture('#6d4a30', '#4c3120') });
            const geo = this._geo(new THREE.BoxGeometry(1.0, 0.14, 1.0));
            this._squareMeshes = [];
            for (let i = 0; i < 64; i++) {
                const light = (rowOf(i) + colOf(i)) % 2 === 0;
                const mesh = new THREE.Mesh(geo, light ? lightMat : darkMat);
                mesh.position.set(squareX(i), -0.07, squareZ(i));
                this.scene.add(mesh);
                this._squareMeshes.push(mesh);
            }
        }

        // Flat plates laid on the squares. Nothing here is transparent: an
        // additive plate over a lit wooden board reads as a colour wash, which
        // is exactly the highlight a chess board wants.
        _plate(color, size, y) {
            const geo = this._geo(new THREE.BoxGeometry(size, 0.02, size));
            const mat = this._track(new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.55, depthWrite: false
            }));
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = y;
            mesh.visible = false;
            this.scene.add(mesh);
            return mesh;
        }

        _buildMarkers() {
            this._cursorPlate = this._plate(0xffd870, 0.98, 0.012);
            this._selectPlate = this._plate(0x66e0ff, 0.94, 0.016);
            this._checkPlate = this._plate(0xff4a3a, 0.96, 0.014);
            this._fromPlate = this._plate(0x9fb6ff, 0.9, 0.010);
            this._toPlate = this._plate(0x9fb6ff, 0.9, 0.010);

            // One pool of discs, big enough for a queen in the open.
            const geo = this._geo(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10));
            const mat = this._track(new THREE.MeshBasicMaterial({
                color: 0x8affc0, transparent: true, opacity: 0.75, depthWrite: false
            }));
            const capGeo = this._geo(new THREE.TorusGeometry(0.40, 0.045, 6, 14));
            const capMat = this._track(new THREE.MeshBasicMaterial({
                color: 0xff9060, transparent: true, opacity: 0.8, depthWrite: false
            }));
            this._dots = [];
            this._rings = [];
            for (let i = 0; i < 32; i++) {
                const dot = new THREE.Mesh(geo, mat);
                dot.position.y = 0.03;
                dot.visible = false;
                this.scene.add(dot);
                this._dots.push(dot);

                const ring = new THREE.Mesh(capGeo, capMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.y = 0.03;
                ring.visible = false;
                this.scene.add(ring);
                this._rings.push(ring);
            }
        }

        //--- the men ---------------------------------------------------------

        // Queues a creature for the square. Models are built one a frame so the
        // scene opens straight away and the two armies walk on rather than the
        // game stalling for a second and a half while thirty-two rigs are made.
        addPiece(idx, piece, creature) {
            const id = this._nextId++;
            const type = typeOf(piece);
            const color = colorOf(piece);
            let monster = creature ? creature.monster
                : (this._armies[color] && this._armies[color][type]);
            if (!monster) {
                // A type with no creature dealt to it (a chaos piece that arrived
                // without one) still has to stand on the board.
                const all = registeredKeys();
                monster = all.length ? all[Math.floor(Math.random() * all.length)] : null;
            }
            const ent = {
                id, piece, type, color, monster,
                square: idx, holder: null, model: null,
                offX: 0, offY: 0, offZ: 0, fit: 1,
                x: squareX(idx), z: squareZ(idx), y: 0,
                bob: Math.random() * Math.PI * 2,
                dying: false, ready: false, moving: false, pending: []
            };
            this._ents.set(id, ent);
            this._grid[idx] = id;
            this._queue.push(ent);
            return id;
        }

        _drainQueue() {
            // Two a frame: enough to have the board dressed inside a second,
            // few enough that no frame is spent building rigs.
            for (let n = 0; n < 2 && this._queue.length; n++) {
                const ent = this._queue.shift();
                this._build(ent);
            }
        }

        _build(ent) {
            if (!window.Battler3D || !ent.monster) return;
            let model;
            try {
                model = window.Battler3D.create(ent.monster, 1.0, 0, null);
            } catch (e) { model = null; }
            if (!model) return;
            ent.model = model;
            this._pending++;

            Promise.resolve(model.load(null, 0, 0, 0)).then(() => {
                this._pending--;
                if (!this.scene || !model.model || !this._ents.has(ent.id)) return;
                const root = model.model;

                // Mirror the battle scene's facing wrapper for the families that
                // are not built facing down their own -z.
                if (model.facingYaw && !model._facingApplied) {
                    model._facingApplied = true;
                    const inner = new THREE.Group();
                    inner.rotation.y = model.facingYaw;
                    for (const child of root.children.slice()) inner.add(child);
                    root.add(inner);
                }

                // The holder carries everything the board decides (where the man
                // stands, how big he is); the model keeps its own transforms for
                // its animations to write to.
                const holder = new THREE.Group();
                holder.add(root);
                holder.updateMatrixWorld(true);

                const box = new THREE.Box3().setFromObject(root);
                const height = Math.max(0.001, box.max.y - box.min.y);
                const fit = (PIECE_HEIGHT[ent.type] || 0.75) / height;
                holder.scale.setScalar(fit);
                ent.fit = fit;
                ent.offX = -((box.min.x + box.max.x) / 2) * fit;
                ent.offY = -box.min.y * fit;
                ent.offZ = -((box.min.z + box.max.z) / 2) * fit;

                holder.rotation.y = ent.color === WHITE ? Math.PI : 0;
                ent.holder = holder;
                this._placeHolder(ent);
                if (window.PSXShader) window.PSXShader.applyToObject(holder);
                this.scene.add(holder);
                ent.ready = true;
                try { model.playIdleAnimation(); } catch (e) { /* some families auto-idle */ }
            }).catch(() => { this._pending--; });
        }

        _placeHolder(ent) {
            if (!ent.holder) return;
            ent.holder.position.set(ent.x + ent.offX, ent.y + ent.offY, ent.z + ent.offZ);
        }

        entityAt(idx) {
            const id = this._grid[idx];
            return id ? this._ents.get(id) : null;
        }

        // Slides a man to another square over a low hop. A knight goes higher,
        // because a knight is the one piece that is meant to go over things.
        // A man told to move again before he has arrived (which is what a chaos
        // multi-move does) queues the second hop rather than running two
        // animations over the same body at once.
        movePiece(from, to, opts) {
            const o = opts || {};
            const ent = this.entityAt(from);
            this._grid[from] = 0;
            if (!ent) return;
            const displaced = this.entityAt(to);
            if (displaced && displaced !== ent && !displaced.dying) this.killPiece(to);
            this._grid[to] = ent.id;
            ent.square = to;

            const hop = { to, capture: !!o.capture, dur: o.dur };
            if (ent.moving) { ent.pending.push(hop); return; }
            ent.moving = true;
            this._startHop(ent, hop);
        }

        _startHop(ent, hop) {
            this._fx.push({
                kind: 'move', ent,
                fromX: ent.x, fromZ: ent.z,
                toX: squareX(hop.to), toZ: squareZ(hop.to),
                arc: ent.type === T_KNIGHT ? 0.85 : 0.34,
                t: 0, dur: hop.dur || (ent.type === T_KNIGHT ? 0.42 : 0.34),
                capture: hop.capture, struck: false
            });
        }

        // Fells the man on a square: he plays his death, sinks and is taken off.
        killPiece(idx) {
            const ent = this.entityAt(idx);
            if (!ent || ent.dying) return;
            ent.dying = true;
            this._grid[idx] = 0;
            if (ent.model) {
                try { ent.model.playAnimation('death'); } catch (e) { /* not every family has one */ }
            }
            this._fx.push({ kind: 'die', ent, t: 0, dur: 0.62 });
        }

        // Taken off with no ceremony: the chaos opponent stealing a man, or a
        // pawn being replaced by the queen it promoted into.
        removePiece(idx) {
            const ent = this.entityAt(idx);
            if (!ent) return;
            this._grid[idx] = 0;
            this._drop(ent);
        }

        _drop(ent) {
            if (ent.holder && ent.holder.parent) ent.holder.parent.remove(ent.holder);
            // Anything still waiting on this man (a queued hop, a deferred
            // morph) must be released, or the board stays busy for good.
            ent.moving = false;
            ent.pending = [];
            this._ents.delete(ent.id);
            this._queue = this._queue.filter(q => q !== ent);
        }

        // Swaps the creature standing on a square for a different one, which is
        // what promotion and every chaos transformation come down to. A pawn
        // still walking onto the last rank is left to arrive first: it changes
        // when it lands, not in mid air.
        morphPiece(idx, piece, creature) {
            const ent = this.entityAt(idx);
            if (ent && ent.moving) {
                // Held against the MAN, not the square: a chaos multi-move can
                // promote a pawn and then walk the new queen on again in the
                // same breath, and the square he started from is not his.
                this._fx.push({ kind: 'morphAfter', ent, piece, creature });
                return;
            }
            this._morphNow(idx, piece, creature);
        }

        _morphNow(idx, piece, creature) {
            this.removePiece(idx);
            this.addPiece(idx, piece, creature);
            this._fx.push({ kind: 'pop', at: idx, t: 0, dur: 0.3 });
        }

        //--- markers ---------------------------------------------------------

        setCursor(idx) {
            this._cursorPlate.visible = idx >= 0;
            if (idx >= 0) this._cursorPlate.position.set(squareX(idx), 0.012, squareZ(idx));
        }

        setSelected(idx) {
            this._selectPlate.visible = idx >= 0;
            if (idx >= 0) this._selectPlate.position.set(squareX(idx), 0.016, squareZ(idx));
        }

        setCheck(idx) {
            this._checkPlate.visible = idx >= 0;
            if (idx >= 0) this._checkPlate.position.set(squareX(idx), 0.014, squareZ(idx));
        }

        setLastMove(move) {
            const on = !!move;
            this._fromPlate.visible = on;
            this._toPlate.visible = on;
            if (!on) return;
            this._fromPlate.position.set(squareX(move.from), 0.010, squareZ(move.from));
            this._toPlate.position.set(squareX(move.to), 0.010, squareZ(move.to));
        }

        // A quiet square gets a disc, a square holding something to take gets a
        // ring around it: the difference has to be readable at a glance.
        setMoveHints(moves) {
            let dots = 0, rings = 0;
            for (const m of moves || []) {
                const capture = m.cap || m.flag === F_EP;
                const list = capture ? this._rings : this._dots;
                const i = capture ? rings++ : dots++;
                if (i >= list.length) continue;
                list[i].visible = true;
                list[i].position.set(squareX(m.to), 0.03, squareZ(m.to));
            }
            for (let i = dots; i < this._dots.length; i++) this._dots[i].visible = false;
            for (let i = rings; i < this._rings.length; i++) this._rings[i].visible = false;
        }

        //--- frame -----------------------------------------------------------

        isBusy() { return this._fx.length > 0; }

        isDressing() { return this._queue.length > 0 || this._pending > 0; }

        turnBoard(dir) { this._yawTarget += dir * Math.PI / 8; }

        // How many right angles the board has been turned through, which is what
        // the cursor needs to keep "up" meaning "away from the player".
        quarterTurns() {
            return ((Math.round(this._yawTarget / (Math.PI / 2)) % 4) + 4) % 4;
        }

        update(dt) {
            this._time += dt;
            this._drainQueue();
            this._updateFx(dt);

            for (const ent of this._ents.values()) {
                if (ent.model && typeof ent.model.update === 'function') {
                    try { ent.model.update(dt); } catch (e) { /* a broken pose is not worth a crash */ }
                }
                if (!ent.ready || ent.dying || ent.moving) continue;
                // A resting man breathes: a small bob so a board of thirty-two
                // creatures is never a board of thirty-two statues.
                ent.bob += dt * 1.6;
                ent.y = Math.sin(ent.bob) * 0.012;
                this._placeHolder(ent);
            }

            const pulse = 0.42 + Math.abs(Math.sin(this._time * 3.2)) * 0.3;
            this._cursorPlate.material.opacity = pulse;
            if (this._checkPlate.visible) {
                this._checkPlate.material.opacity = 0.35 + Math.abs(Math.sin(this._time * 5)) * 0.45;
            }
        }

        _updateFx(dt) {
            for (let i = this._fx.length - 1; i >= 0; i--) {
                const fx = this._fx[i];

                // A morph waiting on its own arrival: it holds the board busy
                // until the man it is replacing has finished walking.
                if (fx.kind === 'morphAfter') {
                    if (fx.ent && fx.ent.moving) continue;
                    this._fx.splice(i, 1);
                    // He changes wherever he has ended up, and not at all if he
                    // was taken off the board on the way.
                    if (fx.ent && this._ents.has(fx.ent.id)) {
                        this._morphNow(fx.ent.square, fx.piece, fx.creature);
                    }
                    continue;
                }

                fx.t += dt;
                const k = Math.min(1, fx.t / fx.dur);

                if (fx.kind === 'move') {
                    const ent = fx.ent;
                    ent.x = fx.fromX + (fx.toX - fx.fromX) * k;
                    ent.z = fx.fromZ + (fx.toZ - fx.fromZ) * k;
                    ent.y = Math.sin(k * Math.PI) * fx.arc;
                    this._placeHolder(ent);
                    // The lunge lands halfway, where the two men meet.
                    if (fx.capture && !fx.struck && k >= 0.45) {
                        fx.struck = true;
                        if (ent.model) {
                            try { ent.model.playAnimation('attack', false); } catch (e) { /* ignore */ }
                        }
                    }
                    if (k >= 1) {
                        ent.x = fx.toX; ent.z = fx.toZ; ent.y = 0;
                        this._placeHolder(ent);
                        this._fx.splice(i, 1);
                        if (ent.pending.length) {
                            // Another hop was asked for while this one ran: take
                            // it now, so a multi-move is walked square by square.
                            this._startHop(ent, ent.pending.shift());
                        } else {
                            ent.moving = false;
                            if (ent.model) {
                                try { ent.model.playIdleAnimation(); } catch (e) { /* ignore */ }
                            }
                            se('land', { pitch: 120 + Math.floor(Math.random() * 20) });
                        }
                    }
                } else if (fx.kind === 'die') {
                    const ent = fx.ent;
                    if (ent.holder) {
                        const shrink = 1 - k * 0.55;
                        ent.holder.scale.setScalar(ent.fit * shrink);
                        ent.holder.rotation.z = k * 1.1;
                        ent.holder.position.y = ent.offY - k * 0.35;
                    }
                    if (k >= 1) {
                        this._drop(ent);
                        this._fx.splice(i, 1);
                    }
                } else if (fx.kind === 'pop') {
                    const ent = this.entityAt(fx.at);
                    if (ent && ent.holder) {
                        const s = 0.5 + k * 0.5;
                        ent.holder.scale.setScalar(ent.fit * s);
                    }
                    if (k >= 1) {
                        if (ent && ent.holder) ent.holder.scale.setScalar(ent.fit);
                        this._fx.splice(i, 1);
                    }
                } else {
                    this._fx.splice(i, 1);
                }
            }
        }

        updateCamera(dt) {
            this._yaw += (this._yawTarget - this._yaw) * Math.min(1, dt * 6);
            const dist = 12.6, pitch = 0.74;   // 42 degrees over the board
            const y = Math.sin(pitch) * dist;
            const flat = Math.cos(pitch) * dist;
            this.camera.position.set(Math.sin(this._yaw) * flat, y, Math.cos(this._yaw) * flat);
            this.camera.lookAt(0, 0.35, 0);
            // The right stick looks around the board without turning it: the
            // turn is a move of its own (L1 / R1) and stays where it was put.
            this._padOrbit(dt);
        }

        _padOrbit(dt) {
            if (!this._orbit && window.Controller) {
                this._orbit = window.Controller.orbit({ minPitch: -0.5, maxPitch: 0.5 });
            }
            if (!this._orbit) return;
            this._orbit.update(dt);
            this._orbit.applyTo(this.camera, { x: 0, y: 0.35, z: 0 });
        }

        // Which square the pointer is over, by dropping its ray onto the board
        // plane. Returns -1 for a click off the board.
        squareAtScreen(px, py, viewW, viewH) {
            if (!this.camera) return -1;
            const ndc = new THREE.Vector2((px / viewW) * 2 - 1, -((py / viewH) * 2 - 1));
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, this.camera);
            const dir = ray.ray.direction, org = ray.ray.origin;
            if (Math.abs(dir.y) < 1e-6) return -1;
            const t = -org.y / dir.y;
            if (t < 0) return -1;
            const x = org.x + dir.x * t;
            const z = org.z + dir.z * t;
            const c = Math.round(x + 3.5);
            const r = Math.round(z + 3.5);
            return onBoard(r, c) ? sq(r, c) : -1;
        }

        render() {
            if (window.PSXShader) {
                softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            for (const item of this._disposables) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._disposables = [];
            this._ents.clear();
            this._queue = [];
            if (this.renderer) {
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this.renderer);
                }
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
                this.renderer = null;
            }
            this.scene = null;
        }
    }

    //=========================================================================
    // HUD. The shared low-resolution art deco toolkit, the same one the alley,
    // the court and the tarot parlour are dressed with: an 8px bitmap face in a
    // 240 line virtual framebuffer, gold on black lacquer.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    let CHESS_DOMS = [];

    class Sprite_PSXWidget extends Sprite {
        constructor(vw, vh, vx, vy) {
            super();
            this._vw = vw;
            this._vh = vh;
            this.bitmap = new Bitmap(vw, vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            if (vx != null) this.x = Math.round(vx * s);
            if (vy != null) this.y = Math.round(vy * s);
        }

        dom() {
            const H = HUD();
            if (!H || !H.domPanel) return null;
            if (!this._dom) {
                this._dom = H.domPanel(this);
                CHESS_DOMS.push(this._dom);
            }
            return this._dom;
        }

        beginText() {
            const d = this.dom();
            if (d) d.begin();
        }

        hudText(str, x, y, w, align, color, size, opts) {
            if (this._dom) this._dom.text(str, x, y, w, align, color, size, opts);
            else if (HUD()) HUD().text(this.bitmap, str, x, y, w, align, color, size, opts);
        }

        endText() {
            if (this._dom) this._dom.end();
        }
    }

    // Top strip: whose move it is, in which mode, and whether a king is in
    // trouble. The one line the player reads every turn.
    class Sprite_ChessHeader extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 20, 0, 0);
            this._sig = null;
        }

        setState(state) {
            const sig = [state.mode, state.turn, state.note, state.material].join('|');
            if (sig === this._sig) return;
            this._sig = sig;
            this._state = state;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H || !this._state) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { hairline: false, step: 1, corners: false });
            this.hudText(this._state.mode, 6, 6, 96, 'left', D.gold, 8);
            this.hudText(this._state.turn, 0, 6, this._vw, 'center', D.ink, 8);
            // A king in check outranks the material count: it is the one thing
            // on this strip the player has to act on.
            const right = this._state.note || this._state.material;
            this.hudText(right, this._vw - 102, 6, 96, 'right',
                this._state.note ? D.red : D.dim, 8);
            this.endText();
        }
    }

    // Right-hand column: the move list, newest at the bottom, in two columns of
    // the same numbered pairs a score sheet uses.
    class Sprite_ChessLog extends Sprite_PSXWidget {
        constructor() {
            super(112, 118);
            this.x = Math.round((hudW() - 116) * hudScale());
            this.y = Math.round(24 * hudScale());
            this._sig = null;
        }

        setLines(lines) {
            const sig = lines.join('\n');
            if (sig === this._sig) return;
            this._sig = sig;
            this._lines = lines;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('Chess.ui.record'), titleAlign: 'center', headerH: 9, hairline: false, step: 1,
                dom: this._dom
            });
            let y = 14;
            for (const line of (this._lines || [])) {
                if (y > this._vh - 10) break;
                this.hudText(line, 6, y, this._vw - 12, 'left', D.ink, 8, { raw: true });
                y += 9;
            }
            this.endText();
        }
    }

    // Left-hand column: everything the cheating opponent has said, which in
    // Chaos mode is the running commentary and in Normal mode is empty.
    class Sprite_ChessChatter extends Sprite_PSXWidget {
        constructor() {
            super(120, 140, 4, 24);
            this._sig = null;
        }

        setLines(lines) {
            const sig = lines.join('\n');
            if (sig === this._sig) return;
            this._sig = sig;
            this._lines = lines;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('Chess.ui.chatter'), titleAlign: 'center', headerH: 9, hairline: false, step: 1,
                dom: this._dom
            });
            let y = 14;
            for (const line of (this._lines || [])) {
                if (y > this._vh - 10) break;
                // Word-wrapped by hand: an 8px face in a 108px column fits about
                // twenty-two characters, and the DOM layer will not wrap for us.
                for (const chunk of wrapText(line, 24)) {
                    if (y > this._vh - 10) break;
                    this.hudText(chunk, 6, y, this._vw - 12, 'left', D.dim, 8, { raw: true });
                    y += 8;
                }
                y += 2;
            }
            this.endText();
        }
    }

    class Sprite_CheatMeter extends Sprite_PSXWidget {
        constructor() {
            super(34, 74);
            this.x = Math.round((hudW() - 40) * hudScale());
            this.y = Math.round(148 * hudScale());
            this._sig = null;
        }

        setState(meter, max, ready, cheating, moves) {
            const sig = [meter, max, ready, cheating, moves].join('|');
            if (sig === this._sig) return;
            this._sig = sig;
            this._state = { meter, max, ready, cheating, moves };
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H || !this._state) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            const s = this._state;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('Chess.ui.cheat'), titleAlign: 'center', headerH: 9, hairline: false, step: 1,
                dom: this._dom
            });
            H.decoVBar(bmp, 10, 14, 14, 46, Math.max(0, Math.min(1, s.meter / s.max)), {
                colorAt: t => (t < 0.5 ? D.jade : (t < 0.9 ? D.gold : D.red))
            });
            const label = s.cheating ? String(s.moves) : (s.ready ? T('Chess.ui.ready') : String(s.meter));
            this.hudText(label, 0, 62, this._vw, 'center',
                s.ready || s.cheating ? D.goldHi : D.dim, 8);
            this.endText();
        }
    }

    class Sprite_ChessStatus extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 14, 0, 0);
            this.y = Graphics.height - Math.round(14 * hudScale());
            this._text = null;
        }

        setText(text) {
            if (this._text === text) return;
            this._text = text;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            if (!this._text) { this.endText(); return; }
            bmp.fillRect(0, 0, this._vw, this._vh, D.black);
            bmp.fillRect(0, 0, this._vw, 1, D.gold);
            this.hudText(this._text, 2, 2, this._vw - 4, 'center', D.ink, 8);
            this.endText();
        }
    }

    // A centred deco card with a title and a row of choices, used for both the
    // opening mode question and the promotion question.
    class Sprite_ChessCard extends Sprite_PSXWidget {
        constructor(vw, vh) {
            super(vw, vh);
            this.x = Math.round((Graphics.width - vw * hudScale()) / 2);
            this.y = Math.round((Graphics.height - vh * hudScale()) / 2.4);
            this.visible = false;
            this._index = 0;
            this._options = [];
        }

        open(title, options, subtitle) {
            this._title = title;
            this._subtitle = subtitle || '';
            this._options = options;
            this._index = 0;
            this.visible = true;
            this.refresh();
        }

        close() {
            this.visible = false;
            if (this._dom) this._dom.clear();
        }

        move(delta) {
            if (!this._options.length) return;
            this._index = (this._index + delta + this._options.length) % this._options.length;
            se('cursor');
            this.refresh();
        }

        current() { return this._options[this._index]; }

        refresh() {
            const H = HUD();
            if (!H || !this.visible) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { step: 3 });
            this.hudText(this._title, 0, 8, this._vw, 'center', D.goldHi, 16);
            let y = 30;
            if (this._subtitle) {
                this.hudText(this._subtitle, 0, y, this._vw, 'center', D.dim, 8);
                y += 12;
            }
            H.decoRule(bmp, 10, y, this._vw - 20, D.goldLo);
            y += 6;
            this._options.forEach((opt, i) => {
                const on = i === this._index;
                if (on) H.decoSelect(bmp, 6, y - 1, this._vw - 12, 11, D.sel);
                this.hudText(opt.label, 12, y + 1, this._vw - 24, 'left',
                    on ? D.goldHi : D.dim, 8);
                y += 13;
            });
            this.endText();
        }
    }

    class Sprite_ChessResult extends Sprite_PSXWidget {
        constructor() {
            super(180, 58);
            this.x = Math.round((Graphics.width - this._vw * hudScale()) / 2);
            this.y = Math.round((Graphics.height - this._vh * hudScale()) / 2);
            this.visible = false;
        }

        show(title, detail, tone) {
            this.visible = true;
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { step: 3 });
            H.decoSunburst(bmp, 1, 12, 13, D.goldLo, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
            H.decoSunburst(bmp, this._vw - 2, 12, 13, D.goldLo, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            const color = tone === 'win' ? D.green : (tone === 'loss' ? D.red : D.goldHi);
            this.hudText(title, 0, 8, this._vw, 'center', color, 16);
            H.decoRule(bmp, 10, 30, this._vw - 20, D.goldLo);
            this.hudText(detail, 0, 34, this._vw, 'center', D.ink, 8);
            this.hudText(T('Chess.ui.pressToLeave'), 0, 45, this._vw, 'center', D.dim, 8);
            this.endText();
        }
    }

    // Splits a line into chunks of at most `width` characters, on spaces where
    // there is one to break on.
    function wrapText(text, width) {
        const words = String(text).split(/\s+/);
        const out = [];
        let line = '';
        for (const word of words) {
            if (!line.length) { line = word; continue; }
            if (line.length + 1 + word.length <= width) line += ' ' + word;
            else { out.push(line); line = word; }
        }
        if (line.length) out.push(line);
        return out;
    }

    //=========================================================================
    // Scene_Chess
    //=========================================================================
    const STATE = {
        MODE: 'mode',        // the opening question
        PLAYER: 'player',
        PROMOTE: 'promote',
        THINKING: 'thinking',
        ANIMATING: 'animating',
        OVER: 'over'
    };

    class Scene_Chess extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._forcedMode = window.tempChessMode || null;
            this._cursor = 52;               // e2, where the game usually starts
            this._selected = -1;
            this._hints = [];
            this._state = STATE.MODE;
            this._wait = 0;
            this._threeReady = typeof THREE !== 'undefined';
            this._pendingPromotion = null;
        }

        create() {
            super.create();
            this.createUI();
            if (!this._threeReady) {
                this._state = STATE.OVER;
                this._status.setText(T('Chess.ui.noThree'));
                return;
            }
            this.createBoard();

            const mode = this._forcedMode || (DEFAULT_MODE === 'ask' ? null : DEFAULT_MODE);
            if (mode) this.startGame(mode);
            else this.askMode();
        }

        //--- construction ----------------------------------------------------

        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#141020', '#05060c', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);

            const bitmap = backdropBitmap();
            if (!bitmap) return;
            this._backdropSprite = new Sprite(bitmap);
            this.addChild(this._backdropSprite);
            bitmap.addLoadListener(() => this.fitBackdrop());
            this.fitBackdrop();

            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll('rgba(3, 4, 10, 0.45)');
            shade.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(shade);
        }

        fitBackdrop() {
            const sprite = this._backdropSprite;
            if (!sprite || !sprite.bitmap || !sprite.bitmap.width) return;
            const scale = Math.max(
                Graphics.width / sprite.bitmap.width,
                Graphics.height / sprite.bitmap.height
            );
            sprite.scale.set(scale, scale);
            sprite.x = (Graphics.width - sprite.bitmap.width * scale) / 2;
            sprite.y = Graphics.height - sprite.bitmap.height * scale;
        }

        createBoard() {
            const scale = 0.88;
            this._viewW = Math.round(Graphics.width * scale);
            this._viewH = Math.round(Graphics.height * scale);
            this._board = new Board3D(this._viewW, this._viewH);

            const texture = PIXI.Texture.from(this._board.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._boardSprite = new PIXI.Sprite(texture);
            this._boardSprite.scale.set(Graphics.width / this._viewW, Graphics.height / this._viewH);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._boardSprite, idx);
        }

        createUI() {
            this._header = new Sprite_ChessHeader();
            this.addChild(this._header);

            this._log = new Sprite_ChessLog();
            this.addChild(this._log);

            this._chatter = new Sprite_ChessChatter();
            this._chatter.visible = false;
            this.addChild(this._chatter);

            this._meter = new Sprite_CheatMeter();
            this._meter.visible = false;
            this.addChild(this._meter);

            this._status = new Sprite_ChessStatus();
            this.addChild(this._status);

            // Tall enough for the four men a pawn may promote into, which is the
            // longest list this card ever carries.
            this._card = new Sprite_ChessCard(150, 104);
            this.addChild(this._card);

            this._result = new Sprite_ChessResult();
            this.addChild(this._result);

            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._header) return;
                    this._header.refresh();
                    this._log.refresh();
                    this._chatter.refresh();
                    this._meter.refresh();
                    this._status.refresh();
                    if (this._card.visible) this._card.refresh();
                });
            }
        }

        //--- opening ---------------------------------------------------------

        askMode() {
            this._state = STATE.MODE;
            this._card.open(T('Chess.ui.chooseMode'), [
                { value: 'normal', label: T('Chess.modeNormal') },
                { value: 'chaos', label: T('Chess.modeChaos') }
            ]);
            this._status.setText(T('Chess.ui.chooseModeHint'));
        }

        startGame(mode) {
            this._card.close();
            this.chess = new ChessGame(mode);
            this._chatter.visible = mode === 'chaos';
            this._meter.visible = mode === 'chaos';

            // The board is dressed straight off the starting position, which is
            // also the only place the two are synchronised by hand: from here on
            // the game reports every change and the board follows.
            for (let i = 0; i < 64; i++) {
                const piece = this.chess.pieceAt(i);
                if (piece !== EMPTY) this._board.addPiece(i, piece, null);
            }

            this._state = STATE.PLAYER;
            this._selected = -1;
            this.refreshHints();
            this.refreshHUD();
            this._status.setText(T('Chess.ui.yourMove'));
            if (window.MinigameFun) window.MinigameFun.played('Chess');
        }

        //--- per-frame -------------------------------------------------------

        update() {
            super.update();
            const dt = 1 / 60;

            if (this._board) {
                this._board.update(dt);
                this._board.updateCamera(dt);
            }

            switch (this._state) {
                case STATE.MODE: this.updateModeChoice(); break;
                case STATE.PLAYER: this.updatePlayer(); break;
                case STATE.PROMOTE: this.updatePromotion(); break;
                case STATE.THINKING: this.updateThinking(); break;
                case STATE.ANIMATING: this.updateAnimating(); break;
                case STATE.OVER: this.updateOver(); break;
            }

            this.updateCameraInput();
            for (const dom of CHESS_DOMS) dom.sync();

            if (this._board) {
                this._board.render();
                if (this._boardSprite && this._boardSprite.texture) {
                    this._boardSprite.texture.update();
                }
            }
        }

        updateCameraInput() {
            if (!this._board) return;
            if (Input.isTriggered('pageup')) this._board.turnBoard(1);
            if (Input.isTriggered('pagedown')) this._board.turnBoard(-1);
        }

        updateModeChoice() {
            if (Input.isTriggered('up')) this._card.move(-1);
            if (Input.isTriggered('down')) this._card.move(1);
            if (Input.isTriggered('ok')) {
                se('pick');
                this.startGame(this._card.current().value);
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        //--- the player's turn -----------------------------------------------

        updatePlayer() {
            if (this._board.isBusy()) return;

            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                if (this._selected >= 0) {
                    se('cursor');
                    this._selected = -1;
                    this.refreshHints();
                } else {
                    SoundManager.playCancel();
                    this.popScene();
                }
                return;
            }

            if (Input.isTriggered('shift') && this.chess.canActivateCheatMode()) {
                this.chess.activateCheatMode();
                se('cheat');
                this.refreshHUD();
                return;
            }

            this.updateCursorInput();

            let chosen = -1;
            if (Input.isTriggered('ok')) chosen = this._cursor;
            else if (TouchInput.isTriggered()) {
                const at = this._board.squareAtScreen(
                    TouchInput.x * this._viewW / Graphics.width,
                    TouchInput.y * this._viewH / Graphics.height,
                    this._viewW, this._viewH
                );
                if (at >= 0) {
                    this._cursor = at;
                    this._board.setCursor(at);
                    chosen = at;
                }
            }
            if (chosen >= 0) this.chooseSquare(chosen);
        }

        updateCursorInput() {
            let dr = 0, dc = 0;
            if (Input.isRepeated('up')) dr = -1;
            else if (Input.isRepeated('down')) dr = 1;
            else if (Input.isRepeated('left')) dc = -1;
            else if (Input.isRepeated('right')) dc = 1;
            if (!dr && !dc) return;

            // The cursor walks the board as the player sees it, so a board
            // turned a quarter around still answers "up" with "away from me".
            const quarter = this._board ? this._board.quarterTurns() : 0;
            for (let i = 0; i < quarter; i++) {
                const t = dr; dr = -dc; dc = t;
            }

            const r = Math.max(0, Math.min(7, rowOf(this._cursor) + dr));
            const c = Math.max(0, Math.min(7, colOf(this._cursor) + dc));
            const next = sq(r, c);
            if (next === this._cursor) return;
            this._cursor = next;
            se('cursor');
            this._board.setCursor(next);
        }

        chooseSquare(idx) {
            const chess = this.chess;
            if (this._selected < 0) {
                const piece = chess.pieceAt(idx);
                if (piece === EMPTY || colorOf(piece) !== WHITE) {
                    se('illegal');
                    return;
                }
                if (!chess.isPlayerCheating() && chess.movesFrom(idx).length === 0) {
                    se('illegal');
                    return;
                }
                this._selected = idx;
                se('pick');
                this.refreshHints();
                return;
            }

            if (idx === this._selected) {
                this._selected = -1;
                se('cursor');
                this.refreshHints();
                return;
            }

            // A legal move first; a cheat only where no legal move fits, so a
            // cheat is never spent on something the rules already allowed.
            const legal = this._hints.filter(m => m.to === idx);
            if (legal.length) {
                if (legal.length > 1 && legal[0].promo) {
                    this.askPromotion(legal);
                    return;
                }
                this.playPlayerMove(legal[0]);
                return;
            }

            if (chess.isPlayerCheating()) {
                const cheat = chess.cheatMove(this._selected, idx);
                if (cheat) {
                    chess.useCheatMove();
                    this.playPlayerMove(cheat, true);
                    return;
                }
            }

            // Clicking another of your own men picks that one up instead.
            const piece = chess.pieceAt(idx);
            if (piece !== EMPTY && colorOf(piece) === WHITE) {
                this._selected = idx;
                se('pick');
                this.refreshHints();
                return;
            }
            se('illegal');
        }

        askPromotion(moves) {
            this._state = STATE.PROMOTE;
            this._pendingPromotion = moves;
            this._card.open(T('Chess.ui.promote'), moves.map(m => ({
                value: m,
                label: T('Chess.pieceName.' + typeOf(m.promo))
            })), T('Chess.ui.promoteHint'));
        }

        updatePromotion() {
            if (Input.isTriggered('up')) this._card.move(-1);
            if (Input.isTriggered('down')) this._card.move(1);
            if (Input.isTriggered('ok')) {
                const move = this._card.current().value;
                this._card.close();
                this._pendingPromotion = null;
                se('promote');
                this.playPlayerMove(move);
            } else if (Input.isTriggered('cancel')) {
                this._card.close();
                this._pendingPromotion = null;
                this._state = STATE.PLAYER;
                se('cursor');
            }
        }

        playPlayerMove(move, cheated) {
            const chess = this.chess;
            const notation = chess.play(move);
            if (cheated) {
                chess.moveLog.pop();
                chess.addToLog(T('Chess.whiteCheats', { move: notation }));
            }
            this._selected = -1;
            this.applyEvents();
            this.soundForMove(move, notation);
            this.refreshHints();
            this.refreshHUD();
            this._state = STATE.ANIMATING;
            this._afterAnimation = () => this.afterPlayerMove();
        }

        afterPlayerMove() {
            const ending = this.chess.checkGameEnd();
            if (ending) return this.endGame();
            this._state = STATE.THINKING;
            this._wait = 22;
            this._status.setText(T('Chess.ui.opponentThinking'));
        }

        //--- the opponent's turn ---------------------------------------------

        updateThinking() {
            if (this._wait > 0) { this._wait--; return; }
            const chess = this.chess;
            const kind = chess.takeAiTurn();
            this._aiKind = kind;
            this.applyEvents();
            this.soundForChaos(kind);
            if (kind === 'none') chess.addToLog(T('Chess.blackStuck'));
            this.refreshHUD();
            this._state = STATE.ANIMATING;
            this._afterAnimation = () => this.afterOpponentMove();
        }

        afterOpponentMove() {
            const chess = this.chess;
            // Black finding nothing to play is itself an ending, and it has to be
            // read while the move is still Black's or it reads as White's.
            if (this._aiKind === 'none' && chess.checkGameEnd()) return this.endGame();
            // A chaos action is not a move and does not hand the turn back on its
            // own, so it is handed back here.
            if (chess.turn() === BLACK) chess.pos.turn = WHITE;
            if (chess.checkGameEnd()) return this.endGame();
            if (inCheck(chess.pos, WHITE)) se('check');
            this._state = STATE.PLAYER;
            this.refreshHints();
            this.refreshHUD();
            this._status.setText(T('Chess.ui.yourMove'));
        }

        updateAnimating() {
            if (this._board.isBusy()) return;
            const done = this._afterAnimation;
            this._afterAnimation = null;
            if (done) done();
        }

        //--- events ----------------------------------------------------------

        // Everything the game did since the last frame, applied to the board in
        // the order it happened. A 'kill' is drained before the 'move' that
        // caused it, so the loser is already falling as the winner lands.
        applyEvents() {
            for (const ev of this.chess.drainEvents()) {
                switch (ev.t) {
                    case 'kill': this._board.killPiece(ev.at); break;
                    case 'move': this._board.movePiece(ev.from, ev.to, { capture: ev.capture }); break;
                    case 'spawn': this._board.addPiece(ev.at, ev.piece, ev.creature); break;
                    case 'remove': this._board.removePiece(ev.at); break;
                    case 'morph': this._board.morphPiece(ev.at, ev.piece, ev.creature); break;
                    case 'charged': se('charged'); break;
                }
            }
        }

        soundForMove(move, notation) {
            if (move.flag === F_CASTLE_K || move.flag === F_CASTLE_Q) se('castle');
            else if (move.cap) se('capture');
            else se('drop', { pitch: 95 + Math.floor(Math.random() * 15) });
            if (move.promo) se('promote');
            if (notation.endsWith('#')) se('mate');
            else if (notation.endsWith('+')) se('check');
        }

        soundForChaos(kind) {
            switch (kind) {
                case 'spawn': se('chaos'); break;
                case 'morph': se('morph'); break;
                case 'drain': se('steal'); break;
                case 'multi': se('multi'); break;
                default: break;
            }
        }

        //--- display ---------------------------------------------------------

        refreshHints() {
            const chess = this.chess;
            if (!chess) return;
            this._hints = this._selected >= 0 ? chess.movesFrom(this._selected) : [];
            this._board.setCursor(this._cursor);
            this._board.setSelected(this._selected);
            this._board.setMoveHints(this._hints);
            this._board.setLastMove(chess.lastMove);
            const checked = inCheck(chess.pos, chess.turn());
            this._board.setCheck(checked ? chess.pos.kingSquare(chess.turn()) : -1);
        }

        refreshHUD() {
            const chess = this.chess;
            if (!chess) return;

            const checked = inCheck(chess.pos, chess.turn());
            const balance = chess.materialBalance();
            this._header.setState({
                mode: chess.gameMode === 'chaos' ? T('Chess.modeChaos') : T('Chess.modeNormal'),
                turn: chess.gameEnded ? T('Chess.ui.finished')
                    : (chess.turn() === WHITE ? T('Chess.ui.white') : T('Chess.ui.black')),
                note: checked ? T('Chess.ui.check') : '',
                material: balance === 0 ? T('Chess.ui.level')
                    : T('Chess.ui.material', { value: (balance > 0 ? '+' : '') + balance })
            });

            this._log.setLines(this.recordLines());
            if (chess.gameMode === 'chaos') {
                this._chatter.setLines(this.chatterLines());
                this._meter.setState(chess.cheatMeter, chess.maxCheatMeter,
                    chess.canActivateCheatMode(), chess.isPlayerCheating(), chess.cheatMoves);
            }
        }

        // The score sheet: numbered pairs, White then Black, the last ten shown.
        // The panel beside it holds prose, which is why the two are kept apart
        // rather than one being parsed back out of the other.
        recordLines() {
            const sheet = this.chess.sheet;
            const lines = [];
            for (let i = 0; i < sheet.length; i += 2) {
                const n = (i >> 1) + 1;
                const white = sheet[i] || '';
                const black = sheet[i + 1] || '';
                lines.push(n + '. ' + white + '  ' + black);
            }
            return lines.slice(-10);
        }

        chatterLines() {
            return this.chess.moveLog.slice(-6);
        }

        //--- ending ----------------------------------------------------------

        endGame() {
            const chess = this.chess;
            this._state = STATE.OVER;
            this._selected = -1;
            this._hints = [];
            this._board.setSelected(-1);
            this._board.setMoveHints([]);
            this.refreshHUD();

            const result = chess.result;
            const title = result === 'win' ? T('Chess.ui.victory')
                : (result === 'loss' ? T('Chess.ui.defeat') : T('Chess.ui.drawn'));
            this._result.show(title, T('Chess.end.' + chess.endReason), result);
            this._status.setText('');

            se(result === 'win' ? 'win' : (result === 'loss' ? 'lose' : 'draw'));
            if (window.MinigameFun) {
                if (result === 'win') window.MinigameFun.won('Chess');
                else if (result === 'loss') window.MinigameFun.lost('Chess');
                else window.MinigameFun.draw('Chess');
            }
        }

        updateOver() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        //--- teardown --------------------------------------------------------

        terminate() {
            super.terminate();
            for (const dom of CHESS_DOMS) dom.destroy();
            CHESS_DOMS = [];
            if (this._boardSprite) {
                if (this._boardSprite.parent) this._boardSprite.parent.removeChild(this._boardSprite);
                this._boardSprite.destroy();
                this._boardSprite = null;
            }
            if (this._board) {
                this._board.dispose();
                this._board = null;
            }
            if (window.tempChessMode) delete window.tempChessMode;
        }
    }

    //=========================================================================
    // Plugin commands
    //=========================================================================
    PluginManager.registerCommand(PLUGIN, 'startNormalChess', () => {
        window.tempChessMode = 'normal';
        SceneManager.push(Scene_Chess);
    });

    PluginManager.registerCommand(PLUGIN, 'startChaosChess', () => {
        window.tempChessMode = 'chaos';
        SceneManager.push(Scene_Chess);
    });

    PluginManager.registerCommand(PLUGIN, 'startChess', () => {
        SceneManager.push(Scene_Chess);
    });

    window.Scene_Chess = Scene_Chess;
})();
